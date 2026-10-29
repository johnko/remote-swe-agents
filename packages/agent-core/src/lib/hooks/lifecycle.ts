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
  async onSessionStart(payload: Omit<SessionStartPayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as SessionStartPayload;
    const fullPayload: SessionStartPayload = {
      event: HookEvent.SESSION_START,
      timestamp: Date.now(),
      sessionId: p.sessionId,
      userId: p.userId,
      parentSessionId: p.parentSessionId,
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
  async onSessionEnd(payload: Omit<SessionEndPayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as SessionEndPayload;
    const fullPayload: SessionEndPayload = {
      event: HookEvent.SESSION_END,
      timestamp: Date.now(),
      sessionId: p.sessionId,
      userId: p.userId,
      duration: p.duration,
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
  async onToolBefore(payload: Omit<ToolBeforePayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as ToolBeforePayload;
    const fullPayload: ToolBeforePayload = {
      event: HookEvent.TOOL_BEFORE,
      timestamp: Date.now(),
      sessionId: p.sessionId,
      toolName: p.toolName,
      toolInput: p.toolInput,
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
  async onToolAfter(payload: Omit<ToolAfterPayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as ToolAfterPayload;
    const fullPayload: ToolAfterPayload = {
      event: HookEvent.TOOL_AFTER,
      timestamp: Date.now(),
      sessionId: p.sessionId,
      toolName: p.toolName,
      toolInput: p.toolInput,
      toolOutput: p.toolOutput,
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
  async onToolError(payload: Omit<ToolErrorPayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as ToolErrorPayload;
    const fullPayload: ToolErrorPayload = {
      event: HookEvent.TOOL_ERROR,
      timestamp: Date.now(),
      sessionId: p.sessionId,
      toolName: p.toolName,
      toolInput: p.toolInput,
      errorMessage: p.errorMessage,
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
  async onMessageReceived(payload: Omit<MessageReceivedPayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as MessageReceivedPayload;
    const fullPayload: MessageReceivedPayload = {
      event: HookEvent.MESSAGE_RECEIVED,
      timestamp: Date.now(),
      sessionId: p.sessionId,
      userId: p.userId,
      message: p.message,
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
  async onMessageSent(payload: Omit<MessageSentPayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as MessageSentPayload;
    const fullPayload: MessageSentPayload = {
      event: HookEvent.MESSAGE_SENT,
      timestamp: Date.now(),
      sessionId: p.sessionId,
      message: p.message,
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
  async onWorkerStart(payload: Omit<WorkerStartPayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as WorkerStartPayload;
    const fullPayload: WorkerStartPayload = {
      event: HookEvent.WORKER_START,
      timestamp: Date.now(),
      workerId: p.workerId,
      runtimeType: p.runtimeType,
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
  async onWorkerStop(payload: Omit<WorkerStopPayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as WorkerStopPayload;
    const fullPayload: WorkerStopPayload = {
      event: HookEvent.WORKER_STOP,
      timestamp: Date.now(),
      workerId: p.workerId,
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
  async onAgentStart(payload: Omit<AgentStartPayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as AgentStartPayload;
    const fullPayload: AgentStartPayload = {
      event: HookEvent.AGENT_START,
      timestamp: Date.now(),
      sessionId: p.sessionId,
      agentId: p.agentId,
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
  async onAgentEnd(payload: Omit<AgentEndPayload, 'timestamp' | 'event'>): Promise<{ allowed: boolean; results: any[] }> {
    const p = payload as AgentEndPayload;
    const fullPayload: AgentEndPayload = {
      event: HookEvent.AGENT_END,
      timestamp: Date.now(),
      sessionId: p.sessionId,
      agentId: p.agentId,
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
