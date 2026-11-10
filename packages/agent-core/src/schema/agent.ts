import { z } from 'zod';
import { inferenceModeSchema, ModelType, modelTypeSchema } from './model.js';
import { agentStatusSchema, runtimeTypeSchema, type AgentStatus, type RuntimeType } from './state-machines.js';

// Re-export schemas (not types - those are already re-exported via index.ts)
export { agentStatusSchema, runtimeTypeSchema };

export const defaultRuntimeType: RuntimeType = 'agent-core';

/**
 * Default agent configuration values.
 * Used by createSession (when no custom agent is specified) and by the worker's DefaultAgent definition.
 * This is the single source of truth for default runtime type and model.
 */
export const defaultAgentConfig: { runtimeType: RuntimeType; defaultModel: ModelType; bedrockDefaultModel: ModelType } =
  {
    runtimeType: 'agent-core',
    defaultModel: 'kimi-k2.5',
    bedrockDefaultModel: 'kimi-k2.5',
  };

export const customAgentSchema = z.object({
  PK: z.literal('custom-agent'),
  SK: z.string(),
  name: z.string(),
  description: z.string(),
  defaultModel: modelTypeSchema,
  systemPrompt: z.string(),
  tools: z.array(z.string()),
  useAllTools: z.boolean().optional(),
  mcpConfig: z.string(),
  runtimeType: runtimeTypeSchema,
  iconKey: z.string().optional(),
  includeDefaultKnowledge: z.boolean().optional(),
  inferenceMode: inferenceModeSchema.optional(),
  bedrockDefaultModel: modelTypeSchema.optional(),
  parentAgentId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type CustomAgent = z.infer<typeof customAgentSchema>;
