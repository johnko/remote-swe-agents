import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { savePushSubscription } from '@remote-swe-agents/agent-core/lib';
import { z } from 'zod';

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),  // Limit URL length
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]+$/).max(256),  // Base64url validation
    auth: z.string().regex(/^[A-Za-z0-9_-]+$/).max(256),  // Base64url validation
  }),
});

// Sanitize endpoint URL to prevent SSRF and injection attacks
function sanitizeEndpoint(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    // Only allow HTTPS endpoints for security
    if (url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getSession();
    const body = await request.json();
    const parsed = subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 });
    }

    // Additional sanitization for the endpoint
    const sanitizedEndpoint = sanitizeEndpoint(parsed.data.endpoint);
    if (!sanitizedEndpoint) {
      return NextResponse.json({ error: 'Invalid endpoint URL - HTTPS only' }, { status: 400 });
    }

    // Create sanitized copy of data
    const sanitizedData = {
      ...parsed.data,
      endpoint: sanitizedEndpoint,
    };

    await savePushSubscription(userId, sanitizedData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save push subscription:', error);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }
}
