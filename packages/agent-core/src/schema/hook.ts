import { z } from 'zod';

/**
 * Maximum number of hooks a single user may persist. Keeps the per-user
 * retrieval scan bounded and cheap.
 */
export const MAX_HOOKS_PER_USER = 100;

/** Maximum length (characters) of a single hook body. */
export const MAX_HOOK_CONTENT_LENGTH = 2000;

/** Maximum length (characters) of the optional category label. */
export const MAX_HOOK_CATEGORY_LENGTH = 64;

export const hookStatusSchema = z.enum(['active', 'archived']);
export type HookStatus = z.infer<typeof hookStatusSchema>;

export const hookCreatedBySchema = z.enum(['agent', 'user']);
export type HookCreatedBy = z.infer<typeof hookCreatedBySchema>;

export const hookSchema = z.object({
  PK: z.string(),
  SK: z.string(),
  /** The hook text (what the hook does). */
  content: z.string().min(1).max(MAX_HOOK_CONTENT_LENGTH),
  /** Optional free-form category label for grouping (e.g. in a management UI). */
  category: z.string().max(MAX_HOOK_CATEGORY_LENGTH).optional(),
  /* SCOPE: hooks are scoped per-user via the partition key `hook-<userId>`. */
  /** Where the hook originated. */
  createdBy: hookCreatedBySchema.default('agent'),
  /** Session that produced the hook (for traceability). */
  sourceSessionId: z.string().optional(),
  /** 'active' hooks are eligible for use; 'archived' are hidden. */
  status: hookStatusSchema.default('active'),
  /** Timestamp when the hook was created. */
  createdAt: z.number(),
  /** Timestamp when the hook was last updated. */
  updatedAt: z.number(),
});

export type Hook = z.infer<typeof hookSchema>;
