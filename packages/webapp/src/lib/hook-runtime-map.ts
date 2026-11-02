/**
 * Mapping of hook event types to their supported runtime environments.
 * Used to display runtime badges in the hooks UI.
 */

import { HookEventType } from '@remote-swe-agents/agent-core/schema';

export type RuntimeType = 'agentcore' | 'kiro';

export const hookRuntimeMap: Record<HookEventType, RuntimeType[]> = {
  // Session lifecycle (all runtimes)
  sessionStart: ['agentcore'],
  sessionEnd: ['agentcore'],
  subagentStart: ['agentcore'],
  subagentStop: ['agentcore'],

  // Tool use hooks (agentcore)
  preToolUse: ['agentcore'],
  postToolUse: ['agentcore'],
  postToolUseFailure: ['agentcore'],

  // Shell/command execution (agentcore)
  beforeShellExecution: ['agentcore'],
  afterShellExecution: ['agentcore'],

  // File operations (agentcore)
  beforeReadFile: ['agentcore'],
  afterFileEdit: ['agentcore'],

  // MCP execution (kiro specific)
  beforeMCPExecution: ['kiro'],
  afterMCPExecution: ['kiro'],

  // Prompt lifecycle (kiro specific)
  beforeSubmitPrompt: ['kiro'],
  afterAgentResponse: ['kiro'],
  afterAgentThought: ['kiro'],

  // Context management
  preCompact: ['kiro'],
  stop: ['agentcore'],
};

export const getRuntimeLabel = (runtime: RuntimeType): string => {
  const labels: Record<RuntimeType, string> = {
    agentcore: 'Agent Core',
    kiro: 'Kiro',
  };
  return labels[runtime];
};

export const getHookRuntimes = (eventType: HookEventType): RuntimeType[] => {
  return hookRuntimeMap[eventType] || [];
};

export const getHookRuntimesDisplay = (eventType: HookEventType): string => {
  const runtimes = getHookRuntimes(eventType);
  return runtimes.map(getRuntimeLabel).join(', ');
};
