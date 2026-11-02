'use server';

import { authActionClient, MyCustomError } from '@/lib/safe-action';
import {
  listHooks as listHooksDb,
  getHook,
  createHook,
  updateHook,
  deleteHook,
} from '@remote-swe-agents/agent-core/lib';
import {
  Hook,
  hookStatusSchema,
  MAX_HOOK_CONTENT_LENGTH,
  MAX_HOOK_CATEGORY_LENGTH,
} from '@remote-swe-agents/agent-core/schema';
import { z } from 'zod';

// The stored data is server-only. Strip them so they never bloat the RSC payload
// / cross the wire to the client.
export type ClientHook = Omit<Hook, 'PK'>;

const toClientHook = ({ PK: _PK, ...rest }: Hook): ClientHook => rest;

export const listUserHooks = authActionClient.action(async ({ ctx }) => {
  const hooks = await listHooksDb(ctx.userId);
  return hooks.sort((a, b) => b.updatedAt - a.updatedAt).map(toClientHook);
});

const createHookSchema = z.object({
  content: z.string().min(1).max(MAX_HOOK_CONTENT_LENGTH),
  category: z.string().max(MAX_HOOK_CATEGORY_LENGTH).optional(),
});

export const createUserHook = authActionClient
  .inputSchema(createHookSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const hook = await createHook(ctx.userId, {
        content: parsedInput.content,
        category: parsedInput.category || undefined,
        createdBy: 'user',
      });
      return toClientHook(hook);
    } catch (e) {
      throw new MyCustomError((e as Error).message);
    }
  });

const updateHookSchema = z.object({
  hookId: z.string(),
  content: z.string().min(1).max(MAX_HOOK_CONTENT_LENGTH).optional(),
  category: z.string().max(MAX_HOOK_CATEGORY_LENGTH).optional(),
  status: hookStatusSchema.optional(),
});

export const updateUserHook = authActionClient
  .inputSchema(updateHookSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { hookId, ...input } = parsedInput;
    try {
      const hook = await updateHook(ctx.userId, hookId, input);
      return toClientHook(hook);
    } catch (e) {
      throw new MyCustomError((e as Error).message);
    }
  });

const deleteHookSchema = z.object({
  hookId: z.string(),
});

export const deleteUserHook = authActionClient
  .inputSchema(deleteHookSchema)
  .action(async ({ parsedInput, ctx }) => {
    const hook = await getHook(ctx.userId, parsedInput.hookId);
    if (!hook) {
      throw new MyCustomError('Hook not found.');
    }
    await deleteHook(ctx.userId, parsedInput.hookId);
    return { success: true };
  });
