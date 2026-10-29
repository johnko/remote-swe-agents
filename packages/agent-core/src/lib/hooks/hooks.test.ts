import { describe, it, expect, beforeEach } from 'vitest';
import {
  HookRegistry,
  HookExecutor,
  HookLifecycleManager,
  HookEvent,
  HookExecutionType,
  HookDefinition,
  HookPermission,
  SessionStartPayload,
  ToolBeforePayload,
} from './index.js';

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  it('should register a hook', () => {
    const hookDef: HookDefinition = {
      name: 'test-hook',
      event: HookEvent.SESSION_START,
      type: HookExecutionType.COMMAND,
      command: 'echo test',
    };

    const hookId = registry.register(hookDef);
    expect(hookId).toBeDefined();
    expect(registry.getHookById(hookId)).toBeDefined();
  });

  it('should get hooks for a specific event', () => {
    const hookDef: HookDefinition = {
      name: 'test-hook',
      event: HookEvent.SESSION_START,
      type: HookExecutionType.COMMAND,
      command: 'echo test',
    };

    registry.register(hookDef);
    const hooks = registry.getHooksForEvent(HookEvent.SESSION_START);

    expect(hooks).toHaveLength(1);
    expect(hooks[0].name).toBe('test-hook');
  });

  it('should register hooks for multiple events', () => {
    const hookDef: HookDefinition = {
      name: 'multi-event-hook',
      event: [HookEvent.SESSION_START, HookEvent.SESSION_END],
      type: HookExecutionType.COMMAND,
      command: 'echo test',
    };

    registry.register(hookDef);

    const startHooks = registry.getHooksForEvent(HookEvent.SESSION_START);
    const endHooks = registry.getHooksForEvent(HookEvent.SESSION_END);

    expect(startHooks).toHaveLength(1);
    expect(endHooks).toHaveLength(1);
    expect(startHooks[0].id).toBe(endHooks[0].id);
  });

  it('should unregister a hook', () => {
    const hookDef: HookDefinition = {
      name: 'test-hook',
      event: HookEvent.SESSION_START,
      type: HookExecutionType.COMMAND,
      command: 'echo test',
    };

    const hookId = registry.register(hookDef);
    expect(registry.getHookById(hookId)).toBeDefined();

    const unregistered = registry.unregister(hookId);
    expect(unregistered).toBe(true);
    expect(registry.getHookById(hookId)).toBeUndefined();
  });

  it('should get blocking hooks for an event', () => {
    const blockingHook: HookDefinition = {
      name: 'blocking-hook',
      event: HookEvent.TOOL_BEFORE,
      type: HookExecutionType.COMMAND,
      command: 'echo test',
      blocking: true,
    };

    const nonBlockingHook: HookDefinition = {
      name: 'non-blocking-hook',
      event: HookEvent.TOOL_BEFORE,
      type: HookExecutionType.COMMAND,
      command: 'echo test',
      blocking: false,
    };

    registry.register(blockingHook);
    registry.register(nonBlockingHook);

    const blockingHooks = registry.getBlockingHooksForEvent(HookEvent.TOOL_BEFORE);
    expect(blockingHooks).toHaveLength(1);
    expect(blockingHooks[0].name).toBe('blocking-hook');
  });

  it('should return stats', () => {
    const hookDef1: HookDefinition = {
      name: 'hook1',
      event: HookEvent.SESSION_START,
      type: HookExecutionType.COMMAND,
      command: 'echo test',
    };

    const hookDef2: HookDefinition = {
      name: 'hook2',
      event: HookEvent.TOOL_BEFORE,
      type: HookExecutionType.COMMAND,
      command: 'echo test',
      blocking: true,
    };

    registry.register(hookDef1);
    registry.register(hookDef2);

    const stats = registry.getStats();
    expect(stats.total).toBe(2);
    expect(stats.blocking).toBe(1);
    expect(stats.byEvent[HookEvent.SESSION_START]).toBe(1);
    expect(stats.byEvent[HookEvent.TOOL_BEFORE]).toBe(1);
  });

  it('should skip disabled hooks', () => {
    const disabledHook: HookDefinition = {
      name: 'disabled-hook',
      event: HookEvent.SESSION_START,
      type: HookExecutionType.COMMAND,
      command: 'echo test',
      enabled: false,
    };

    registry.register(disabledHook);

    const hooks = registry.getHooksForEvent(HookEvent.SESSION_START);
    expect(hooks).toHaveLength(0);
  });

  it('should clear all hooks', () => {
    const hookDef: HookDefinition = {
      name: 'test-hook',
      event: HookEvent.SESSION_START,
      type: HookExecutionType.COMMAND,
      command: 'echo test',
    };

    registry.register(hookDef);
    expect(registry.getAllHooks()).toHaveLength(1);

    registry.clear();
    expect(registry.getAllHooks()).toHaveLength(0);
  });
});

describe('HookExecutor', () => {
  let executor: HookExecutor;

  beforeEach(() => {
    executor = new HookExecutor();
  });

  it('should execute a command-based hook successfully', async () => {
    const hook = {
      id: 'test-hook',
      name: 'test',
      event: HookEvent.SESSION_START,
      type: HookExecutionType.COMMAND,
      command: 'echo \'{"permission":"allow"}\'',
      blocking: false,
      timeout: 5000,
      registeredAt: Date.now(),
    };

    const payload: SessionStartPayload = {
      event: HookEvent.SESSION_START,
      timestamp: Date.now(),
      sessionId: 'test-session',
      userId: 'test-user',
    };

    const result = await executor.execute(hook, payload);

    expect(result.success).toBe(true);
    expect(result.response?.permission).toBe(HookPermission.ALLOW);
  });

  it('should handle hook execution failure gracefully', async () => {
    const hook = {
      id: 'test-hook',
      name: 'test',
      event: HookEvent.SESSION_START,
      type: HookExecutionType.COMMAND,
      command: 'exit 1',
      blocking: false,
      timeout: 5000,
      registeredAt: Date.now(),
    };

    const payload: SessionStartPayload = {
      event: HookEvent.SESSION_START,
      timestamp: Date.now(),
      sessionId: 'test-session',
      userId: 'test-user',
    };

    const result = await executor.execute(hook, payload);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should stop on first blocking denial', async () => {
    const blockingHook = {
      id: 'blocking-hook',
      name: 'blocking',
      event: HookEvent.TOOL_BEFORE,
      type: HookExecutionType.COMMAND,
      command: 'echo \'{"permission":"deny","reason":"Test block"}\'',
      blocking: true,
      timeout: 5000,
      registeredAt: Date.now(),
    };

    const allowHook = {
      id: 'allow-hook',
      name: 'allow',
      event: HookEvent.TOOL_BEFORE,
      type: HookExecutionType.COMMAND,
      command: 'echo \'{"permission":"allow"}\'',
      blocking: false,
      timeout: 5000,
      registeredAt: Date.now(),
    };

    const payload: ToolBeforePayload = {
      event: HookEvent.TOOL_BEFORE,
      timestamp: Date.now(),
      sessionId: 'test-session',
      toolName: 'test-tool',
      toolInput: {},
    };

    const result = await executor.executeHooks([blockingHook, allowHook], payload);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Test block');
    // Should only execute the blocking hook before stopping
    expect(result.results).toHaveLength(1);
  });
});

describe('HookLifecycleManager', () => {
  let manager: HookLifecycleManager;

  beforeEach(() => {
    manager = new HookLifecycleManager();
  });

  it('should handle session start event', async () => {
    const result = await manager.onSessionStart({
      sessionId: 'test-session',
      userId: 'test-user',
    });

    expect(result).toBeDefined();
    expect(result.allowed).toBe(true);
  });

  it('should handle tool before event', async () => {
    const result = await manager.onToolBefore({
      sessionId: 'test-session',
      toolName: 'execute_command',
      toolInput: { command: 'ls' },
    });

    expect(result).toBeDefined();
    expect(result.allowed).toBe(true);
  });

  it('should handle worker start event', async () => {
    const result = await manager.onWorkerStart({
      workerId: 'test-worker',
      runtimeType: 'ec2',
    });

    expect(result).toBeDefined();
  });
});



