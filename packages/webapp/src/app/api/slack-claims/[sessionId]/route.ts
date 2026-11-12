import { NextRequest, NextResponse } from 'next/server';
import {
  getPendingClaimsForSession,
  getClaimCounts,
} from '@remote-swe-agents/agent-core/lib';
import { getSession } from '@remote-swe-agents/agent-core/lib';

interface RouteParams {
  params: Promise<{
    sessionId: string;
  }>;
}

/**
 * GET /api/slack-claims/[sessionId]
 * Returns pending and resolved Slack identity claims for a session
 * Requires authenticated session (handled by middleware)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Get session ID from the URL params
    const { sessionId } = await params;

    // Check if session exists
    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get pending claims (already filtered by backend)
    const claims = await getPendingClaimsForSession(sessionId);

    // Get claim counts for badge/pagination display
    const counts = await getClaimCounts(sessionId);

    return NextResponse.json(
      {
        claims,
        counts,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[slack-claims API] Error fetching claims:', error);
    return NextResponse.json(
      { error: 'Failed to fetch claims' },
      { status: 500 }
    );
  }
}
