import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableName } from './aws/index.js';

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a user or API key owner has access to a session.
 * - If session has participants, check if userId is in the participant list
 * - If no participants (legacy/Slack/API-initiated sessions), anyone with a valid key can access
 * @param sessionId - The session ID to check
 * @param userId - The Cognito user ID or API key owner ID attempting access
 * @returns AccessCheckResult indicating if access is allowed
 */
export async function checkSessionAccess(
  sessionId: string,
  userId: string | undefined
): Promise<AccessCheckResult> {
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

  // Check if ANY participants exist for this session
  const participantCheck = await ddb.send(
    new QueryCommand({
      TableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `session-participants-${sessionId}`,
      },
      Limit: 1,
    })
  );

  const participantCount = participantCheck.Items?.length ?? 0;

  // If session has no participants (legacy/API/Slack-initiated), allow access
  if (participantCount === 0) {
    return { allowed: true };
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

  if (!userIsParticipant) {
    return { allowed: false, reason: 'You are not a participant of this session' };
  }

  return { allowed: true };
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
