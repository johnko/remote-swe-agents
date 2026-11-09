import { validateApiKeyMiddleware } from '../auth/api-key';
import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@remote-swe-agents/agent-core/lib';
import { z } from 'zod';
import { modelTypeSchema } from '@remote-swe-agents/agent-core/schema';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/middleware/rate-limit';

// Schema for request validation
const createSessionSchema = z.object({
  message: z.string().min(1).max(10000, { message: 'Message must be at most 10000 characters' }),
  modelOverride: modelTypeSchema.optional(),
});

// Rate limit: 30 session creations per minute per user
const SESSION_RATE_LIMIT = 30;

export async function POST(request: NextRequest) {
  // SECURITY FIX: Apply rate limiting before authentication
  const rateLimitResult = await checkRateLimit(request, {
    maxRequests: SESSION_RATE_LIMIT,
    keyPrefix: 'session-create',
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { 
        error: 'Too many requests. Please try again later.', 
        retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000) 
      },
      { status: 429 }
    );
  }

  // Validate API key
  const apiKeyValidation = await validateApiKeyMiddleware(request);
  if (apiKeyValidation) {
    return apiKeyValidation;
  }

  // Parse and validate request body
  const body = await request.json();
  const parsedBody = createSessionSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Invalid request data', details: parsedBody.error.format() }, { status: 400 });
  }

  const { message, modelOverride } = parsedBody.data;

  // SECURITY FIX: Validate message size to prevent resource exhaustion
  const messageSize = Buffer.byteLength(message, 'utf8');
  if (messageSize > 100 * 1024) { // 100KB limit
    return NextResponse.json(
      { error: 'Message too large. Maximum message size is 100KB.' },
      { status: 413 }
    );
  }

  const workerId = await createSession({
    message,
    initiator: `rest#`,
    modelOverride,
  });

  const response = NextResponse.json({ sessionId: workerId }, { status: 201 });
  return addRateLimitHeaders(response, rateLimitResult.remaining, SESSION_RATE_LIMIT);
}
