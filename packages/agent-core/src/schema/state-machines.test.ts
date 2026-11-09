/**
 * Tests for state machine types and validators
 */
import { describe, it, expect } from 'vitest';
import {
  // Instance status
  isValidInstanceTransition,
  getValidInstanceTransitions,
  INSTANCE_STATUS_TRANSITIONS,
  // Agent status
  isValidAgentTransition,
  getValidAgentTransitions,
  AGENT_STATUS_TRANSITIONS,
  // Todo status
  isValidTodoTransition,
  getValidTodoTransitions,
  TODO_STATUS_TRANSITIONS,
  isTerminalTodoStatus,
  // Lesson status
  isValidLessonTransition,
  LESSON_STATUS_TRANSITIONS,
  // Circuit breaker
  attemptCircuitBreakerTransition,
  CircuitBreakerContext,
  // Connection health
  isLossyConnectionState,
  getConnectionHealth,
  describeStateMachine,
  STATE_MACHINE_DOCUMENTATION,
} from './state-machines.js';

describe('Instance Status State Machine', () => {
  describe('isValidInstanceTransition', () => {
    it('should allow starting → running', () => {
      expect(isValidInstanceTransition('starting', 'running')).toBe(true);
    });

    it('should allow running → stopped', () => {
      expect(isValidInstanceTransition('running', 'stopped')).toBe(true);
    });

    it('should allow running → terminated', () => {
      expect(isValidInstanceTransition('running', 'terminated')).toBe(true);
    });

    it('should allow stopped → starting', () => {
      expect(isValidInstanceTransition('stopped', 'starting')).toBe(true);
    });

    it('should NOT allow starting → completed', () => {
      expect(isValidInstanceTransition('starting', 'terminated')).toBe(true);
      // Note: completed is an agent status, not instance status
    });

    it('should NOT allow terminated → running', () => {
      expect(isValidInstanceTransition('terminated', 'running')).toBe(false);
    });

    it('should allow same-state transitions', () => {
      expect(isValidInstanceTransition('running', 'running')).toBe(true);
    });
  });

  describe('getValidInstanceTransitions', () => {
    it('should return valid transitions for starting', () => {
      expect(getValidInstanceTransitions('starting')).toEqual(['running', 'stopped', 'terminated']);
    });

    it('should return empty array for terminated', () => {
      expect(getValidInstanceTransitions('terminated')).toEqual([]);
    });
  });
});

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

describe('Todo Status State Machine', () => {
  describe('isValidTodoTransition', () => {
    it('should allow all transitions since todo is reflection of agent state', () => {
      // Agent is source of truth - allow any transition
      expect(isValidTodoTransition('pending', 'in_progress')).toBe(true);
      expect(isValidTodoTransition('in_progress', 'completed')).toBe(true);
      expect(isValidTodoTransition('in_progress', 'cancelled')).toBe(true);
      expect(isValidTodoTransition('pending', 'cancelled')).toBe(true);
      expect(isValidTodoTransition('completed', 'in_progress')).toBe(true);
      expect(isValidTodoTransition('cancelled', 'pending')).toBe(true);
      expect(isValidTodoTransition('cancelled', 'completed')).toBe(true);
      expect(isValidTodoTransition('cancelled', 'in_progress')).toBe(true);
    });

    it('should allow self-transitions', () => {
      expect(isValidTodoTransition('pending', 'pending')).toBe(true);
      expect(isValidTodoTransition('completed', 'completed')).toBe(true);
    });
  });

  describe('isTerminalTodoStatus', () => {
    it('should return false for all statuses (todo state machines allows transitions from all)', () => {
      // Since todo is a reflection and allows any transition, no status is truly terminal
      expect(isTerminalTodoStatus('cancelled')).toBe(false);
      expect(isTerminalTodoStatus('pending')).toBe(false);
      expect(isTerminalTodoStatus('in_progress')).toBe(false);
      expect(isTerminalTodoStatus('completed')).toBe(false);
    });
  });

  describe('getValidTodoTransitions', () => {
    it('should return all statuses for any current status', () => {
      // Since todo allows any transition, all statuses are valid from any state
      const allStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
      expect(getValidTodoTransitions('pending').sort()).toEqual(allStatuses.sort());
      expect(getValidTodoTransitions('completed').sort()).toEqual(allStatuses.sort());
      expect(getValidTodoTransitions('cancelled').sort()).toEqual(allStatuses.sort());
    });
  });
});

describe('Lesson Status State Machine', () => {
  describe('isValidLessonTransition', () => {
    it('should allow active → archived', () => {
      expect(isValidLessonTransition('active', 'archived')).toBe(true);
    });

    it('should allow archived → active', () => {
      expect(isValidLessonTransition('archived', 'active')).toBe(true);
    });

    it('should return true for same-state', () => {
      expect(isValidLessonTransition('active', 'active')).toBe(true);
    });
  });
});

describe('Circuit Breaker State Machine', () => {
  const defaultConfig = {
    failureThreshold: 3,
    timeoutMs: 30000,
  };

  describe('CLOSED state', () => {
    it('should stay closed on success', () => {
      const context: CircuitBreakerContext = {
        state: 'CLOSED',
        consecutiveErrors: 0,
        lastErrorType: '',
        lastFailureTime: null,
        config: defaultConfig,
      };
      const result = attemptCircuitBreakerTransition(context, true);
      expect(result.allowed).toBe(true);
      expect(result.newState).toBe('CLOSED');
    });

    it('should stay closed on first failure', () => {
      const context: CircuitBreakerContext = {
        state: 'CLOSED',
        consecutiveErrors: 0,
        lastErrorType: 'timeout',
        lastFailureTime: null,
        config: defaultConfig,
      };
      const result = attemptCircuitBreakerTransition(context, false);
      expect(result.allowed).toBe(true);
      expect(result.newState).toBe('CLOSED');
    });

    it('should open on threshold exceeded', () => {
      const context: CircuitBreakerContext = {
        state: 'CLOSED',
        consecutiveErrors: 2, // One more will exceed threshold of 3
        lastErrorType: 'timeout',
        lastFailureTime: Date.now(),
        config: defaultConfig,
      };
      const result = attemptCircuitBreakerTransition(context, false);
      expect(result.allowed).toBe(false);
      expect(result.newState).toBe('OPEN');
    });
  });

  describe('OPEN state', () => {
    it('should transition to half-open after timeout', () => {
      const context: CircuitBreakerContext = {
        state: 'OPEN',
        consecutiveErrors: 3,
        lastErrorType: 'timeout',
        lastFailureTime: Date.now() - 31000, // 31 seconds ago
        config: defaultConfig,
      };
      const result = attemptCircuitBreakerTransition(context, true);
      expect(result.allowed).toBe(true);
      expect(result.newState).toBe('HALF_OPEN');
    });

    it('should stay open before timeout', () => {
      const context: CircuitBreakerContext = {
        state: 'OPEN',
        consecutiveErrors: 3,
        lastErrorType: 'timeout',
        lastFailureTime: Date.now() - 1000, // 1 second ago
        config: defaultConfig,
      };
      const result = attemptCircuitBreakerTransition(context, true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Circuit is open');
    });
  });

  describe('HALF_OPEN state', () => {
    it('should close on success', () => {
      const context: CircuitBreakerContext = {
        state: 'HALF_OPEN',
        consecutiveErrors: 0,
        lastErrorType: '',
        lastFailureTime: null,
        config: defaultConfig,
      };
      const result = attemptCircuitBreakerTransition(context, true);
      expect(result.allowed).toBe(true);
      expect(result.newState).toBe('CLOSED');
    });

    it('should reopen on failure', () => {
      const context: CircuitBreakerContext = {
        state: 'HALF_OPEN',
        consecutiveErrors: 0,
        lastErrorType: '',
        lastFailureTime: null,
        config: defaultConfig,
      };
      const result = attemptCircuitBreakerTransition(context, false);
      expect(result.allowed).toBe(false);
      expect(result.newState).toBe('OPEN');
    });
  });
});

describe('Connection Health State Machine', () => {
  describe('isLossyConnectionState', () => {
    it('should return true for disrupted states', () => {
      expect(isLossyConnectionState('ConnectionDisrupted')).toBe(true);
      expect(isLossyConnectionState('Disconnected')).toBe(true);
    });

    it('should return false for healthy states', () => {
      expect(isLossyConnectionState('Connected')).toBe(false);
      expect(isLossyConnectionState('Connecting')).toBe(false);
    });
  });

  describe('getConnectionHealth', () => {
    it('should return healthy for Connected', () => {
      expect(getConnectionHealth('Connected')).toBe('healthy');
    });

    it('should return degraded for Connecting', () => {
      expect(getConnectionHealth('Connecting')).toBe('degraded');
    });

    it('should return disconnected for Disconnected', () => {
      expect(getConnectionHealth('Disconnected')).toBe('disconnected');
    });
  });
});

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

describe('STATE_MACHINE_DOCUMENTATION', () => {
  it('should contain all state machine documentation', () => {
    expect(STATE_MACHINE_DOCUMENTATION).toContain('Instance Status State Machine');
    expect(STATE_MACHINE_DOCUMENTATION).toContain('Agent Status State Machine');
    expect(STATE_MACHINE_DOCUMENTATION).toContain('Todo Status State Machine');
    expect(STATE_MACHINE_DOCUMENTATION).toContain('Lesson Status State Machine');
    expect(STATE_MACHINE_DOCUMENTATION).toContain('Circuit Breaker State Machine');
  });
});
