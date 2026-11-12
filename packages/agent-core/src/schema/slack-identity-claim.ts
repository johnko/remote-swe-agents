import { z } from 'zod';

/**
 * Status of a Slack identity claim
 */
export const slackIdentityClaimStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired']);

export type SlackIdentityClaimStatus = z.infer<typeof slackIdentityClaimStatusSchema>;

/**
 * Schema for Slack identity claim items stored in DynamoDB
 * Used to link Slack user IDs to Cognito user IDs with explicit approval
 * 
 * Uses existing table structure: PK = session-claims#${sessionId}
 * This allows querying by session without requiring a GSI
 */
export const slackIdentityClaimSchema = z.object({
  /**
   * Primary key: session-claims#${sessionId}
   * Groups all claims for a session, enables direct query
   */
  PK: z.string(),
  /**
   * Sort key: slackUserId (identifies the Slack user)
   */
  SK: z.string(),
  /**
   * Slack user ID (e.g., U12345)
   */
  slackUserId: z.string(),
  /**
   * Cognito user ID - set after approval
   */
  cognitoUserId: z.string().optional(),
  /**
   * Session ID the claim is for
   */
  sessionId: z.string(),
  /**
   * Current status of the claim
   */
  status: slackIdentityClaimStatusSchema,
  /**
   * Timestamp when claim was created
   */
  createdAt: z.number(),
  /**
   * Timestamp when claim expires (TTL)
   */
  expiresAt: z.number(),
  /**
   * Timestamp when claim was resolved (approved/rejected)
   */
  resolvedAt: z.number().optional(),
  /**
   * Session evidence proving Slack user participation
   */
  evidence: z.object({
    slackChannelId: z.string(),
    slackThreadTs: z.string(),
    firstMessageTs: z.string(),
  }),
});

export type SlackIdentityClaim = z.infer<typeof slackIdentityClaimSchema>;

/**
 * Maximum time (in milliseconds) a claim remains valid
 * Default: 24 hours
 */
export const CLAIM_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Minimum time (in milliseconds) before a claim can be approved
 * Prevents race conditions and social engineering attacks
 */
export const CLAIM_MIN_WAIT_MS = 5 * 60 * 1000; // 5 minutes
