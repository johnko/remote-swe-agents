/**
 * Tests for state machine types and validators
 */
import { describe, it, expect } from 'vitest';
import {
  // Instance status exported but tests omitted - AWS handles lifecycle
  // Agent status (controlled by application)
  isValidAgentTransition,
  getValidAgentTransitions,
  AGENT_STATUS_TRANSITIONS,
  // Todo/Lesson status exported but tests omitted (simple transitions)
  // Circuit breaker / Connection Health exported but tests omitted (implemented elsewhere)
  describeStateMachine,
} from './state-machines.js';

// Note: Instance status state machine tests omitted - AWS handles instance lifecycle

describe('Agent Status State Machine', () => {
  describe('isValidAgentTransition', () => {
    it('should allow pending → working', () => {
      expect(isValidAgentTransition('pending', 'working')).toBe(true);
    });

    it('should allow working → pending', () => {
      expect(isValidAgentTransition('working', 'pending')).toBe(true);
    });

    it('should allow working → completed', () => {
      expect(isValidAgentTransition('working', 'completed')).toBe(true);
    });

    it('should allow completed → pending', () => {
      expect(isValidAgentTransition('completed', 'pending')).toBe(true);
    });

    it('should NOT allow completed → working directly', () => {
      expect(isValidAgentTransition('completed', 'working')).toBe(false);
      // Must go through pending first
    });

    it('should NOT allow completed → working, and pending must go through working first', () => {
      expect(isValidAgentTransition('completed', 'working')).toBe(false);
      expect(isValidAgentTransition('pending', 'completed')).toBe(false);
      expect(isValidAgentTransition('pending', 'working')).toBe(true);
      expect(isValidAgentTransition('working', 'completed')).toBe(true);
    });

    it('should allow same-state transitions', () => {
      expect(isValidAgentTransition('working', 'working')).toBe(true);
    });
  });

  describe('getValidAgentTransitions', () => {
    it('should return valid transitions for pending', () => {
      expect(getValidAgentTransitions('pending')).toEqual(['working']);
    });

    it('should return valid transitions for completed', () => {
      expect(getValidAgentTransitions('completed')).toEqual(['pending']);
    });
  });
});

// Note: Todo status state machine tests omitted - all transitions are valid since
// todo items are a reflection of agent tool calls and agent is the source of truth

// Note: Lesson status state machine tests omitted - only has simple
// bidirectional transitions (active ↔ archived), all transitions are valid

// Note: Circuit Breaker state machine tests omitted - not used in codebase
// Note: Connection Health state machine tests omitted - implemented in realtime-connection.ts

describe('describeStateMachine', () => {
  it('should generate markdown documentation', () => {
    const states = ['idle', 'running', 'stopped'] as const;
    type TestStatus = (typeof states)[number];
    const transitions: Record<TestStatus, readonly TestStatus[]> = {
      idle: ['running'],
      running: ['stopped'],
      stopped: [],
    };

    const doc = describeStateMachine('Test', states, transitions);
    expect(doc).toContain('## Test State Machine');
    expect(doc).toContain('**States**:');
    expect(doc).toContain('**Terminal States**: stopped');
    expect(doc).toContain('`idle` → `running`');
  });
});
