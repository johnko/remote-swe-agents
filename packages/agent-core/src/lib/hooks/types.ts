import z from 'zod';

/**
 * Hook lifecycle events supported by rswea
 */
export enum HookEvent {
  // Session lifecycle
  SESSION_START = 'sessionStart',
  SESSION_END = 'sessionEnd',

  // Tool execution
  TOOL_BEFORE = 'toolBefore',
  TOOL_AFTER = 'toolAfter',
  TOOL_ERROR = 'toolError',

  // Message handling
  MESSAGE_RECEIVED = 'messageReceived',
  MESSAGE_SENT = 'messageSent',

  // Worker lifecycle
  WORKER_START = 'workerStart',
  WORKER_STOP = 'workerStop',

  // Agent lifecycle
  AGENT_START = 'agentStart',
  AGENT_END = 'agentEnd',
}

/**
 * Hook execution type
 */
export enum HookExecutionType {
  COMMAND = 'command',
  FUNCTION = 'function',
}

/**
 * Permission verdict for blocking hooks
 */
export enum HookPermission {
  ALLOW = 'allow',
  DENY = 'deny',
}

/**
 * Base hook payload structure
 */
export interface HookPayload {
  timestamp: number;
  event: HookEvent;
  workerId?: string;
  [key: string]: unknown;
}

/**
 * Session lifecycle hook payloads
 */
export interface SessionStartPayload extends HookPayload {
  event: HookEvent.SESSION_START;
  sessionId: string;
  userId: string;
  parentSessionId?: string;
}

export interface SessionEndPayload extends HookPayload {
  event: HookEvent.SESSION_END;
  sessionId: string;
  userId: string;
  duration: number;
}

/**
 * Tool execution hook payloads
 */
export interface ToolBeforePayload extends HookPayload {
  event: HookEvent.TOOL_BEFORE;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface ToolAfterPayload extends HookPayload {
  event: HookEvent.TOOL_AFTER;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: string;
}

export interface ToolErrorPayload extends HookPayload {
  event: HookEvent.TOOL_ERROR;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  errorMessage: string;
}

/**
 * Message handling hook payloads
 */
export interface MessageReceivedPayload extends HookPayload {
  event: HookEvent.MESSAGE_RECEIVED;
  sessionId: string;
  userId: string;
  message: string;
}

export interface MessageSentPayload extends HookPayload {
  event: HookEvent.MESSAGE_SENT;
  sessionId: string;
  message: string;
}

/**
 * Worker lifecycle hook payloads
 */
export interface WorkerStartPayload extends HookPayload {
  event: HookEvent.WORKER_START;
  workerId: string;
  runtimeType: 'ec2' | 'agent-core';
}

export interface WorkerStopPayload extends HookPayload {
  event: HookEvent.WORKER_STOP;
  workerId: string;
}

/**
 * Agent lifecycle hook payloads
 */
export interface AgentStartPayload extends HookPayload {
  event: HookEvent.AGENT_START;
  sessionId: string;
  agentId: string;
}

export interface AgentEndPayload extends HookPayload {
  event: HookEvent.AGENT_END;
  sessionId: string;
  agentId: string;
}

export type AnyHookPayload =
  | SessionStartPayload
  | SessionEndPayload
  | ToolBeforePayload
  | ToolAfterPayload
  | ToolErrorPayload
  | MessageReceivedPayload
  | MessageSentPayload
  | WorkerStartPayload
  | WorkerStopPayload
  | AgentStartPayload
  | AgentEndPayload;

/**
 * Hook response structure
 */
export interface HookResponse {
  permission?: HookPermission;
  allowed?: boolean;
  blocked?: boolean;
  reason?: string;
  modified?: boolean;
  updatedPayload?: AnyHookPayload;
  error?: string;
}

/**
 * Hook definition in .agents/hooks.json
 */
export interface HookDefinition {
  name: string;
  description?: string;
  event: HookEvent | HookEvent[];
  type: HookExecutionType;
  command?: string;
  function?: string;
  blocking?: boolean;
  timeout?: number;
  enabled?: boolean;
}

/**
 * Hook configuration file schema
 */
export const hooksConfigSchema = z.object({
  hooks: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      event: z.union([
        z.nativeEnum(HookEvent),
        z.array(z.nativeEnum(HookEvent)),
      ]),
      type: z.nativeEnum(HookExecutionType),
      command: z.string().optional(),
      function: z.string().optional(),
      blocking: z.boolean().optional().default(false),
      timeout: z.number().optional().default(5000),
      enabled: z.boolean().optional().default(true),
    })
  ).optional().default([]),
});

export type HooksConfig = z.infer<typeof hooksConfigSchema>;

/**
 * Registered hook with metadata
 */
export interface RegisteredHook extends HookDefinition {
  id: string;
  registeredAt: number;
}

/**
 * Hook execution result
 */
export interface HookExecutionResult {
  hookId: string;
  event: HookEvent;
  success: boolean;
  duration: number;
  response?: HookResponse;
  error?: Error;
}
