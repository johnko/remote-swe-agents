/**
 * Mapping of hook event types to their supported runtime environment.
 * Used to display runtime badges in the hooks UI.
 * 
 * All hooks currently work on the agentcore runtime only.
 */

import { HookEventType } from '@remote-swe-agents/agent-core/schema';

export type RuntimeType = 'agentcore';

export const hookRuntimeMap: Record<HookEventType, RuntimeType[]> = {
  // Session lifecycle
  sessionStart: ['agentcore'],
  sessionEnd: ['agentcore'],
  subagentStart: ['agentcore'],
  subagentStop: ['agentcore'],

  // Tool use hooks
  preToolUse: ['agentcore'],
  postToolUse: ['agentcore'],
  postToolUseFailure: ['agentcore'],

  // Shell/command execution
  beforeShellExecution: ['agentcore'],
  afterShellExecution: ['agentcore'],

  // File operations
  beforeReadFile: ['agentcore'],
  afterFileEdit: ['agentcore'],

  // Context management
  stop: ['agentcore'],
};

export const getRuntimeLabel = (runtime: RuntimeType): string => {
  const labels: Record<RuntimeType, string> = {
    agentcore: 'Agent Core',
  };
  return labels[runtime];
};

export const getHookRuntimes = (eventType: HookEventType): RuntimeType[] => {
  return hookRuntimeMap[eventType] || [];
};

export const getHookRuntimesDisplay = (eventType: HookEventType): string => {
  return getRuntimeLabel('agentcore');
};

/**
 * Get badge colors for each runtime
 */
export const getRuntimeBadgeColor = (runtime: RuntimeType): string => {
  const colors: Record<RuntimeType, string> = {
    agentcore: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
  };
  return colors[runtime];
};

