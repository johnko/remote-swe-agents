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
  hookEventTypeSchema,
  MAX_HOOK_NAME_LENGTH,
  MAX_HOOK_DESCRIPTION_LENGTH,
  MAX_HOOK_COMMAND_LENGTH,
  MAX_HOOK_SCRIPT_LENGTH,
} from '@remote-swe-agents/agent-core/schema';
import { z } from 'zod';

// Strip PK from client-facing hooks
export type ClientHook = Omit<Hook, 'PK'>;

const toClientHook = ({ PK: _PK, ...rest }: Hook): ClientHook => rest;

export const listUserHooks = authActionClient.action(async ({ ctx }) => {
  const hooks = await listHooksDb(ctx.userId);
  return hooks.sort((a, b) => b.updatedAt - a.updatedAt).map(toClientHook);
});

const createHookSchema = z.object({
  name: z.string().min(1).max(MAX_HOOK_NAME_LENGTH),
  description: z.string().max(MAX_HOOK_DESCRIPTION_LENGTH).optional(),
  event: hookEventTypeSchema,
  command: z.string().min(1).max(MAX_HOOK_COMMAND_LENGTH),
  script: z.string().max(MAX_HOOK_SCRIPT_LENGTH).optional(),
  isEnabled: z.boolean().optional(),
});

export const createUserHook = authActionClient.inputSchema(createHookSchema).action(async ({ parsedInput, ctx }) => {
  try {
    const hook = await createHook(ctx.userId, {
      ...parsedInput,
      createdBy: 'user',
    });
    return toClientHook(hook);
  } catch (e) {
    throw new MyCustomError((e as Error).message);
  }
});

const updateHookSchema = z.object({
  hookId: z.string(),
  name: z.string().min(1).max(MAX_HOOK_NAME_LENGTH).optional(),
  description: z.string().max(MAX_HOOK_DESCRIPTION_LENGTH).optional(),
  event: hookEventTypeSchema.optional(),
  command: z.string().min(1).max(MAX_HOOK_COMMAND_LENGTH).optional(),
  script: z.string().max(MAX_HOOK_SCRIPT_LENGTH).optional(),
  isEnabled: z.boolean().optional(),
});

export const updateUserHook = authActionClient.inputSchema(updateHookSchema).action(async ({ parsedInput, ctx }) => {
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

export const deleteUserHook = authActionClient.inputSchema(deleteHookSchema).action(async ({ parsedInput, ctx }) => {
  const hook = await getHook(ctx.userId, parsedInput.hookId);
  if (!hook) {
    throw new MyCustomError('Hook not found.');
  }
  await deleteHook(ctx.userId, parsedInput.hookId);
  return { success: true };
});
