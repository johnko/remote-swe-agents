import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  createSlackIdentityClaim,
  getSlackIdentityClaim,
  getPendingClaimsForSession,
  approveSlackIdentityClaim,
  rejectSlackIdentityClaim,
  getLinkedCognitoUserId,
  getApprovedSlackUsersForSession,
  getClaimCounts,
} from './slack-identity-claims.js';
import { CLAIM_EXPIRY_MS, CLAIM_MIN_WAIT_MS } from '../schema/slack-identity-claim.js';

const mockDdbSend = vi.fn();
const mockTableName = 'test-table';

vi.mock('./aws/index.js', () => ({
  ddb: { send: (...args: any[]) => mockDdbSend(...args) },
  TableName: 'test-table',
}));

describe('slack-identity-claims', () => {
  beforeEach(() => {
    mockDdbSend.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSlackIdentityClaim', () => {
    test('creates claim with correct structure', async () => {
      const now = 1000000000000;
      vi.setSystemTime(now);

      mockDdbSend.mockResolvedValue({});

      const result = await createSlackIdentityClaim({
        slackUserId: 'U12345',
        sessionId: 'session-abc',
        evidence: {
          slackChannelId: 'C67890',
          slackThreadTs: '1234567890.123456',
          firstMessageTs: '1234567890.123456',
        },
      });

      expect(result.PK).toBe('session-claims#session-abc');
      expect(result.SK).toBe('U12345');
      expect(result.slackUserId).toBe('U12345');
      expect(result.sessionId).toBe('session-abc');
      expect(result.status).toBe('pending');
      expect(result.createdAt).toBe(now);
      expect(result.expiresAt).toBe(now + CLAIM_EXPIRY_MS);
      expect(result.evidence.slackChannelId).toBe('C67890');

      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-table',
            Item: expect.objectContaining({
              PK: 'session-claims#session-abc',
              SK: 'U12345',
              status: 'pending',
            }),
          }),
        })
      );
    });

    test('sets expiry to 24 hours from creation', async () => {
      const now = 1000000000000;
      vi.setSystemTime(now);
      mockDdbSend.mockResolvedValue({});

      await createSlackIdentityClaim({
        slackUserId: 'U12345',
        sessionId: 'session-abc',
        evidence: {
          slackChannelId: 'C67890',
          slackThreadTs: '1234567890.123456',
          firstMessageTs: '1234567890.123456',
        },
      });

      const call = mockDdbSend.mock.calls[0][0];
      expect(call.input.Item.expiresAt).toBe(now + 24 * 60 * 60 * 1000);
    });
  });

  describe('getSlackIdentityClaim', () => {
    test('returns claim when found', async () => {
      const mockClaim = {
        PK: 'session-claims#session-abc',
        SK: 'U12345',
        slackUserId: 'U12345',
        sessionId: 'session-abc',
        status: 'pending',
        createdAt: 1000000000000,
        expiresAt: 1000864000000,
        evidence: {
          slackChannelId: 'C67890',
          slackThreadTs: '1234567890.123456',
          firstMessageTs: '1234567890.123456',
        },
      };

      mockDdbSend.mockResolvedValue({ Item: mockClaim });

      const result = await getSlackIdentityClaim('U12345', 'session-abc');

      expect(result).toEqual(mockClaim);
      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-table',
            Key: {
              PK: 'session-claims#session-abc',
              SK: 'U12345',
            },
          }),
        })
      );
    });

    test('returns undefined when not found', async () => {
      mockDdbSend.mockResolvedValue({});

      const result = await getSlackIdentityClaim('U12345', 'session-abc');

      expect(result).toBeUndefined();
    });
  });

  describe('getPendingClaimsForSession', () => {
    test('queries with correct filter for pending non-expired claims', async () => {
      const now = 1000000000000;
      vi.setSystemTime(now);

      // Note: FilterExpression is applied by DynamoDB, not returned in mocked Items
      // We just verify the correct query parameters are sent
      mockDdbSend.mockResolvedValue({ Items: [] });

      await getPendingClaimsForSession('session-abc');

      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-table',
            KeyConditionExpression: 'PK = :pk',
            FilterExpression: '#status = :pending AND expiresAt > :now',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':pk': 'session-claims#session-abc',
              ':pending': 'pending',
              ':now': now,
            },
          }),
        })
      );
    });

    test('returns empty array when no claims', async () => {
      mockDdbSend.mockResolvedValue({ Items: [] });

      const result = await getPendingClaimsForSession('session-abc');

      expect(result).toEqual([]);
    });
  });

  describe('approveSlackIdentityClaim', () => {
    test('approves pending claim after minimum wait', async () => {
      const now = 1000000000000;
      vi.setSystemTime(now);

      const mockClaim = {
        PK: 'session-claims#session-abc',
        SK: 'U12345',
        slackUserId: 'U12345',
        sessionId: 'session-abc',
        status: 'pending',
        createdAt: now - CLAIM_MIN_WAIT_MS - 1000, // Created 6 minutes ago
        expiresAt: now + 10000,
        evidence: {
          slackChannelId: 'C67890',
          slackThreadTs: '1234567890.123456',
          firstMessageTs: '1234567890.123456',
        },
      };

      mockDdbSend
        .mockResolvedValueOnce({ Item: mockClaim }) // getSlackIdentityClaim
        .mockResolvedValueOnce({}); // update

      const result = await approveSlackIdentityClaim({
        slackUserId: 'U12345',
        sessionId: 'session-abc',
        cognitoUserId: 'us-east-2:uuid-123',
      });

      expect(result.success).toBe(true);
      expect(mockDdbSend).toHaveBeenCalledTimes(2);

      const updateCall = mockDdbSend.mock.calls[1][0];
      expect(updateCall.input.UpdateExpression).toContain('approved');
      expect(updateCall.input.ExpressionAttributeValues[':cognitoUserId']).toBe('us-east-2:uuid-123');
    });

    test('rejects approval before minimum wait', async () => {
      const now = 1000000000000;
      vi.setSystemTime(now);

      const mockClaim = {
        PK: 'session-claims#session-abc',
        SK: 'U12345',
        slackUserId: 'U12345',
        status: 'pending',
        createdAt: now - 60000, // Created 1 minute ago (too recent)
        expiresAt: now + 10000,
        evidence: {
          slackChannelId: 'C67890',
          slackThreadTs: '1234567890.123456',
          firstMessageTs: '1234567890.123456',
        },
      };

      mockDdbSend.mockResolvedValueOnce({ Item: mockClaim });

      const result = await approveSlackIdentityClaim({
        slackUserId: 'U12345',
        sessionId: 'session-abc',
        cognitoUserId: 'us-east-2:uuid-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('wait');
      expect(mockDdbSend).toHaveBeenCalledTimes(1); // Only the get, not the update
    });

    test('rejects approval for expired claim', async () => {
      const now = 1000000000000;
      vi.setSystemTime(now);

      const mockClaim = {
        PK: 'session-claims#session-abc',
        SK: 'U12345',
        slackUserId: 'U12345',
        status: 'pending',
        createdAt: now - 100000,
        expiresAt: now - 1000, // Already expired
        evidence: {
          slackChannelId: 'C67890',
          slackThreadTs: '1234567890.123456',
          firstMessageTs: '1234567890.123456',
        },
      };

      mockDdbSend.mockResolvedValueOnce({ Item: mockClaim });

      const result = await approveSlackIdentityClaim({
        slackUserId: 'U12345',
        sessionId: 'session-abc',
        cognitoUserId: 'us-east-2:uuid-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    test('rejects approval for already approved claim', async () => {
      const now = 1000000000000;
      vi.setSystemTime(now);

      const mockClaim = {
        PK: 'session-claims#session-abc',
        SK: 'U12345',
        slackUserId: 'U12345',
        status: 'approved', // Already approved
        createdAt: now - 100000,
        expiresAt: now + 10000,
        cognitoUserId: 'us-east-2:existing-user',
        evidence: {
          slackChannelId: 'C67890',
          slackThreadTs: '1234567890.123456',
          firstMessageTs: '1234567890.123456',
        },
      };

      mockDdbSend.mockResolvedValueOnce({ Item: mockClaim });

      const result = await approveSlackIdentityClaim({
        slackUserId: 'U12345',
        sessionId: 'session-abc',
        cognitoUserId: 'us-east-2:uuid-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already approved');
    });

    test('rejects approval for non-existent claim', async () => {
      mockDdbSend.mockResolvedValueOnce({}); // No item found

      const result = await approveSlackIdentityClaim({
        slackUserId: 'U12345',
        sessionId: 'session-abc',
        cognitoUserId: 'us-east-2:uuid-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claim not found');
    });
  });

  describe('rejectSlackIdentityClaim', () => {
    test('rejects pending claim', async () => {
      const now = 1000000000000;
      vi.setSystemTime(now);

      const mockClaim = {
        PK: 'session-claims#session-abc',
        SK: 'U12345',
        slackUserId: 'U12345',
        status: 'pending',
        createdAt: now - 100000,
        expiresAt: now + 10000,
        evidence: {
          slackChannelId: 'C67890',
          slackThreadTs: '1234567890.123456',
          firstMessageTs: '1234567890.123456',
        },
      };

      mockDdbSend.mockResolvedValueOnce({ Item: mockClaim }).mockResolvedValueOnce({});

      const result = await rejectSlackIdentityClaim({
        slackUserId: 'U12345',
        sessionId: 'session-abc',
      });

      expect(result.success).toBe(true);

      const updateCall = mockDdbSend.mock.calls[1][0];
      expect(updateCall.input.UpdateExpression).toContain('rejected');
      expect(updateCall.input.ExpressionAttributeValues[':now']).toBe(now);
    });

    test('rejects rejection for already rejected claim', async () => {
      const now = 1000000000000;
      vi.setSystemTime(now);

      const mockClaim = {
        PK: 'session-claims#session-abc',
        SK: 'U12345',
        slackUserId: 'U12345',
        status: 'rejected', // Already rejected
        createdAt: now - 100000,
        expiresAt: now + 10000,
        resolvedAt: now - 5000,
        evidence: {
          slackChannelId: 'C67890',
          slackThreadTs: '1234567890.123456',
          firstMessageTs: '1234567890.123456',
        },
      };

      mockDdbSend.mockResolvedValueOnce({ Item: mockClaim });

      const result = await rejectSlackIdentityClaim({
        slackUserId: 'U12345',
        sessionId: 'session-abc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already rejected');
    });
  });

  describe('getLinkedCognitoUserId', () => {
    test('returns cognito user ID for approved claim', async () => {
      mockDdbSend.mockResolvedValue({
        Item: {
          PK: 'session-claims#session-abc',
          SK: 'U12345',
          slackUserId: 'U12345',
          status: 'approved',
          cognitoUserId: 'us-east-2:uuid-123',
        },
      });

      const result = await getLinkedCognitoUserId('U12345', 'session-abc');

      expect(result).toBe('us-east-2:uuid-123');
    });

    test('returns undefined for pending claim', async () => {
      mockDdbSend.mockResolvedValue({
        Item: {
          PK: 'session-claims#session-abc',
          SK: 'U12345',
          slackUserId: 'U12345',
          status: 'pending',
        },
      });

      const result = await getLinkedCognitoUserId('U12345', 'session-abc');

      expect(result).toBeUndefined();
    });

    test('returns undefined for rejected claim', async () => {
      mockDdbSend.mockResolvedValue({
        Item: {
          PK: 'session-claims#session-abc',
          SK: 'U12345',
          slackUserId: 'U12345',
          status: 'rejected',
          cognitoUserId: 'us-east-2:uuid-123', // Should be ignored
        },
      });

      const result = await getLinkedCognitoUserId('U12345', 'session-abc');

      expect(result).toBeUndefined();
    });

    test('returns undefined when claim not found', async () => {
      mockDdbSend.mockResolvedValue({});

      const result = await getLinkedCognitoUserId('U12345', 'session-abc');

      expect(result).toBeUndefined();
    });
  });

  describe('getApprovedSlackUsersForSession', () => {
    test('queries with correct filter for approved users', async () => {
      mockDdbSend.mockResolvedValue({ Items: [] });

      await getApprovedSlackUsersForSession('session-abc');

      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-table',
            KeyConditionExpression: 'PK = :pk',
            FilterExpression: '#status = :approved',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':pk': 'session-claims#session-abc',
              ':approved': 'approved',
            },
          }),
        })
      );
    });

    test('returns empty array when no claims', async () => {
      mockDdbSend.mockResolvedValue({ Items: [] });

      const result = await getApprovedSlackUsersForSession('session-abc');

      expect(result).toEqual([]);
    });

    test('maps approved claims to result format', async () => {
      const mockClaims = [
        {
          PK: 'session-claims#session-abc',
          SK: 'U12345',
          slackUserId: 'U12345',
          cognitoUserId: 'us-east-2:user-1',
          status: 'approved',
          resolvedAt: 1000000000000,
        },
      ];

      mockDdbSend.mockResolvedValue({ Items: mockClaims });

      const result = await getApprovedSlackUsersForSession('session-abc');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        slackUserId: 'U12345',
        cognitoUserId: 'us-east-2:user-1',
        approvedAt: 1000000000000,
      });
    });
  });

  describe('getClaimCounts', () => {
    test('returns counts by status', async () => {
      const mockClaims = [
        { PK: 'session-claims#session-abc', SK: 'U1', status: 'pending' },
        { PK: 'session-claims#session-abc', SK: 'U2', status: 'pending' },
        { PK: 'session-claims#session-abc', SK: 'U3', status: 'approved' },
        { PK: 'session-claims#session-abc', SK: 'U4', status: 'rejected' },
        { PK: 'session-claims#session-abc', SK: 'U5', status: 'rejected' },
      ];

      mockDdbSend.mockResolvedValue({ Items: mockClaims });

      const result = await getClaimCounts('session-abc');

      expect(result).toEqual({
        pending: 2,
        approved: 1,
        rejected: 2,
      });
    });

    test('returns zero counts for empty session', async () => {
      mockDdbSend.mockResolvedValue({ Items: [] });

      const result = await getClaimCounts('session-abc');

      expect(result).toEqual({
        pending: 0,
        approved: 0,
        rejected: 0,
      });
    });
  });

  describe('Security constants', () => {
    test('CLAIM_EXPIRY_MS is 24 hours', () => {
      expect(CLAIM_EXPIRY_MS).toBe(24 * 60 * 60 * 1000);
    });

    test('CLAIM_MIN_WAIT_MS is 5 minutes', () => {
      expect(CLAIM_MIN_WAIT_MS).toBe(5 * 60 * 1000);
    });
  });
});
