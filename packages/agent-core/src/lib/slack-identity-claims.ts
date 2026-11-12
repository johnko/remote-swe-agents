import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableName } from './aws/index.js';
import {
  SlackIdentityClaim,
  SlackIdentityClaimStatus,
  CLAIM_EXPIRY_MS,
  CLAIM_MIN_WAIT_MS,
} from '../schema/slack-identity-claim.js';

/**
 * Create a new Slack identity claim
 * Called when a Slack user creates or participates in a session
 *
 * Uses existing table structure: PK = session-claims#{sessionId}
 * This allows querying by session without requiring a GSI
 */
export async function createSlackIdentityClaim(params: {
  slackUserId: string;
  sessionId: string;
  evidence: {
    slackChannelId: string;
    slackThreadTs: string;
    firstMessageTs: string;
  };
}): Promise<SlackIdentityClaim> {
  const { slackUserId, sessionId, evidence } = params;
  const now = Date.now();

  const claim: SlackIdentityClaim = {
    PK: `session-claims#${sessionId}`,
    SK: slackUserId,
    slackUserId,
    sessionId,
    status: 'pending',
    createdAt: now,
    expiresAt: now + CLAIM_EXPIRY_MS,
    evidence,
  };

  await ddb.send(
    new PutCommand({
      TableName,
      Item: claim,
    })
  );

  return claim;
}

/**
 * Get a specific Slack identity claim
 */
export async function getSlackIdentityClaim(
  slackUserId: string,
  sessionId: string
): Promise<SlackIdentityClaim | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName,
      Key: {
        PK: `session-claims#${sessionId}`,
        SK: slackUserId,
      },
    })
  );

  return result.Item as SlackIdentityClaim | undefined;
}

/**
 * Get all pending claims for a session
 * Uses existing table structure - queries by PK prefix
 * No GSI required!
 */
export async function getPendingClaimsForSession(sessionId: string): Promise<SlackIdentityClaim[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName,
      KeyConditionExpression: 'PK = :pk',
      FilterExpression: '#status = :pending AND expiresAt > :now',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':pk': `session-claims#${sessionId}`,
        ':pending': 'pending',
        ':now': Date.now(),
      },
    })
  );

  return (result.Items ?? []) as SlackIdentityClaim[];
}

/**
 * Approve a Slack identity claim
 * Links the Slack user ID to a Cognito user ID
 */
export async function approveSlackIdentityClaim(params: {
  slackUserId: string;
  sessionId: string;
  cognitoUserId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { slackUserId, sessionId, cognitoUserId } = params;

  const claim = await getSlackIdentityClaim(slackUserId, sessionId);

  if (!claim) {
    return { success: false, error: 'Claim not found' };
  }

  if (claim.status !== 'pending') {
    return { success: false, error: `Claim already ${claim.status}` };
  }

  if (claim.expiresAt < Date.now()) {
    return { success: false, error: 'Claim has expired' };
  }

  // Enforce minimum wait period (prevents race conditions)
  if (Date.now() - claim.createdAt < CLAIM_MIN_WAIT_MS) {
    const remainingMs = CLAIM_MIN_WAIT_MS - (Date.now() - claim.createdAt);
    return {
      success: false,
      error: `Please wait ${Math.ceil(remainingMs / 1000)} seconds before approving this claim`,
    };
  }

  await ddb.send(
    new UpdateCommand({
      TableName,
      Key: {
        PK: `session-claims#${sessionId}`,
        SK: slackUserId,
      },
      UpdateExpression: 'SET #status = :approved, cognitoUserId = :cognitoUserId, resolvedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':approved': 'approved' as SlackIdentityClaimStatus,
        ':cognitoUserId': cognitoUserId,
        ':now': Date.now(),
      },
    })
  );

  return { success: true };
}

/**
 * Reject a Slack identity claim
 */
export async function rejectSlackIdentityClaim(params: {
  slackUserId: string;
  sessionId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { slackUserId, sessionId } = params;

  const claim = await getSlackIdentityClaim(slackUserId, sessionId);

  if (!claim) {
    return { success: false, error: 'Claim not found' };
  }

  if (claim.status !== 'pending') {
    return { success: false, error: `Claim already ${claim.status}` };
  }

  await ddb.send(
    new UpdateCommand({
      TableName,
      Key: {
        PK: `session-claims#${sessionId}`,
        SK: slackUserId,
      },
      UpdateExpression: 'SET #status = :rejected, resolvedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':rejected': 'rejected' as SlackIdentityClaimStatus,
        ':now': Date.now(),
      },
    })
  );

  return { success: true };
}

/**
 * Check if a Slack user has a linked Cognito identity for a session
 * Returns the Cognito user ID if approved, undefined otherwise
 */
export async function getLinkedCognitoUserId(slackUserId: string, sessionId: string): Promise<string | undefined> {
  const claim = await getSlackIdentityClaim(slackUserId, sessionId);

  if (claim && claim.status === 'approved' && claim.cognitoUserId) {
    return claim.cognitoUserId;
  }

  return undefined;
}

/**
 * Get all approved Slack-Cognito mappings for a session
 * Used to grant webapp access to approved Slack users
 */
export async function getApprovedSlackUsersForSession(sessionId: string): Promise<
  Array<{
    slackUserId: string;
    cognitoUserId: string;
    approvedAt: number;
  }>
> {
  const result = await ddb.send(
    new QueryCommand({
      TableName,
      KeyConditionExpression: 'PK = :pk',
      FilterExpression: '#status = :approved',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':pk': `session-claims#${sessionId}`,
        ':approved': 'approved',
      },
    })
  );

  return (result.Items ?? []).map((item) => ({
    slackUserId: item.slackUserId as string,
    cognitoUserId: item.cognitoUserId as string,
    approvedAt: item.resolvedAt as number,
  }));
}

/**
 * Get claim counts for a session (for UI "pending approvals" badge)
 */
export async function getClaimCounts(sessionId: string): Promise<{
  pending: number;
  approved: number;
  rejected: number;
}> {
  const result = await ddb.send(
    new QueryCommand({
      TableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `session-claims#${sessionId}`,
      },
    })
  );

  const items = (result.Items ?? []) as SlackIdentityClaim[];

  return {
    pending: items.filter((i) => i.status === 'pending').length,
    approved: items.filter((i) => i.status === 'approved').length,
    rejected: items.filter((i) => i.status === 'rejected').length,
  };
}
