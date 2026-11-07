import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  PermissionHookResult,
  defaultAllowResult,
  parsePermissionResult,
  buildHookInput,
} from './hook-execution.js';
import type { HookExecutionContext, HookContextData } from './hook-execution.js';
import { HookEventType } from '../schema/hook.js';

describe('PermissionHookResult types', () => {
  test('defaultAllowResult is defined', () => {
    expect(defaultAllowResult).toEqual({
      continue: true,
      permission: 'allow',
    });
  });

  test('PermissionHookResult interface allows all permission values', () => {
    const allowResult: PermissionHookResult = {
      continue: true,
      permission: 'allow',
    };
    expect(allowResult.permission).toBe('allow');

    const denyResult: PermissionHookResult = {
      continue: true,
      permission: 'deny',
      userMessage: 'Blocked for safety',
    };
    expect(denyResult.permission).toBe('deny');

    const askResult: PermissionHookResult = {
      continue: true,
      permission: 'ask',
      userMessage: 'Needs approval',
    };
    expect(askResult.permission).toBe('ask');
  });
});

describe('buildHookInput', () => {
  test('builds hook input with all context data', () => {
    const context: HookExecutionContext = {
      sessionId: 'test-session',
      event: 'beforeShellExecution' as HookEventType,
      userId: 'test-user',
      workingDirectory: '/tmp',
      contextData: {
        command: 'echo hello',
        sessionId: 'test-session',
      },
    };

    const input = buildHookInput(context);

    expect(input).toEqual({
      event: 'beforeShellExecution',
      sessionId: 'test-session',
      userId: 'test-user',
      workingDirectory: '/tmp',
      context: {
        command: 'echo hello',
        sessionId: 'test-session',
      },
    });
  });

  test('builds hook input without context data', () => {
    const context: HookExecutionContext = {
      sessionId: 'test-session',
      event: 'sessionStart' as HookEventType,
      userId: 'test-user',
      workingDirectory: '/tmp',
    };

    const input = buildHookInput(context);

    expect(input).toEqual({
      event: 'sessionStart',
      sessionId: 'test-session',
      userId: 'test-user',
      workingDirectory: '/tmp',
      context: undefined,
    });
  });
});

describe('parsePermissionResult', () => {
  test('parses allow JSON response', () => {
    const json = JSON.stringify({ continue: true, permission: 'allow' });
    const result = parsePermissionResult(json);
    expect(result).toEqual({
      continue: true,
      permission: 'allow',
    });
  });

  test('parses deny JSON response', () => {
    const json = JSON.stringify({
      continue: true,
      permission: 'deny',
      user_message: 'Command blocked',
      agent_message: 'Agent sees this',
    });
    const result = parsePermissionResult(json);
    expect(result).toEqual({
      continue: true,
      permission: 'deny',
      userMessage: 'Command blocked',
      agentMessage: 'Agent sees this',
    });
  });

  test('parses ask JSON response', () => {
    const json = JSON.stringify({
      continue: true,
      permission: 'ask',
      user_message: 'Needs confirmation',
    });
    const result = parsePermissionResult(json);
    expect(result).toEqual({
      continue: true,
      permission: 'ask',
      userMessage: 'Needs confirmation',
    });
  });

  test('parses updatedCommand from JSON', () => {
    const json = JSON.stringify({
      continue: true,
      permission: 'allow',
      updated_command: 'echo modified',
    });
    const result = parsePermissionResult(json);
    expect(result.updatedCommand).toBe('echo modified');
  });

  test('parses updatedToolInput from JSON', () => {
    const json = JSON.stringify({
      continue: true,
      permission: 'allow',
      updated_tool_input: { key: 'value' },
    });
    const result = parsePermissionResult(json);
    expect(result.updatedToolInput).toEqual({ key: 'value' });
  });

  test('returns default allow for invalid JSON', () => {
    const result = parsePermissionResult('invalid json');
    expect(result).toEqual(defaultAllowResult);
  });

  test('returns default allow for empty string', () => {
    const result = parsePermissionResult('');
    expect(result).toEqual(defaultAllowResult);
  });

  test('returns default allow for JSON without permission field', () => {
    const json = JSON.stringify({ continue: true, other: 'data' });
    const result = parsePermissionResult(json);
    expect(result).toEqual(defaultAllowResult);
  });

  test('returns default allow for JSON with invalid permission value', () => {
    const json = JSON.stringify({ continue: true, permission: 'invalid' });
    const result = parsePermissionResult(json);
    expect(result).toEqual(defaultAllowResult);
  });

  test('handles camelCase field names', () => {
    const json = JSON.stringify({
      continue: true,
      permission: 'deny',
      userMessage: 'Blocked',
      agentMessage: 'Agent sees',
      updatedCommand: 'echo test',
      updatedToolInput: { foo: 'bar' },
    });
    const result = parsePermissionResult(json);
    expect(result.userMessage).toBe('Blocked');
    expect(result.agentMessage).toBe('Agent sees');
    expect(result.updatedCommand).toBe('echo test');
    expect(result.updatedToolInput).toEqual({ foo: 'bar' });
  });

  test('snake_case takes precedence over camelCase', () => {
    const json = JSON.stringify({
      continue: true,
      permission: 'deny',
      user_message: 'Snake message',
      userMessage: 'Camel message',
    });
    const result = parsePermissionResult(json);
    expect(result.userMessage).toBe('Snake message');
  });
});
