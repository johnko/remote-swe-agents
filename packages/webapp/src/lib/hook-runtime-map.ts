/**
 * Mapping of hook event types to their supported runtime environments.
 * Used to display runtime badges in the hooks UI.
 * 
 * Some hooks work across multiple runtimes:
 * - Session lifecycle hooks work on all runtimes (universal session management)
 * - Tool/file/shell hooks work on agentcore
 * - Kiro-specific hooks only work with kiro (prompt submission, MCP, etc.)
 * - Stop event is agentcore fundamental
 */

import { HookEventType } from '@remote-swe-agents/agent-core/schema';

export type RuntimeType = 'agentcore' | 'kiro';

export const hookRuntimeMap: Record<HookEventType, RuntimeType[]> = {
  // Session lifecycle (universal - all runtimes)
  sessionStart: ['agentcore', 'kiro'],
  sessionEnd: ['agentcore', 'kiro'],
  subagentStart: ['agentcore', 'kiro'],
  subagentStop: ['agentcore', 'kiro'],

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
  if (runtimes.length === 0) return 'Unknown';
  if (runtimes.length === 1) return getRuntimeLabel(runtimes[0]!);
  // Show all runtimes joined by comma for multiple
  return runtimes.map(getRuntimeLabel).join(', ');
};

/**
 * Get badge colors for each runtime
 */
export const getRuntimeBadgeColor = (runtime: RuntimeType): string => {
  const colors: Record<RuntimeType, string> = {
    agentcore: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    kiro: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
  };
  return colors[runtime];
};

