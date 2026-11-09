/**
 * Tests for state transition validators
 */
import { describe, it, expect } from 'vitest';
import {
  validateInstanceTransition,
  validateAgentTransition,
  validateTodoTransition,
  validateLessonTransition,
  batchValidateTransitions,
  formatValidationResult,
  guardInstanceTransition,
  guardAgentTransition,
  createStatusValidator,
} from './state-validator.js';

describe('validateInstanceTransition', () => {
  it('should validate valid transitions', () => {
    const result = validateInstanceTransition('starting', 'running');
    expect(result.valid).toBe(true);
    expect(result.allowedTransitions).toContain('running');
  });

  it('should reject invalid transitions with helpful message', () => {
    const result = validateInstanceTransition('terminated', 'running');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot transition');
    expect(result.suggestion).toContain('terminal state');
  });

  it('should suggest the correct path for stopped → running', () => {
    const result = validateInstanceTransition('stopped', 'running');
    expect(result.valid).toBe(false);
    expect(result.suggestion).toContain('starting');
  });
});

describe('validateAgentTransition', () => {
  it('should validate pending → working', () => {
    const result = validateAgentTransition('pending', 'working');
    expect(result.valid).toBe(true);
  });

  it('should reject completed → working with suggestion', () => {
    const result = validateAgentTransition('completed', 'working');
    expect(result.valid).toBe(false);
    expect(result.suggestion).toContain('resumed');
  });

  it('should reject pending → completed with suggestion', () => {
    const result = validateAgentTransition('pending', 'completed');
    expect(result.valid).toBe(false);
    expect(result.suggestion).toContain('working');
  });
});

describe('validateTodoTransition', () => {
  it('should validate valid transitions', () => {
    const result = validateTodoTransition('pending', 'in_progress');
    expect(result.valid).toBe(true);
  });

  it('should reject cancelled transitions', () => {
    const result = validateTodoTransition('cancelled', 'pending');
    expect(result.valid).toBe(false);
    expect(result.suggestion).toContain('Create a new todo');
  });
});

describe('validateLessonTransition', () => {
  it('should allow active → archived', () => {
    const result = validateLessonTransition('active', 'archived');
    expect(result.valid).toBe(true);
  });

  it('should allow archived → active', () => {
    const result = validateLessonTransition('archived', 'active');
    expect(result.valid).toBe(true);
  });
});

describe('batchValidateTransitions', () => {
  it('should validate multiple transitions', () => {
    const results = batchValidateTransitions([
      { type: 'instance', current: 'running', requested: 'terminated' },
      { type: 'agent', current: 'pending', requested: 'completed' },
    ]);
    
    expect(results).toHaveLength(2);
    expect(results[0]?.valid).toBe(true);
    expect(results[1]?.valid).toBe(false);
  });
});

describe('formatValidationResult', () => {
  it('should format valid result', () => {
    const result = { valid: true, current: 'pending', requested: 'working', allowedTransitions: ['working', 'completed'] };
    const formatted = formatValidationResult(result);
    expect(formatted).toContain('✓');
    expect(formatted).toContain('Valid transition');
  });

  it('should format invalid result with suggestions', () => {
    const result = {
      valid: false,
      current: 'terminated',
      requested: 'running',
      allowedTransitions: [],
      error: 'Cannot transition',
      suggestion: 'Create a new session',
    };
    const formatted = formatValidationResult(result);
    expect(formatted).toContain('✗');
    expect(formatted).toContain('Cannot transition');
    expect(formatted).toContain('Suggestion:');
  });

  it('should include valid transitions in error', () => {
    const result = {
      valid: false,
      current: 'running',
      requested: 'starting',
      allowedTransitions: ['stopped', 'terminated'],
      error: 'Cannot transition',
    };
    const formatted = formatValidationResult(result);
    expect(formatted).toContain('Valid transitions from');
    expect(formatted).toContain('stopped');
  });
});

describe('guardInstanceTransition', () => {
  it('should not throw for valid transition', () => {
    expect(() => guardInstanceTransition('starting', 'running')).not.toThrow();
  });

  it('should throw for invalid transition', () => {
    expect(() => guardInstanceTransition('terminated', 'running')).toThrow('Cannot transition');
  });
});

describe('guardAgentTransition', () => {
  it('should not throw for valid transition', () => {
    expect(() => guardAgentTransition('pending', 'working')).not.toThrow();
  });

  it('should throw for invalid transition', () => {
    expect(() => guardAgentTransition('completed', 'working')).toThrow('Cannot transition');
  });
});

describe('createStatusValidator', () => {
  it('should create a custom validator', () => {
    const states = ['idle', 'running', 'stopped'] as const;
    type TestStatus = (typeof states)[number];
    
    const transitions: Record<TestStatus, readonly TestStatus[]> = {
      idle: ['running'],
      running: ['stopped'],
      stopped: [],
    };

    const validator = createStatusValidator<TestStatus>(
      'test',
      (c, r) => c === r || transitions[c].includes(r),
      (c) => [...transitions[c]]
    );

    expect(validator('idle', 'running').valid).toBe(true);
    expect(validator('idle', 'stopped').valid).toBe(false);
    expect(validator('idle', 'stopped').error).toContain('Cannot transition test');
  });
});
