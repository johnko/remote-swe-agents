import {
  HookEvent,
  SessionStartPayload,
  SessionEndPayload,
  ToolBeforePayload,
  ToolAfterPayload,
  ToolErrorPayload,
  MessageReceivedPayload,
  MessageSentPayload,
  WorkerStartPayload,
  WorkerStopPayload,
  AgentStartPayload,
  AgentEndPayload,
} from './types.js';
import { getGlobalHookRegistry } from './registry.js';
import { getGlobalHookExecutor } from './executor.js';

/**
 * Hook lifecycle manager provides convenient methods to trigger hooks at key points
 */
export class HookLifecycleManager {
  /**
   * Fire SESSION_START hook
   */
  async onSessionStart(payload: Omit<SessionStartPayload, 'timestamp' | 'event'>) {
    const fullPayload: SessionStartPayload = {
      ...payload,
      event: HookEvent.SESSION_START,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.SESSION_START);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }

  /**
   * Fire SESSION_END hook
   */
  async onSessionEnd(payload: Omit<SessionEndPayload, 'timestamp' | 'event'>) {
    const fullPayload: SessionEndPayload = {
      ...payload,
      event: HookEvent.SESSION_END,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.SESSION_END);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }

  /**
   * Fire TOOL_BEFORE hook
   */
  async onToolBefore(payload: Omit<ToolBeforePayload, 'timestamp' | 'event'>) {
    const fullPayload: ToolBeforePayload = {
      ...payload,
      event: HookEvent.TOOL_BEFORE,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.TOOL_BEFORE);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }

  /**
   * Fire TOOL_AFTER hook
   */
  async onToolAfter(payload: Omit<ToolAfterPayload, 'timestamp' | 'event'>) {
    const fullPayload: ToolAfterPayload = {
      ...payload,
      event: HookEvent.TOOL_AFTER,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.TOOL_AFTER);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }

  /**
   * Fire TOOL_ERROR hook
   */
  async onToolError(payload: Omit<ToolErrorPayload, 'timestamp' | 'event'>) {
    const fullPayload: ToolErrorPayload = {
      ...payload,
      event: HookEvent.TOOL_ERROR,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.TOOL_ERROR);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }

  /**
   * Fire MESSAGE_RECEIVED hook
   */
  async onMessageReceived(payload: Omit<MessageReceivedPayload, 'timestamp' | 'event'>) {
    const fullPayload: MessageReceivedPayload = {
      ...payload,
      event: HookEvent.MESSAGE_RECEIVED,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.MESSAGE_RECEIVED);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }

  /**
   * Fire MESSAGE_SENT hook
   */
  async onMessageSent(payload: Omit<MessageSentPayload, 'timestamp' | 'event'>) {
    const fullPayload: MessageSentPayload = {
      ...payload,
      event: HookEvent.MESSAGE_SENT,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.MESSAGE_SENT);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }

  /**
   * Fire WORKER_START hook
   */
  async onWorkerStart(payload: Omit<WorkerStartPayload, 'timestamp' | 'event'>) {
    const fullPayload: WorkerStartPayload = {
      ...payload,
      event: HookEvent.WORKER_START,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.WORKER_START);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }

  /**
   * Fire WORKER_STOP hook
   */
  async onWorkerStop(payload: Omit<WorkerStopPayload, 'timestamp' | 'event'>) {
    const fullPayload: WorkerStopPayload = {
      ...payload,
      event: HookEvent.WORKER_STOP,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.WORKER_STOP);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }

  /**
   * Fire AGENT_START hook
   */
  async onAgentStart(payload: Omit<AgentStartPayload, 'timestamp' | 'event'>) {
    const fullPayload: AgentStartPayload = {
      ...payload,
      event: HookEvent.AGENT_START,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.AGENT_START);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }

  /**
   * Fire AGENT_END hook
   */
  async onAgentEnd(payload: Omit<AgentEndPayload, 'timestamp' | 'event'>) {
    const fullPayload: AgentEndPayload = {
      ...payload,
      event: HookEvent.AGENT_END,
      timestamp: Date.now(),
    };

    const registry = getGlobalHookRegistry();
    const hooks = registry.getHooksForEvent(HookEvent.AGENT_END);

    if (hooks.length === 0) return { allowed: true, results: [] };

    const executor = getGlobalHookExecutor();
    return executor.executeHooks(hooks, fullPayload);
  }
}

/**
 * Global lifecycle manager instance
 */
let globalLifecycleManager: HookLifecycleManager | null = null;

/**
 * Get or create global lifecycle manager
 */
export function getGlobalHookLifecycleManager(): HookLifecycleManager {
  if (!globalLifecycleManager) {
    globalLifecycleManager = new HookLifecycleManager();
  }
  return globalLifecycleManager;
}
