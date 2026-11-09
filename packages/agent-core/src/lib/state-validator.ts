/**
 * State transition validation utilities
 * 
 * Provides runtime validation of state transitions with helpful error messages.
 * Improves DX by catching invalid transitions early with clear feedback.
 * 
 * @module StateValidator
 */

import {
  type InstanceStatus,
  type AgentStatus,
  isValidInstanceTransition,
  isValidAgentTransition,
  getValidInstanceTransitions,
  getValidAgentTransitions,
} from '../schema/state-machines.js';

/**
 * Result of a state transition validation.
 */
export interface StateValidationResult {
  valid: boolean;
  current: string;
  requested: string;
  allowedTransitions: string[];
  error?: string;
  suggestion?: string;
}

/**
 * Validates an instance status transition.
 * 
 * @param current - Current instance status
 * @param requested - Requested new status
 * @returns Validation result with helpful error message if invalid
 * 
 * @example
 * ```typescript
 * const result = validateInstanceTransition('terminated', 'running');
 * if (!result.valid) {
 *   console.error(result.error); // "Cannot transition from 'terminated' to 'running'"
 *   console.log(result.suggestion); // "Instance is in terminal state. Create a new session."
 * }
 * ```
 */
export function validateInstanceTransition(
  current: InstanceStatus,
  requested: InstanceStatus
): StateValidationResult {
  const allowed = getValidInstanceTransitions(current);
  
  if (isValidInstanceTransition(current, requested)) {
    return {
      valid: true,
      current,
      requested,
      allowedTransitions: allowed,
    };
  }

  let suggestion: string | undefined;
  if (current === 'terminated') {
    suggestion = 'Instance is in terminal state. Create a new session if you need a running instance.';
  } else if (current === 'stopped' && requested === 'running') {
    suggestion = 'Stopped instance must go through "starting" state first.';
  }

  return {
    valid: false,
    current,
    requested,
    allowedTransitions: allowed,
    error: `Cannot transition instance from '${current}' to '${requested}'.`,
    suggestion,
  };
}

/**
 * Validates an agent status transition.
 * 
 * @param current - Current agent status
 * @param requested - Requested new status
 * @returns Validation result with helpful error message if invalid
 * 
 * @example
 * ```typescript
 * const result = validateAgentTransition('completed', 'working');
 * if (!result.valid) {
 *   console.error(result.error); // Shows valid intermediate step
 * }
 * ```
 */
export function validateAgentTransition(
  current: AgentStatus,
  requested: AgentStatus
): StateValidationResult {
  const allowed = getValidAgentTransitions(current);
  
  if (isValidAgentTransition(current, requested)) {
    return {
      valid: true,
      current,
      requested,
      allowedTransitions: allowed,
    };
  }

  let suggestion: string | undefined;
  if (current === 'completed' && requested === 'working') {
    suggestion = 'Completed session must be resumed (transition to "pending" first) before working again.';
  } else if (current === 'pending' && requested === 'completed') {
    suggestion = 'Agent must be "working" before it can transition to "completed".';
  }

  return {
    valid: false,
    current,
    requested,
    allowedTransitions: allowed,
    error: `Cannot transition agent from '${current}' to '${requested}'.`,
    suggestion,
  };
}

/**
 * Validates a todo status transition.
 * 
 * @param current - Current todo status
 * @param requested - Requested new status
 * @returns Validation result with helpful error message if invalid
 */
/**
 * Note: validateTodoTransition is intentionally omitted.
 * Since todo items are a reflection of agent tool calls and the agent
 * is the source of truth, any transition is valid (see TODO_STATUS_TRANSITIONS).
 */

/**
 * Creates a typed state transition validator for a specific status type.
 * Useful for building generic UI components.
 * 
 * @example
 * ```typescript
 * const validator = createStatusValidator<AgentStatus>(
 *   'agent',
 *   isValidAgentTransition,
 *   getValidAgentTransitions
 * );
 * const result = validator('pending', 'working');
 * ```
 */
export function createStatusValidator<S extends string>(
  typeName: string,
  isValid: (current: S, requested: S) => boolean,
  getValid: (current: S) => S[]
) {
  return (current: S, requested: S): StateValidationResult => {
    const allowed = getValid(current);
    
    if (isValid(current, requested)) {
      return {
        valid: true,
        current,
        requested,
        allowedTransitions: allowed,
      };
    }

    return {
      valid: false,
      current,
      requested,
      allowedTransitions: allowed,
      error: `Cannot transition ${typeName} from '${current}' to '${requested}'.`,
    };
  };
}

/**
 * Batch validates multiple state transitions.
 * Returns all invalid transitions for bulk error reporting.
 * 
 * @example
 * ```typescript
 * const results = batchValidateTransitions([
 *   { type: 'instance', current: 'running', requested: 'terminated' },
 *   { type: 'agent', current: 'pending', requested: 'completed' }, // Invalid!
 * ]);
 * const errors = results.filter(r => !r.valid);
 * ```
 */
export interface TransitionRequest {
  type: 'instance' | 'agent' | 'todo' | 'lesson';
  current: InstanceStatus | AgentStatus | TodoStatus | LessonStatus;
  requested: InstanceStatus | AgentStatus | TodoStatus | LessonStatus;
}

export function batchValidateTransitions(
  requests: TransitionRequest[]
): StateValidationResult[] {
  return requests.map((req) => {
    switch (req.type) {
      case 'instance':
        return validateInstanceTransition(req.current as InstanceStatus, req.requested as InstanceStatus);
      case 'agent':
        return validateAgentTransition(req.current as AgentStatus, req.requested as AgentStatus);
      case 'todo':
        return validateTodoTransition(req.current as TodoStatus, req.requested as TodoStatus);
      case 'lesson':
        return validateLessonTransition(req.current as LessonStatus, req.requested as LessonStatus);
      default:
        return {
          valid: false,
          current: req.current,
          requested: req.requested,
          allowedTransitions: [],
          error: `Unknown status type: ${(req as TransitionRequest).type}`,
        };
    }
  });
}

/**
 * Formats a state validation result as a user-friendly string.
 * Useful for displaying validation errors in UI.
 */
export function formatValidationResult(result: StateValidationResult): string {
  if (result.valid) {
    return `✓ Valid transition from '${result.current}' to '${result.requested}'`;
  }
  
  let message = `✗ ${result.error}`;
  
  if (result.allowedTransitions.length > 0) {
    message += `\n  Valid transitions from '${result.current}': ${result.allowedTransitions.join(', ')}`;
  }
  
  if (result.suggestion) {
    message += `\n  Suggestion: ${result.suggestion}`;
  }
  
  return message;
}

/**
 * State transition guard function.
 * Throws an error if the transition is invalid.
 * 
 * @example
 * ```typescript
 * guardInstanceTransition('terminated', 'running'); // throws
 * ```
 */
export function guardInstanceTransition(current: InstanceStatus, requested: InstanceStatus): void {
  const result = validateInstanceTransition(current, requested);
  if (!result.valid) {
    throw new Error(formatValidationResult(result));
  }
}

/**
 * State transition guard for agent status.
 * Throws an error if the transition is invalid.
 */
export function guardAgentTransition(current: AgentStatus, requested: AgentStatus): void {
  const result = validateAgentTransition(current, requested);
  if (!result.valid) {
    throw new Error(formatValidationResult(result));
  }
}
