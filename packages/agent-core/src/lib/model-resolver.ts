import { ModelType, modelConfigs } from '../schema/index.js';
import { defaultAgentConfig } from '../schema/agent.js';

/**
 * Flat model-field input that a single source (session, custom agent, or user
 * preferences) may carry.
 */
export interface ModelFields {
  bedrockDefaultModel?: ModelType;
  // Legacy fallback for records persisted before refactor
  defaultModel?: ModelType;
}

/**
 * Per-message overrides that take highest priority. These come from the UI's
 * model selector on individual messages.
 */
export interface ModelOverrides {
  modelOverride?: ModelType | string;
}

/**
 * Full context needed to resolve the effective model configuration for a
 * session. Each source is optional.
 *
 * Priority (highest → lowest):
 *   overrides → session → customAgent → userPreferences → defaults
 */
export interface ModelResolutionContext {
  overrides?: ModelOverrides;
  session?: Partial<ModelFields>;
  customAgent?: Partial<ModelFields>;
  userPreferences?: Partial<ModelFields>;
}

export interface ModelResolutionResult {
  /** Always 'bedrock' since kiro-cli has been removed */
  inferenceMode: 'bedrock';
  bedrockModel: ModelType;
}

/**
 * Resolve the effective bedrock model from overrides + chain of sources.
 * Override takes top priority, then new field (`bedrockDefaultModel`) over
 * legacy (`defaultModel`) within each source.
 */
const resolveBedrockModel = (ctx: ModelResolutionContext): ModelType => {
  if (ctx.overrides?.modelOverride) {
    const override = ctx.overrides.modelOverride as ModelType;
    if (modelConfigs[override]) return override;
  }
  const sources = [ctx.session, ctx.customAgent, ctx.userPreferences];
  for (const src of sources) {
    if (!src) continue;
    if (src.bedrockDefaultModel) return src.bedrockDefaultModel;
    if (src.defaultModel) return src.defaultModel;
  }
  return defaultAgentConfig.defaultModel;
};

/**
 * Single entry point for resolving the full model configuration.
 *
 * Returns:
 * - `inferenceMode`: always 'bedrock' (kiro-cli has been removed)
 * - `bedrockModel`: the resolved Bedrock model ID
 *
 * Resolution precedence:
 * 1. Per-message override (highest — from UI model selector)
 * 2. Session-level setting (baked at creation)
 * 3. Custom agent setting
 * 4. User preferences
 * 5. Defaults (lowest)
 */
export const resolveModelConfig = (ctx: ModelResolutionContext): ModelResolutionResult => {
  return {
    inferenceMode: 'bedrock',
    bedrockModel: resolveBedrockModel(ctx),
  };
};
