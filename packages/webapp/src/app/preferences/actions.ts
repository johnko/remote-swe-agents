'use server';

import { authActionClient } from '@/lib/safe-action';
import { savePromptSchema } from './schemas';
import {
  writeCommonPrompt,
  updatePreferences,
  updateUserPreferences,
  getUserPreferences,
} from '@remote-swe-agents/agent-core/lib';
import { updateGlobalPreferenceSchema, updateUserPreferencesSchema } from '@remote-swe-agents/agent-core/schema';
import { z } from 'zod';

export const updateAdditionalSystemPrompt = authActionClient
  .inputSchema(savePromptSchema)
  .action(async ({ parsedInput }) => {
    const { additionalSystemPrompt } = parsedInput;
    try {
      await writeCommonPrompt({
        additionalSystemPrompt: additionalSystemPrompt || '',
      });

      return { success: true };
    } catch (error) {
      console.error('Error saving prompt:', error);
      throw new Error('Failed to save prompt configuration');
    }
  });

export const updateGlobalPreferences = authActionClient
  .inputSchema(updateGlobalPreferenceSchema)
  .action(async ({ parsedInput }) => {
    return await updatePreferences(parsedInput);
  });

export const updateUserPreferencesAction = authActionClient
  .inputSchema(updateUserPreferencesSchema)
  .action(async ({ parsedInput, ctx }) => {
    const input = { ...parsedInput };
    return await updateUserPreferences(ctx.userId, input);
  });

export const getUserPreferencesAction = authActionClient.inputSchema(z.object({})).action(async ({ ctx }) => {
  return await getUserPreferences(ctx.userId);
});
