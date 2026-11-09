/**
 * In-memory rate limiting for authentication endpoints
 * Helps mitigate brute force attacks and credential stuffing
 */

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  blocked: boolean;
  blockExpiresAt?: number;
}

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
}

// Default configuration: 5 attempts per 15 minutes, 15 minute block
const DEFAULT_CONFIG: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDurationMs: 15 * 60 * 1000, // 15 minutes
};

// In-memory store (cleared on server restart - use Redis/DB for production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.blocked && entry.blockExpiresAt && entry.blockExpiresAt < now) {
      // Unblock expired entries
      rateLimitStore.delete(key);
    } else if (!entry.blocked && entry.firstAttempt + entry.lastAttempt < now - 24 * 60 * 60 * 1000) {
      // Remove entries older than 24 hours
      rateLimitStore.delete(key);
    }
  }
}, 60 * 60 * 1000); // Run cleanup every hour

/**
 * Check if a key is rate limited
 * @param key - Unique identifier (IP address + endpoint, or API key identifier)
 * @param config - Optional rate limit configuration
 * @returns Object with isLimited status and remaining attempts
 */
export function checkRateLimit(
  key: string,
  config: Partial<RateLimitConfig> = {}
): { isLimited: boolean; remainingAttempts: number; blocked: boolean; blockExpiresAt?: number } {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // If entry is blocked, check if block has expired
  if (entry?.blocked) {
    if (entry.blockExpiresAt && entry.blockExpiresAt > now) {
      return {
        isLimited: true,
        remainingAttempts: 0,
        blocked: true,
        blockExpiresAt: entry.blockExpiresAt,
      };
    } else {
      // Block expired, remove entry
      rateLimitStore.delete(key);
    }
  }

  if (!entry) {
    return {
      isLimited: false,
      remainingAttempts: fullConfig.maxAttempts,
      blocked: false,
    };
  }

  // Reset if window has passed
  if (now - entry.firstAttempt > fullConfig.windowMs) {
    rateLimitStore.delete(key);
    return {
      isLimited: false,
      remainingAttempts: fullConfig.maxAttempts,
      blocked: false,
    };
  }

  const remainingAttempts = Math.max(0, fullConfig.maxAttempts - entry.attempts);

  return {
    isLimited: entry.attempts >= fullConfig.maxAttempts,
    remainingAttempts,
    blocked: false,
  };
}

/**
 * Record a failed attempt
 * @param key - Unique identifier
 * @param config - Optional rate limit configuration
 * @returns Object with isBlocked status and block expiration
 */
export function recordFailedAttempt(
  key: string,
  config: Partial<RateLimitConfig> = {}
): { isBlocked: boolean; blockExpiresAt?: number } {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.firstAttempt > fullConfig.windowMs) {
    // New entry or window expired
    rateLimitStore.set(key, {
      attempts: 1,
      firstAttempt: now,
      lastAttempt: now,
      blocked: false,
    });

    return {
      isBlocked: false,
    };
  }

  entry.attempts++;
  entry.lastAttempt = now;

  // Block if max attempts reached
  if (entry.attempts >= fullConfig.maxAttempts) {
    entry.blocked = true;
    entry.blockExpiresAt = now + fullConfig.blockDurationMs;
    rateLimitStore.set(key, entry);

    return {
      isBlocked: true,
      blockExpiresAt: entry.blockExpiresAt,
    };
  }

  rateLimitStore.set(key, entry);
  return { isBlocked: false };
}

/**
 * Clear rate limit for a key (e.g., after successful authentication)
 * @param key - Unique identifier
 */
export function clearRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Get client IP from request headers
 * (Works with Next.js and behind proxies)
 */
export function getClientIP(request: Request): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwardedFor) {
    // Get first IP from X-Forwarded-For chain
    return forwardedFor.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  return null;
}

export type { RateLimitConfig, RateLimitEntry };
