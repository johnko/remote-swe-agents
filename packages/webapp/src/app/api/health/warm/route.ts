import { setTimeout } from 'timers/promises';
import { NextResponse } from 'next/server';

// Rate limiting map (in-memory, per Lambda instance)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now > entry.resetTime) {
    // New window or expired
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  entry.count++;
  return true;
}

export async function GET(request: Request) {
  // Get client IP for rate limiting
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   request.headers.get('x-real-ip') ||
                   'unknown';

  // Check rate limit
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Use variable delay to prevent timing attack fingerprinting
  const delay = 150 + Math.floor(Math.random() * 100); // 150-250ms random delay
  await setTimeout(delay);

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
