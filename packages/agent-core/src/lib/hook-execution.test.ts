import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { executeHooksForEvent, executeHooksForEventWithSession, extractUserIdFromSession } from './hook-execution.js';
import * as hooksModule from './hooks.js';
import { Hook, HookEventType } from '../schema/hook.js';
import { SessionItem } from '../schema/session.js';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('./hooks.js', () => ({
  listHooksByEvent: vi.fn(),
}));

describe('extractUserIdFromSession', () => {
  test('extracts userId from slack#user123 format', () => {
    const session = { initiator: 'slack#user123' } as SessionItem;
    expect(extractUserIdFromSession(session)).toBe('user123');
  });

  test('returns initiator as-is when no # present', () => {
    const session = { initiator: 'user@example.com' } as SessionItem;
    expect(extractUserIdFromSession(session)).toBe('user@example.com');
  });

  test('returns undefined when session has no initiator', () => {
    const session = {} as SessionItem;
    expect(extractUserIdFromSession(session)).toBeUndefined();
  });

  test('returns undefined for undefined session', () => {
    expect(extractUserIdFromSession(undefined)).toBeUndefined();
  });
});

describe('executeHooksForEvent', () => {
  const mockExecSync = vi.mocked(execSync);
  const mockListHooksByEvent = vi.mocked(hooksModule.listHooksByEvent);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns empty result when no hooks found', async () => {
    mockListHooksByEvent.mockResolvedValue([]);

    const result = await executeHooksForEvent({
      sessionId: 'test-session',
      event: 'sessionStart' as HookEventType,
      userId: 'test-user',
    });

    expect(result).toEqual({
      hooksExecuted: 0,
      hooksSkipped: 0,
      errors: [],
      logs: [],
    });
    expect(result.combinedOutput).toBeUndefined();
  });

  test('executes command hooks and captures output', async () => {
    const hooks: Hook[] = [
      {
        PK: 'hook-test-user',
        SK: 'hook-1',
        name: 'title-reminder',
        event: 'sessionStart' as HookEventType,
        command: 'echo "Remember to set session title"',
        isEnabled: true,
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockListHooksByEvent.mockResolvedValue(hooks);
    mockExecSync.mockReturnValue('Remember to set session title\n');

    const result = await executeHooksForEvent({
      sessionId: 'test-session',
      event: 'sessionStart' as HookEventType,
      userId: 'test-user',
    });

    expect(result.hooksExecuted).toBe(1);
    expect(result.hooksSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]).toEqual({
      hookName: 'title-reminder',
      output: 'Remember to set session title',
    });
    expect(result.combinedOutput).toContain('[Hook: title-reminder]');
    expect(result.combinedOutput).toContain('Remember to set session title');
  });

  test('executes multiple hooks and combines output', async () => {
    const hooks: Hook[] = [
      {
        PK: 'hook-test-user',
        SK: 'hook-1',
        name: 'reminder-1',
        event: 'sessionStart' as HookEventType,
        command: 'echo "First reminder"',
        isEnabled: true,
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        PK: 'hook-test-user',
        SK: 'hook-2',
        name: 'reminder-2',
        event: 'sessionStart' as HookEventType,
        command: 'echo "Second reminder"',
        isEnabled: true,
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockListHooksByEvent.mockResolvedValue(hooks);
    mockExecSync
      .mockReturnValueOnce('First reminder\n')
      .mockReturnValueOnce('Second reminder\n');

    const result = await executeHooksForEvent({
      sessionId: 'test-session',
      event: 'sessionStart' as HookEventType,
      userId: 'test-user',
    });

    expect(result.hooksExecuted).toBe(2);
    expect(result.combinedOutput).toContain('[Hook: reminder-1]');
    expect(result.combinedOutput).toContain('First reminder');
    expect(result.combinedOutput).toContain('[Hook: reminder-2]');
    expect(result.combinedOutput).toContain('Second reminder');
  });

  test('filters empty outputs from combinedOutput', async () => {
    const hooks: Hook[] = [
      {
        PK: 'hook-test-user',
        SK: 'hook-1',
        name: 'silent-hook',
        event: 'sessionStart' as HookEventType,
        command: 'echo ""',
        isEnabled: true,
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        PK: 'hook-test-user',
        SK: 'hook-2',
        name: 'verbose-hook',
        event: 'sessionStart' as HookEventType,
        command: 'echo "Has content"',
        isEnabled: true,
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockListHooksByEvent.mockResolvedValue(hooks);
    mockExecSync
      .mockReturnValueOnce('\n   \n') // whitespace-only output
      .mockReturnValueOnce('Has content\n');

    const result = await executeHooksForEvent({
      sessionId: 'test-session',
      event: 'sessionStart' as HookEventType,
      userId: 'test-user',
    });

    expect(result.hooksExecuted).toBe(2);
    // Only the non-empty output should appear in combinedOutput
    expect(result.combinedOutput).toContain('[Hook: verbose-hook]');
    expect(result.combinedOutput).toContain('Has content');
    expect(result.combinedOutput).not.toContain('[Hook: silent-hook]');
  });

  test('handles hook execution errors gracefully', async () => {
    const hooks: Hook[] = [
      {
        PK: 'hook-test-user',
        SK: 'hook-1',
        name: 'failing-hook',
        event: 'sessionStart' as HookEventType,
        command: 'exit 1',
        isEnabled: true,
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockListHooksByEvent.mockResolvedValue(hooks);
    const error = new Error('Command failed: exit 1') as any;
    error.stdout = Buffer.from('');
    error.stderr = Buffer.from('Error message');
    mockExecSync.mockImplementation(() => {
      throw error;
    });

    const result = await executeHooksForEvent({
      sessionId: 'test-session',
      event: 'sessionStart' as HookEventType,
      userId: 'test-user',
    });

    expect(result.hooksExecuted).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].hookName).toBe('failing-hook');
    expect(result.errors[0].error).toContain('Command execution failed');
    // Empty output should not appear in combinedOutput
    expect(result.combinedOutput).toBeUndefined();
  });

  test('handles hooks without command or script', async () => {
    const hooks: Hook[] = [
      {
        PK: 'hook-test-user',
        SK: 'hook-1',
        name: 'empty-hook',
        event: 'sessionStart' as HookEventType,
        isEnabled: true,
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockListHooksByEvent.mockResolvedValue(hooks);

    const result = await executeHooksForEvent({
      sessionId: 'test-session',
      event: 'sessionStart' as HookEventType,
      userId: 'test-user',
    });

    expect(result.hooksExecuted).toBe(0);
    expect(result.hooksSkipped).toBe(1);
    expect(result.combinedOutput).toBeUndefined();
  });

  test('executes inline script hooks', async () => {
    const hooks: Hook[] = [
      {
        PK: 'hook-test-user',
        SK: 'hook-1',
        name: 'script-hook',
        event: 'sessionStart' as HookEventType,
        script: 'console.log("Script output")',
        isEnabled: true,
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockListHooksByEvent.mockResolvedValue(hooks);
    mockExecSync.mockReturnValue('Script output\n');

    const result = await executeHooksForEvent({
      sessionId: 'test-session',
      event: 'sessionStart' as HookEventType,
      userId: 'test-user',
    });

    expect(result.hooksExecuted).toBe(1);
    expect(result.logs[0].hookName).toBe('script-hook');
    expect(result.combinedOutput).toContain('[Hook: script-hook]');
  });
});

describe('executeHooksForEventWithSession', () => {
  const mockListHooksByEvent = vi.mocked(hooksModule.listHooksByEvent);
  const mockExecSync = vi.mocked(execSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('executes hooks when userId can be extracted from session', async () => {
    const session: SessionItem = {
      PK: 'sessions',
      SK: 'test-session',
      workerId: 'test-session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      LSI1: 'webapp#test-user',
      initiator: 'webapp#test-user',
      initialMessage: 'Hello',
      instanceStatus: 'running',
    } as SessionItem;

    mockListHooksByEvent.mockResolvedValue([
      {
        PK: 'hook-test-user',
        SK: 'hook-1',
        name: 'test-hook',
        event: 'sessionStart' as HookEventType,
        command: 'echo "test"',
        isEnabled: true,
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    mockExecSync.mockReturnValue('test\n');

    const result = await executeHooksForEventWithSession(session, 'sessionStart' as HookEventType, '/tmp');

    expect(result.hooksExecuted).toBe(1);
    expect(result.combinedOutput).toBeDefined();
  });

  test('returns empty result when userId cannot be extracted', async () => {
    const session: SessionItem = {
      PK: 'sessions',
      SK: 'test-session',
      workerId: 'test-session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      LSI1: 'test-session',
    } as SessionItem;

    const result = await executeHooksForEventWithSession(session, 'sessionStart' as HookEventType);

    expect(result.hooksExecuted).toBe(0);
    expect(result.hooksSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.logs).toHaveLength(0);
    expect(result.combinedOutput).toBeUndefined();
  });

  test('returns empty result when session is undefined', async () => {
    const result = await executeHooksForEventWithSession(undefined, 'sessionStart' as HookEventType);

    expect(result.hooksExecuted).toBe(0);
    expect(result.hooksSkipped).toBe(0);
    expect(result.combinedOutput).toBeUndefined();
  });

  test('sets context data as environment variables', async () => {
    const session: SessionItem = {
      PK: 'sessions',
      SK: 'test-session',
      workerId: 'test-session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      LSI1: 'webapp#test-user',
      initiator: 'webapp#test-user',
      initialMessage: 'Hello',
      instanceStatus: 'running',
    } as SessionItem;

    mockListHooksByEvent.mockResolvedValue([
      {
        PK: 'hook-test-user',
        SK: 'hook-1',
        name: 'test-hook',
        event: 'beforeShellExecution' as HookEventType,
        command: 'echo "$HOOK_COMMAND"',
        isEnabled: true,
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    mockExecSync.mockReturnValue('echo hello\n');

    await executeHooksForEventWithSession(
      session,
      'beforeShellExecution' as HookEventType,
      '/tmp',
      { command: 'echo hello', sessionId: 'test-session' }
    );

    // Verify execSync was called with env containing HOOK_ variables
    const call = mockExecSync.mock.calls[0];
    expect(call).toBeDefined();
    const options = call[1] as { env: Record<string, string> };
    expect(options.env.HOOK_COMMAND).toBe('echo hello');
    expect(options.env.HOOK_SESSION_ID).toBe('test-session');
  });
});
