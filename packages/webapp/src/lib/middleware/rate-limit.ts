/**
 * Rate limiting middleware for Next.js API routes
 * Uses DynamoDB to track request counts per user session across Lambda instances
 */

import { NextRequest, NextResponse } from 'next/server';
import { ddb, TableName } from '@remote-swe-agents/agent-core/aws';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Rate limit configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 120; // 120 requests per minute
const RATE_LIMIT_BURST = 10; // Allow burst of 10 requests

interface RateLimitConfig {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
}

/**
 * Get rate limit key from request
 * Prioritizes: Session ID > API Key ID > IP Address
 */
function getRateLimitKey(request: NextRequest): string {
  // Try to get from session header or cookie first
  const sessionId = request.headers.get('x-session-id') || 
                   request.cookies.get('session')?.value;
  if (sessionId) {
    return `ratelimit:session:${sessionId}`;
  }

  // Fall back to API key
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    return `ratelimit:apikey:${apiKey.slice(0, 16)}`;
  }

  // Last resort: IP address (may not work behind proxies)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0] || 
            request.headers.get('x-real-ip') || 
            'unknown';
  return `ratelimit:ip:${ip}`;
}

/**
 * Check if request is within rate limit
 */
export async function checkRateLimit(
  request: NextRequest,
  config?: RateLimitConfig
): Promise<{ allowed: boolean; resetTime: number; remaining: number }> {
  const windowMs = config?.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const maxRequests = config?.maxRequests ?? RATE_LIMIT_MAX_REQUESTS;
  const key = config?.keyPrefix ? `${config.keyPrefix}:${getRateLimitKey(request)}` : getRateLimitKey(request);
  
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const windowEnd = windowStart + windowMs;

  // Check if DDB connection is available
  if (!ddb) {
    console.warn('[rate-limit] DynamoDB not available, allowing request');
    return { allowed: true, resetTime: windowEnd, remaining: maxRequests };
  }

  try {
    // Try to get current count
    const result = await ddb.send(
      new GetCommand({
        TableName,
        Key: {
          PK: key,
          SK: 'current',
        },
      })
    );

    const item = result.Item;

    if (!item) {
      // First request in this window
      await ddb.send(
        new PutCommand({
          TableName,
          Item: {
            PK: key,
            SK: 'current',
            count: 1,
            windowStart,
            TTL: Math.floor(windowEnd / 1000) + 60, // 1 min past window
          },
        })
      );
      return { allowed: true, resetTime: windowEnd, remaining: maxRequests - 1 };
    }

    // Check if we're in a new window
    const storedWindowStart = item.windowStart as number;
    if (storedWindowStart < windowStart) {
      // New window started, reset counter
      await ddb.send(
        new PutCommand({
          TableName,
          Item: {
            PK: key,
            SK: 'current',
            count: 1,
            windowStart,
            TTL: Math.floor(windowEnd / 1000) + 60,
          },
        })
      );
      return { allowed: true, resetTime: windowEnd, remaining: maxRequests - 1 };
    }

    const currentCount = (item.count as number) || 0;

    if (currentCount >= maxRequests) {
      return { allowed: false, resetTime: windowEnd, remaining: 0 };
    }

    // Increment counter
    await ddb.send(
      new UpdateCommand({
        TableName,
        Key: {
          PK: key,
          SK: 'current',
        },
        UpdateExpression: 'SET count = count + :inc',
        ExpressionAttributeValues: {
          ':inc': 1,
        },
      })
    );

    return { allowed: true, resetTime: windowEnd, remaining: maxRequests - currentCount - 1 };

  } catch (error) {
    console.error('[rate-limit] DDB error:', error);
    // Fail open on errors but log
    return { allowed: true, resetTime: windowEnd, remaining: maxRequests };
  }
}

/**
 * Apply rate limiting to a request
 */
export async function rateLimitMiddleware(
  request: NextRequest,
  config?: RateLimitConfig
): Promise<NextResponse | null> {
  const { allowed, resetTime, remaining } = await checkRateLimit(request, config);

  if (!allowed) {
    const response = NextResponse.json(
      { error: 'Too many requests. Please try again later.', retryAfter: Math.ceil((resetTime - Date.now()) / 1000) },
      { status: 429 }
    );
    
    response.headers.set('X-RateLimit-Limit', String(config?.maxRequests ?? RATE_LIMIT_MAX_REQUESTS));
    response.headers.set('X-RateLimit-Remaining', '0');
    response.headers.set('X-RateLimit-Reset', String(Math.floor(resetTime / 1000)));
    response.headers.set('Retry-After', String(Math.ceil((resetTime - Date.now()) / 1000)));
    
    return response;
  }

  // Don't return response for successful case - let route handle it
  return null;
}

/**
 * Add rate limit headers to a successful response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  maxRequests: number = RATE_LIMIT_MAX_REQUESTS
): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(maxRequests));
  response.headers.set('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  response.headers.set('X-RateLimit-Policy', `${maxRequests};window=60`);
  return response;
}
