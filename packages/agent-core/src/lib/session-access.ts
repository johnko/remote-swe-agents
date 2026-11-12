import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableName } from './aws/index.js';
import { getApprovedSlackUsersForSession } from './slack-identity-claims.js';

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a user or API key owner has access to a session.
 * Users must be explicit participants OR have an approved Slack identity claim.
 * @param sessionId - The session ID to check
 * @param userId - The Cognito user ID or API key owner ID attempting access
 * @returns AccessCheckResult indicating if access is allowed
 */
export async function checkSessionAccess(sessionId: string, userId: string | undefined): Promise<AccessCheckResult> {
  if (!userId) {
    return { allowed: false, reason: 'No user identity provided' };
  }

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
    return { allowed: false, reason: 'Session not found' };
  }

  // Check if user is a participant
  const userParticipantResult = await ddb.send(
    new GetCommand({
      TableName,
      Key: {
        PK: `session-participants-${sessionId}`,
        SK: userId,
      },
    })
  );

  const userIsParticipant = !!userParticipantResult.Item;

  if (userIsParticipant) {
    return { allowed: true };
  }

  // Check if this user has an approved Slack identity claim for this session
  // This allows Slack-initiated sessions to be accessible by approved webapp users
  const approvedSlackUsers = await getApprovedSlackUsersForSession(sessionId);
  const hasApprovedClaim = approvedSlackUsers.some((claim) => claim.cognitoUserId === userId);

  if (hasApprovedClaim) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'You are not a participant of this session' };
}

/**
 * Check if a user is a participant of a session (helper for webapp auth)
 */
export async function isSessionParticipant(sessionId: string, userId: string): Promise<boolean> {
  const result = await ddb.send(
    new GetCommand({
      TableName,
      Key: {
        PK: `session-participants-${sessionId}`,
        SK: userId,
      },
    })
  );
  return !!result.Item;
}
