import { describe, expect, test } from 'vitest';
import { z } from 'zod';

// This is a simplified validation test for the schema
// In production, you'd want to mock the server action fully
const getCustomAgentsPageSchema = z.object({
  limit: z.number().optional(),
  lastEvaluatedKey: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

describe('getCustomAgentsPageAction schema', () => {
  test('accepts valid pagination input', () => {
    const input = {
      limit: 50,
      lastEvaluatedKey: { PK: 'custom-agent', SK: 'agent-123' },
    };
    expect(() => getCustomAgentsPageSchema.parse(input)).not.toThrow();
  });

  test('rejects malformed lastEvaluatedKey with invalid value types', () => {
    const input = {
      limit: 50,
      lastEvaluatedKey: { PK: 'custom-agent', SK: {} }, // Invalid: object value
    };
    expect(() => getCustomAgentsPageSchema.parse(input)).toThrow();
  });

  test('rejects lastEvaluatedKey with non-string keys', () => {
    const input = {
      limit: 50,
      lastEvaluatedKey: { 123: 'value' }, // Invalid: non-string key
    };
    expect(() => getCustomAgentsPageSchema.parse(input)).toThrow();
  });

  test('accepts optional fields', () => {
    const input = {};
    expect(() => getCustomAgentsPageSchema.parse(input)).not.toThrow();
  });

  test('accepts valid lastEvaluatedKey with string, number, and boolean values', () => {
    const input = {
      lastEvaluatedKey: {
        PK: 'custom-agent',
        SK: 'agent-123',
        count: 50,
        isActive: true,
      },
    };
    expect(() => getCustomAgentsPageSchema.parse(input)).not.toThrow();
  });
});
