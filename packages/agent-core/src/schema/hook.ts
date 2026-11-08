import { z } from 'zod';

/**
 * Maximum number of hooks a single user may persist.
 */
export const MAX_HOOKS_PER_USER = 100;

/** Maximum length (characters) of a hook name. */
export const MAX_HOOK_NAME_LENGTH = 64;

/** Maximum length (characters) of a hook description. */
export const MAX_HOOK_DESCRIPTION_LENGTH = 512;

/** Maximum length (characters) of a hook command. */
export const MAX_HOOK_COMMAND_LENGTH = 1024;

/** Maximum length (characters) of a hook inline script. */
export const MAX_HOOK_SCRIPT_LENGTH = 10000;

/**
 * Hook event types based on Cursor hooks documentation.
 * These are lifecycle events where hooks can be triggered.
 */
export const hookEventTypeSchema = z.enum([
  // Session lifecycle
  'sessionStart',
  'sessionEnd',
  // Tool use hooks
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  // Subagent lifecycle
  'subagentStart',
  'subagentStop',
  // Shell/command execution
  'beforeShellExecution',
  'afterShellExecution',
  // File operations
  'beforeReadFile',
  'afterFileEdit',
  // Context management
  'stop',
]);
export type HookEventType = z.infer<typeof hookEventTypeSchema>;

export const hookCreatedBySchema = z.enum(['agent', 'user']);
export type HookCreatedBy = z.infer<typeof hookCreatedBySchema>;

export const hookSchema = z.object({
  PK: z.string(),
  SK: z.string(),
  /** The hook name (identifier) */
  name: z.string().min(1).max(MAX_HOOK_NAME_LENGTH),
  /** Optional description of what the hook does */
  description: z.string().max(MAX_HOOK_DESCRIPTION_LENGTH).optional(),
  /** The event type that triggers this hook */
  event: hookEventTypeSchema,
  /** The command to execute when the hook fires */
  command: z.string().max(MAX_HOOK_COMMAND_LENGTH),
  /** Optional inline script content (stored as string) */
  script: z.string().max(MAX_HOOK_SCRIPT_LENGTH).optional(),
  /** Whether the hook is currently active/enabled */
  isActive: z.boolean().default(false),
  /** Where the hook originated. */
  createdBy: hookCreatedBySchema.default('user'),
  /** Session that produced the hook (for traceability). */
  sourceSessionId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Hook = z.infer<typeof hookSchema>;
