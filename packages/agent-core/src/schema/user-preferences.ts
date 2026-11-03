import { z } from 'zod';
import { inferenceModeSchema, modelTypeSchema } from './model.js';

export const userPreferencesSchema = z.object({
  PK: z.literal('user-preferences'),
  SK: z.string(),
  inferenceMode: inferenceModeSchema.optional(),
  kiroModel: z.string().optional(),
  bedrockDefaultModel: modelTypeSchema.optional(),
  updatedAt: z.number().default(0),
});

export const updateUserPreferencesSchema = z.object({
  inferenceMode: inferenceModeSchema.optional(),
  kiroModel: z.string().optional(),
  bedrockDefaultModel: modelTypeSchema.optional(),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;
