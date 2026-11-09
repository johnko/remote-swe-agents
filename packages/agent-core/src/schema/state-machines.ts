/**
 * Explicit State Machine Types and Validators
 * 
 * This file provides type-safe state machine definitions for the core
 * entities in the system. It improves DX by providing:
 * - Compile-time guarantees for valid state transitions
 * - Self-documenting state diagrams in code
 * - Runtime validation helpers
 * - Clear state machine documentation for AI agents (AX)
 * 
 * @module StateMachines
 */

import { z } from 'zod';

// =============================================================================
// Session Status State Machine
// =============================================================================

/**
 * Instance lifecycle states.
 * Transitions: starting → running → stopped|terminated
 */
export const instanceStatusSchema = z.union([
  z.literal('starting'),
  z.literal('running'),
  z.literal('stopped'),
  z.literal('terminated'),
]);

export type InstanceStatus = z.infer<typeof instanceStatusSchema>;

/**
 * Agent work states.
 * Transitions: pending → working → pending|completed
 */
export const agentStatusSchema = z.union([z.literal('working'), z.literal('pending'), z.literal('completed')]);

export type AgentStatus = z.infer<typeof agentStatusSchema>;

/**
 * Valid instance status transitions.
 * Maps current state → array of valid next states.
 * 
 * Note: AWS handles instance lifecycle, so these are documented transitions
 * rather than strict validations. The actual transitions are controlled by AWS.
 */
export const INSTANCE_STATUS_TRANSITIONS: Record<InstanceStatus, readonly InstanceStatus[]> = {
  starting: ['running', 'stopped', 'terminated'],
  running: ['stopped', 'terminated', 'starting'],
  stopped: ['starting', 'terminated', 'running'],
  terminated: ['starting'], // Can create new instance after termination
} as const;

/**
 * Valid agent status transitions.
 * Maps current state → array of valid next states.
 */
export const AGENT_STATUS_TRANSITIONS: Record<AgentStatus, readonly AgentStatus[]> = {
  pending: ['working'], // Must go through working first
  working: ['pending', 'completed'],
  completed: ['pending'], // Can resume after completion
} as const;

/**
 * Note: isValidInstanceTransition is intentionally omitted.
 * AWS handles instance lifecycle, so the application does not validate
 * those transitions. The instance types and transitions map are documented
 * in INSTANCE_STATUS_TRANSITIONS for reference only.
 */

/**
 * Checks if an agent status transition is valid.
 * @param current - Current status
 * @param next - Proposed next status
 * @returns true if the transition is valid
 * 
 * @example
 * ```typescript
 * isValidAgentTransition('pending', 'working'); // true
 * isValidAgentTransition('completed', 'working'); // false (must go through pending)
 * ```
 */
export function isValidAgentTransition(current: AgentStatus, next: AgentStatus): boolean {
  return current === next || AGENT_STATUS_TRANSITIONS[current].includes(next);
}

/**
 * Note: getValidInstanceTransitions is intentionally omitted.
 * AWS handles instance lifecycle. See isValidInstanceTransition note above.
 */

/**
 * Gets all valid next states for an agent status.
 * Useful for UI dropdowns and agent decision-making.
 */
export function getValidAgentTransitions(current: AgentStatus): AgentStatus[] {
  return [...AGENT_STATUS_TRANSITIONS[current]];
}

// =============================================================================
// Todo State Machine
// =============================================================================

/**
 * Todo item lifecycle states.
 * Transitions:
 *   pending → in_progress
 *   in_progress → completed|cancelled
 *   Any → cancelled (cancellation is always allowed)
 */
export const todoStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);

export type TodoStatus = z.infer<typeof todoStatusSchema>;

/**
 * Valid todo status transitions.
 * Maps current state → array of valid next states.
 * 
 * NOTE: The todo list is a reflection of the agent's tool calls (todo_init, todo_update).
 * The agent is the source of truth, so we allow any transition to reflect
 * whatever state the agent decides the todo should be in.
 */
export const TODO_STATUS_TRANSITIONS: Record<TodoStatus, readonly TodoStatus[]> = {
  pending: ['in_progress', 'completed', 'cancelled', 'pending'],
  in_progress: ['pending', 'completed', 'cancelled', 'in_progress'],
  completed: ['pending', 'in_progress', 'cancelled', 'completed'],
  cancelled: ['pending', 'in_progress', 'completed', 'cancelled'],
} as const;

/**
 * Checks if a todo status transition is valid.
 * @param current - Current status
 * @param next - Proposed next status
 * @returns true if the transition is valid
 */
export function isValidTodoTransition(current: TodoStatus, next: TodoStatus): boolean {
  return current === next || TODO_STATUS_TRANSITIONS[current].includes(next);
}

/**
 * Gets all valid next states for a todo status.
 */
export function getValidTodoTransitions(current: TodoStatus): TodoStatus[] {
  return [...TODO_STATUS_TRANSITIONS[current]];
}

/**
 * Checks if a todo item is in a terminal state.
 */
export function isTerminalTodoStatus(status: TodoStatus): boolean {
  return TODO_STATUS_TRANSITIONS[status].length === 0;
}

// =============================================================================
// Lesson State Machine
// =============================================================================

/**
 * Lesson lifecycle states.
 * Transitions: active ↔ archived (bidirectional)
 */
export const lessonStatusSchema = z.enum(['active', 'archived']);

export type LessonStatus = z.infer<typeof lessonStatusSchema>;

/**
 * Valid lesson status transitions.
 * Both directions are allowed for lesson status (bidirectional).
 * 
 * Note: Since lessons only have two states with bidirectional transitions,
 * any transition is valid except self-to-self is also allowed.
 */
export const LESSON_STATUS_TRANSITIONS: Record<LessonStatus, readonly LessonStatus[]> = {
  active: ['archived'],
  archived: ['active'],
} as const;

/**
 * Checks if a lesson status transition is valid.
 * 
 * Note: Lessons have simple bidirectional transitions (active ↔ archived),
 * so this is essentially always true for any different state.
 * Kept for consistency with other state machines.
 */
export function isValidLessonTransition(current: LessonStatus, next: LessonStatus): boolean {
  return current === next || LESSON_STATUS_TRANSITIONS[current].includes(next);
}

/**
 * Note: Circuit Breaker state machine intentionally omitted.
 * The circuit breaker logic is already implemented inline in
 * packages/worker/src/agent/strands/invoke-loop.ts
 * and is not used elsewhere.
 * 
 * Note: Connection Health state machine also intentionally omitted.
 * The real-time connection health tracking is implemented in
 * packages/webapp/src/lib/realtime-connection.ts with its own
 * ConnectionHealthTracker class.
 */

// =============================================================================
// State Machine Documentation
// =============================================================================

/**
 * Returns a markdown description of a state machine for documentation.
 * Improves AX by making state machines self-documenting.
 * 
 * @param name - Name of the state machine
 * @param states - All possible states
 * @param transitions - Valid transitions map
 * @returns Markdown formatted description
 */
export function describeStateMachine<S extends string>(
  name: string,
  states: readonly S[],
  transitions: Record<S, readonly S[]>
): string {
  const terminalStates = states.filter((s) => transitions[s].length === 0);
  const nonTerminalStates = states.filter((s) => transitions[s].length > 0);

  let output = `## ${name} State Machine\n\n`;
  output += `**States**: ${states.join(', ')}\n\n`;
  output += `**Terminal States**: ${terminalStates.length > 0 ? terminalStates.join(', ') : 'None'}\n\n`;
  output += `**Transitions**:\n\n`;

  for (const state of nonTerminalStates) {
    const targets = transitions[state];
    if (targets.length === 0) continue;
    output += `- \`${state}\` → ${targets.map((t) => `\`${t}\``).join(', ')}\n`;
  }

  return output;
}

/**
 * All state machines documentation for agents.
 * Use this to inject state machine knowledge into prompts.
 */
export const STATE_MACHINE_DOCUMENTATION = `
${describeStateMachine('Instance Status', ['starting', 'running', 'stopped', 'terminated'], INSTANCE_STATUS_TRANSITIONS)}

${describeStateMachine('Agent Status', ['pending', 'working', 'completed'], AGENT_STATUS_TRANSITIONS)}

${describeStateMachine('Todo Status', ['pending', 'in_progress', 'completed', 'cancelled'], TODO_STATUS_TRANSITIONS)}

${describeStateMachine('Lesson Status', ['active', 'archived'], LESSON_STATUS_TRANSITIONS)}
`;

// =============================================================================
// Runtime type schema (for agent.ts backward compatibility)
// =============================================================================

export const runtimeTypeSchema = z.union([z.literal('ec2'), z.literal('agent-core')]);
export type RuntimeType = z.infer<typeof runtimeTypeSchema>;
