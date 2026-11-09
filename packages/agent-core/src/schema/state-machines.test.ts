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
  // Circuit breaker
  attemptCircuitBreakerTransition,
  CircuitBreakerContext,
  // Connection health
  isLossyConnectionState,
  getConnectionHealth,
  describeStateMachine,
  STATE_MACHINE_DOCUMENTATION,
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
