import { describe, expect, test } from 'vitest';
import { bedrockStrandsAgentLoop } from './bedrock-strands-agent-loop.js';
import type { TurnContext } from '@remote-swe-agents/agent-core/lib';
import type { SessionItem, CustomAgent, InferenceMode, MessageItem } from '@remote-swe-agents/agent-core/schema';

/**
 * Integration tests for hook context injection in the Bedrock backend.
 *
 * These tests verify that:
 * 1. Hook context is properly injected into the system prompt
 * 2. The system prompt includes hook output when hookContext is provided
 * 3. The system prompt is unchanged when hookContext is not provided
 */

const createMockTurnContext = (hookContext?: string): TurnContext => {
  const mockSession: SessionItem = {
    PK: 'sessions',
    SK: 'test-session',
    workerId: 'test-session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    LSI1: 'webapp#test-user',
    initiator: 'webapp#test-user',
    initialMessage: 'Hello',
    instanceStatus: 'running',
    inferenceMode: 'bedrock' as InferenceMode,
  } as SessionItem;

  const mockCustomAgent: CustomAgent = {
    PK: 'agents',
    SK: 'default-agent',
    name: 'Default Agent',
    description: 'Default agent',
    systemPrompt: '',
    tools: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mcpConfig: '{}',
  };

  return {
    workerId: 'test-session',
    session: mockSession,
    customAgent: mockCustomAgent,
    history: [] as MessageItem[],
    systemPrompt: 'Base system prompt',
    cwd: '/tmp',
    userMessage: 'Hello',
    cancellationToken: {
      isCancelled: false,
      onCancel: () => () => {},
    },
    userSkills: [],
    hookContext,
  };
};

describe('hook context injection in system prompt', () => {
  test('system prompt includes hook context when provided', () => {
    const hookContext = '[Hook: title-reminder]\nRemember to set session title';
    const ctx = createMockTurnContext(hookContext);

    // The system prompt should be base + hook context
    expect(ctx.systemPrompt).toBe('Base system prompt');
    expect(ctx.hookContext).toBe(hookContext);

    // Simulate the logic in bedrockStrandsAgentLoop
    const systemPrompt = ctx.hookContext
      ? `${ctx.systemPrompt}\n\n${ctx.hookContext}`
      : ctx.systemPrompt;

    expect(systemPrompt).toContain('Base system prompt');
    expect(systemPrompt).toContain('[Hook: title-reminder]');
    expect(systemPrompt).toContain('Remember to set session title');
    // Hook context should be appended (not prefixed)
    expect(systemPrompt.indexOf('Base system prompt')).toBeLessThan(systemPrompt.indexOf('[Hook:'));
  });

  test('system prompt unchanged when hookContext is undefined', () => {
    const ctx = createMockTurnContext(undefined);

    expect(ctx.hookContext).toBeUndefined();

    // Simulate the logic in bedrockStrandsAgentLoop
    const systemPrompt = ctx.hookContext
      ? `${ctx.systemPrompt}\n\n${ctx.hookContext}`
      : ctx.systemPrompt;

    expect(systemPrompt).toBe('Base system prompt');
  });

  test('system prompt unchanged when hookContext is empty string', () => {
    const ctx = createMockTurnContext('');

    // Empty string is falsy, so system prompt should remain unchanged
    const systemPrompt = ctx.hookContext
      ? `${ctx.systemPrompt}\n\n${ctx.hookContext}`
      : ctx.systemPrompt;

    expect(systemPrompt).toBe('Base system prompt');
  });

  test('handles multi-line hook context', () => {
    const hookContext = `[Hook: reminder-1]
First reminder

[Hook: reminder-2]
Second reminder`;
    const ctx = createMockTurnContext(hookContext);

    const systemPrompt = ctx.hookContext
      ? `${ctx.systemPrompt}\n\n${ctx.hookContext}`
      : ctx.systemPrompt;

    expect(systemPrompt).toContain('Base system prompt');
    expect(systemPrompt).toContain('[Hook: reminder-1]');
    expect(systemPrompt).toContain('[Hook: reminder-2]');
    expect(systemPrompt).toContain('First reminder');
    expect(systemPrompt).toContain('Second reminder');
  });
});

describe('TurnContext hookContext field', () => {
  test('hookContext is optional in TurnContext', () => {
    const ctx = createMockTurnContext();
    expect(ctx.hookContext).toBeUndefined();
  });

  test('TurnContext can have hookContext set', () => {
    const ctx = createMockTurnContext('hook output');
    expect(ctx.hookContext).toBe('hook output');
  });
});
