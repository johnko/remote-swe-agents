/**
 * Security Logger
 * ===============
 * Structured logging for security-relevant events.
 * 
 * This module provides a centralized security audit logging facility that:
 * - Logs security events with consistent structure
 * - Includes correlation IDs for tracing
 * - Supports different log levels for security events
 * - Avoids logging sensitive data (PII, credentials)
 * 
 * Security event categories:
 * - session_lifecycle: Session start, resume, termination
 * - tool_execution: Tool invocations, results, failures
 * - permission: Permission hook denials, modifications
 * - authentication: Auth events (without credentials)
 * - error: Security-relevant errors with context
 */

export type SecurityEventCategory =
  | 'session_lifecycle'
  | 'tool_execution'
  | 'permission'
  | 'authentication'
  | 'error'
  | 'audit';

export type SecurityEventLevel = 'info' | 'warn' | 'error';

export interface SecurityEvent {
  category: SecurityEventCategory;
  level: SecurityEventLevel;
  timestamp: string;
  sessionId: string;
  operation: string;
  message: string;
  details?: Record<string, unknown>;
}

type ToolExecutionDetails = {
  blocked?: boolean;
  modified?: boolean;
  durationMs?: number;
  [key: string]: unknown;
};

/**
 * Sanitize event details to prevent sensitive data leakage
 * Removes potential PII/credentials from logged data
 */
const sanitizeDetails = (details: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!details) return undefined;
  
  const sensitiveKeys = ['password', 'token', 'secret', 'apikey', 'api_key', 'credential', 'auth', 'authorization'];
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      // Truncate long strings to prevent log flooding
      sanitized[key] = value.substring(0, 500) + '... [truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Format security event for logging
 */
const formatSecurityEvent = (event: SecurityEvent): string => {
  const sanitizedEvent: SecurityEvent = {
    ...event,
    details: sanitizeDetails(event.details),
  };
  
  const base = `[security:${sanitizedEvent.category}:${sanitizedEvent.level}]`;
  const meta = `session=${sanitizedEvent.sessionId} operation=${sanitizedEvent.operation}`;
  const msg = sanitizedEvent.message;
  const details = sanitizedEvent.details ? ` details=${JSON.stringify(sanitizedEvent.details)}` : '';
  
  return `${base} ${meta} ${msg}${details}`;
};

/**
 * Log a security event
 */
export const logSecurityEvent = (event: Omit<SecurityEvent, 'timestamp'>): void => {
  const fullEvent: SecurityEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  
  const formatted = formatSecurityEvent(fullEvent);
  
  switch (event.level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'info':
    default:
      console.log(formatted);
      break;
  }
};

/**
 * Session lifecycle logging helpers
 */
export const logSessionStart = (sessionId: string, initiator?: string): void => {
  logSecurityEvent({
    category: 'session_lifecycle',
    level: 'info',
    sessionId,
    operation: 'session_start',
    message: 'Session started',
    details: { initiator: initiator || 'unknown' },
  });
};

export const logSessionResume = (sessionId: string): void => {
  logSecurityEvent({
    category: 'session_lifecycle',
    level: 'info',
    sessionId,
    operation: 'session_resume',
    message: 'Session resumed',
  });
};

export const logSessionTerminated = (sessionId: string, reason: string): void => {
  logSecurityEvent({
    category: 'session_lifecycle',
    level: 'info',
    sessionId,
    operation: 'session_terminated',
    message: `Session terminated: ${reason}`,
  });
};

export const logSessionError = (sessionId: string, error: unknown, context?: string): void => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logSecurityEvent({
    category: 'session_lifecycle',
    level: 'error',
    sessionId,
    operation: 'session_error',
    message: context ? `Session error (${context}): ${errorMessage}` : `Session error: ${errorMessage}`,
  });
};

/**
 * Tool execution logging helpers
 */
export const logToolExecution = (
  sessionId: string,
  toolName: string,
  success: boolean,
  details?: ToolExecutionDetails
): void => {
  logSecurityEvent({
    category: 'tool_execution',
    level: success ? 'info' : 'warn',
    sessionId,
    operation: 'tool_execution',
    message: `Tool ${toolName} ${success ? 'executed' : 'failed'}`,
    details: { toolName, success, ...details },
  });
};

export const logToolBlocked = (
  sessionId: string,
  toolName: string,
  reason: string
): void => {
  logSecurityEvent({
    category: 'tool_execution',
    level: 'warn',
    sessionId,
    operation: 'tool_blocked',
    message: `Tool ${toolName} blocked: ${reason}`,
    details: { toolName, reason },
  });
};

/**
 * Permission logging helpers
 */
export const logPermissionDenied = (
  sessionId: string,
  userId: string,
  resource: string,
  action: string,
  reason?: string
): void => {
  logSecurityEvent({
    category: 'permission',
    level: 'warn',
    sessionId,
    operation: 'permission_denied',
    message: `Permission denied for ${action} on ${resource}`,
    details: { userId, resource, action, reason: reason || 'Not specified' },
  });
};

export const logPermissionModified = (
  sessionId: string,
  originalCommand: string,
  modifiedCommand: string,
  reason: string
): void => {
  logSecurityEvent({
    category: 'permission',
    level: 'info',
    sessionId,
    operation: 'permission_modified',
    message: 'Command modified by permission hook',
    details: { originalCommand: '[REDACTED]', modifiedCommand: '[REDACTED]', reason },
  });
};

/**
 * Error logging with context
 */
export const logSecurityError = (
  sessionId: string,
  operation: string,
  error: unknown,
  context?: Record<string, unknown>
): void => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logSecurityEvent({
    category: 'error',
    level: 'error',
    sessionId,
    operation,
    message: errorMessage,
    details: context,
  });
};

/**
 * Audit logging for critical operations
 */
export const logAuditEvent = (
  sessionId: string,
  action: string,
  actor: string,
  resource: string,
  outcome: 'success' | 'failure'
): void => {
  logSecurityEvent({
    category: 'audit',
    level: outcome === 'success' ? 'info' : 'warn',
    sessionId,
    operation: 'audit_event',
    message: `${actor} performed ${action} on ${resource}: ${outcome}`,
    details: { action, actor, resource, outcome },
  });
};
