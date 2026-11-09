import { getApiKeySenderInfo, validateApiKey } from '@remote-swe-agents/agent-core/lib';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, recordFailedAttempt, clearRateLimit, getClientIP } from '@/lib/auth-brute-force-limiter';

/**
 * API key format validation constants
 * Expected format: 64-character hexadecimal string (32 bytes)
 */
const API_KEY_MIN_LENGTH = 64;
const API_KEY_MAX_LENGTH = 128; // Allow for potential format variations
const API_KEY_PATTERN = /^[a-f0-9]+$/i; // Hexadecimal pattern only

/**
 * Validate API key format before expensive database lookup
 * This prevents timing attacks and reduces database load
 */
function isValidApiKeyFormat(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') return false;
  if (apiKey.length < API_KEY_MIN_LENGTH || apiKey.length > API_KEY_MAX_LENGTH) return false;
  if (!API_KEY_PATTERN.test(apiKey)) return false;
  return true;
}

/**
 * Identification info for an authenticated API-key request. Used by routes
 * that record the request as a "user message" so we can attribute the
 * message to the specific API key (rather than the generic "User") in both
 * the LLM prompt envelope and the webapp UI.
 */
export type ApiKeySenderInfo = {
  /** Stable, non-secret id derived from the key itself (`apikey-xxxxxxxxxxxx`). */
  id: string;
  /** Human-readable name (the key's `description`, or the derived id when blank). */
  displayName: string;
  /** Optional Cognito user id of the key's owner. */
  ownerId?: string;
};

/**
 * Result of API-key validation:
 *   - `{ ok: false, response }` when validation failed; the caller should
 *     return `response` immediately.
 *   - `{ ok: true, sender }` when validation succeeded; `sender` carries the
 *     key's stable id and human-readable name for attribution.
 */
export type ApiKeyAuthResult = { ok: false; response: NextResponse } | { ok: true; sender: ApiKeySenderInfo };

// Rate limit configuration for API key authentication
const RATE_LIMIT_CONFIG = {
  maxAttempts: 10, // More lenient for API keys vs passwords
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDurationMs: 60 * 60 * 1000, // 1 hour block for brute force
};

/**
 * Get rate limit key (IP address)
 */
function getRateLimitKey(request: NextRequest): string {
  const clientIP = getClientIP(request as unknown as Request);
  return clientIP || 'unknown-ip';
}

/**
 * Authenticate a request via the `x-api-key` header and return the key's
 * sender attribution info on success. Returns a `NextResponse` to bubble up
 * to the caller on failure.
 * 
 * SECURITY: Implements rate limiting to prevent brute force attacks
 * SECURITY: Validates API key format before expensive DB lookup to prevent timing attacks
 */
export async function authenticateApiKey(request: NextRequest): Promise<ApiKeyAuthResult> {
  // Extract API key from x-api-key header
  const apiKey = request.headers.get('x-api-key');

  // Check rate limit first (throttle before expensive operations)
  const rateLimitKey = getRateLimitKey(request);
  const rateLimit = checkRateLimit(`apikey_auth:${rateLimitKey}`, RATE_LIMIT_CONFIG);

  if (rateLimit.isLimited) {
    const retryAfter = rateLimit.blockExpiresAt
      ? Math.ceil((rateLimit.blockExpiresAt - Date.now()) / 1000)
      : RATE_LIMIT_CONFIG.blockDurationMs / 1000;

    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too many failed authentication attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfter)) },
        }
      ),
    };
  }

  if (!apiKey) {
    // Record failed attempt for missing key
    recordFailedAttempt(`apikey_auth:${rateLimitKey}`, RATE_LIMIT_CONFIG);
    return { ok: false, response: NextResponse.json({ error: 'Missing API key' }, { status: 401 }) };
  }

  // Validate API key format before expensive DB lookup
  if (!isValidApiKeyFormat(apiKey)) {
    recordFailedAttempt(`apikey_auth:${rateLimitKey}`, RATE_LIMIT_CONFIG);
    return { ok: false, response: NextResponse.json({ error: 'Invalid API key format' }, { status: 401 }) };
  }

  const sender = await getApiKeySenderInfo(apiKey);
  if (!sender) {
    // Record failed attempt and check if we should block
    const { isBlocked, blockExpiresAt } = recordFailedAttempt(`apikey_auth:${rateLimitKey}`, RATE_LIMIT_CONFIG);

    if (isBlocked) {
      const retryAfter = blockExpiresAt ? Math.ceil((blockExpiresAt - Date.now()) / 1000) : 3600;
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Too many failed authentication attempts. Please try again later.' },
          {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
          }
        ),
      };
    }

    return { ok: false, response: NextResponse.json({ error: 'Invalid API key' }, { status: 401 }) };
  }

  // Clear failed attempts on successful authentication
  clearRateLimit(`apikey_auth:${rateLimitKey}`);

  return { ok: true, sender };
}

/**
 * Backward-compatible middleware wrapper retained for routes that only need
 * a yes/no auth check and do not record sender attribution. New routes
 * SHOULD prefer `authenticateApiKey` so they can populate sender info on
 * any messages they persist.
 * 
 * SECURITY: Implements rate limiting to prevent brute force attacks
 * SECURITY: Validates API key format before expensive DB lookup
 */
export async function validateApiKeyMiddleware(request: NextRequest): Promise<NextResponse | undefined> {
  // Check rate limit first
  const rateLimitKey = getRateLimitKey(request);
  const rateLimit = checkRateLimit(`apikey_auth:${rateLimitKey}`, RATE_LIMIT_CONFIG);

  if (rateLimit.isLimited) {
    const retryAfter = rateLimit.blockExpiresAt
      ? Math.ceil((rateLimit.blockExpiresAt - Date.now()) / 1000)
      : RATE_LIMIT_CONFIG.blockDurationMs / 1000;

    return NextResponse.json(
      { error: 'Too many failed authentication attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(retryAfter)) },
      }
    );
  }

  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    recordFailedAttempt(`apikey_auth:${rateLimitKey}`, RATE_LIMIT_CONFIG);
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  // Validate API key format before expensive DB lookup
  if (!isValidApiKeyFormat(apiKey)) {
    recordFailedAttempt(`apikey_auth:${rateLimitKey}`, RATE_LIMIT_CONFIG);
    return NextResponse.json({ error: 'Invalid API key format' }, { status: 401 });
  }

  const isValid = await validateApiKey(apiKey);

  if (!isValid) {
    // Record failed attempt and check if we should block
    const { isBlocked, blockExpiresAt } = recordFailedAttempt(`apikey_auth:${rateLimitKey}`, RATE_LIMIT_CONFIG);

    if (isBlocked) {
      const retryAfter = blockExpiresAt ? Math.ceil((blockExpiresAt - Date.now()) / 1000) : 3600;
      return NextResponse.json(
        { error: 'Too many failed authentication attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        }
      );
    }

    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // Clear failed attempts on successful authentication
  clearRateLimit(`apikey_auth:${rateLimitKey}`);

  return undefined;
}
