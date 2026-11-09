import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest';
import { checkRateLimit, recordFailedAttempt, clearRateLimit, getClientIP } from './rate-limiter.js';

describe('Rate Limiter', () => {
  beforeEach(() => {
    // Clear rate limit store before each test
    // Access the internal store through module exports if available
    const store = (global as any).__rateLimitStore;
    if (store) {
      store.clear();
    }
  });

  describe('checkRateLimit', () => {
    test('returns unlimited for unknown key', () => {
      const result = checkRateLimit('unknown-key');
      expect(result.isLimited).toBe(false);
      expect(result.remainingAttempts).toBe(5);
      expect(result.blocked).toBe(false);
    });

    test('returns remaining attempts after failed attempts', () => {
      const key = 'test-key-1';
      recordFailedAttempt(key);
      recordFailedAttempt(key);
      const result = checkRateLimit(key);
      expect(result.isLimited).toBe(false);
      expect(result.remainingAttempts).toBe(3);
    });

    test('blocks after max attempts reached', () => {
      const key = 'test-key-2';
      // Trigger blocking
      recordFailedAttempt(key);
      recordFailedAttempt(key);
      recordFailedAttempt(key);
      recordFailedAttempt(key);
      recordFailedAttempt(key);
      
      const result = checkRateLimit(key);
      expect(result.isLimited).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.remainingAttempts).toBe(0);
      expect(result.blockExpiresAt).toBeDefined();
    });
  });

  describe('recordFailedAttempt', () => {
    test('creates new entry for first attempt', () => {
      const key = 'test-key-3';
      const result = recordFailedAttempt(key);
      expect(result.isBlocked).toBe(false);
      expect(result.blockExpiresAt).toBeUndefined();
    });

    test('blocks after reaching max attempts', () => {
      const key = 'test-key-4';
      // 5 attempts to trigger block
      recordFailedAttempt(key);
      recordFailedAttempt(key);
      recordFailedAttempt(key);
      recordFailedAttempt(key);
      const result = recordFailedAttempt(key);
      
      expect(result.isBlocked).toBe(true);
      expect(result.blockExpiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('clearRateLimit', () => {
    test('clears rate limit entry', () => {
      const key = 'test-key-5';
      recordFailedAttempt(key);
      recordFailedAttempt(key);
      
      clearRateLimit(key);
      
      const result = checkRateLimit(key);
      expect(result.remainingAttempts).toBe(5);
    });
  });

  describe('getClientIP', () => {
    test('extracts IP from x-forwarded-for header', () => {
      const request = {
        headers: new Map([['x-forwarded-for', '192.168.1.1, 10.0.0.1']]),
      } as unknown as Request;
      
      expect(getClientIP(request)).toBe('192.168.1.1');
    });

    test('extracts IP from x-real-ip header', () => {
      const request = {
        headers: new Map([['x-real-ip', '192.168.1.1']]),
      } as unknown as Request;
      
      expect(getClientIP(request)).toBe('192.168.1.1');
    });

    test('prefers x-forwarded-for over x-real-ip', () => {
      const request = {
        headers: new Map([
          ['x-forwarded-for', '10.0.0.1'],
          ['x-real-ip', '192.168.1.1'],
        ]),
      } as unknown as Request;
      
      expect(getClientIP(request)).toBe('10.0.0.1');
    });

    test('returns null when no headers present', () => {
      const request = {
        headers: new Map(),
      } as unknown as Request;
      
      expect(getClientIP(request)).toBeNull();
    });
  });
});
