import { NextRequest, NextResponse } from 'next/server';
import { ddb, TableName } from '@remote-swe-agents/agent-core/aws';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

export interface SecurityHeaders {
  'X-Content-Type-Options': string;
  'X-Frame-Options': string;
  'X-XSS-Protection': string;
  'Strict-Transport-Security': string;
  'Content-Security-Policy': string;
  'Referrer-Policy': string;
}

export function getSecurityHeaders(): SecurityHeaders {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https:;",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

// Apply security headers to a response
export function applySecurityHeaders(response: NextResponse): NextResponse {
  const headers = getSecurityHeaders();
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

// Path traversal prevention
export function sanitizePath(input: string): string | null {
  // Remove null bytes
  const cleaned = input.replace(/\0/g, '');
  
  // Normalize separators
  const normalized = cleaned.replace(/\\/g, '/');
  
  // Reject path traversal attempts
  if (normalized.includes('..') || normalized.startsWith('/')) {
    return null;
  }
  
  // Reject empty strings
  if (normalized.length === 0) {
    return null;
  }
  
  return normalized;
}

// Session ID validation
export function isValidSessionId(sessionId: string): boolean {
  // Session IDs should be alphanumeric with hyphens, reasonable length
  const sessionIdRegex = /^session-[a-zA-Z0-9_-]+$/;
  return sessionIdRegex.test(sessionId) && sessionId.length <= 256;
}

// Check if a session exists and user has access
export async function checkSessionAccessAuthorized(
  sessionId: string,
  userId: string
): Promise<{ allowed: boolean; sessionExists: boolean }> {
  // Check if session exists
  const sessionResult = await ddb.send(
    new GetCommand({
      TableName,
      Key: {
        PK: 'sessions',
        SK: sessionId,
      },
    })
  );

  if (!sessionResult.Item) {
    return { allowed: false, sessionExists: false };
  }

  // Check if user is a participant
  const participantResult = await ddb.send(
    new GetCommand({
      TableName,
      Key: {
        PK: `session-participants-${sessionId}`,
        SK: userId,
      },
    })
  );

  // Check if any participants exist
  const participants = await ddb.send(
    new QueryCommand({
      TableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `session-participants-${sessionId}`,
      },
      Limit: 1,
    })
  );

  const hasAnyParticipants = (participants.Items?.length ?? 0) > 0;
  const isParticipant = !!participantResult.Item;

  // If session has participants, user must be one of them
  if (hasAnyParticipants && !isParticipant) {
    return { allowed: false, sessionExists: true };
  }

  return { allowed: true, sessionExists: true };
}
