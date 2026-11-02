import { describe, expect, test } from 'vitest';
import { resolveModelConfig } from './model-resolver.js';

describe('resolveModelConfig', () => {
  describe('inferenceMode resolution', () => {
    test('always returns bedrock since kiro-cli has been removed', () => {
      expect(resolveModelConfig({}).inferenceMode).toBe('bedrock');
    });
  });

  describe('bedrockModel resolution', () => {
    test('defaults to defaultAgentConfig.defaultModel when nothing is set', () => {
      expect(resolveModelConfig({}).bedrockModel).toBe('sonnet4.6');
    });

    test('new field bedrockDefaultModel takes priority over legacy defaultModel within same source', () => {
      expect(
        resolveModelConfig({
          customAgent: {
            bedrockDefaultModel: 'sonnet4.6',
            defaultModel: 'sonnet3.7',
          },
        }).bedrockModel
      ).toBe('sonnet4.6');
    });

    test('legacy defaultModel is used when bedrockDefaultModel is absent (backward compat)', () => {
      expect(
        resolveModelConfig({
          customAgent: {
            defaultModel: 'sonnet3.7',
          },
        }).bedrockModel
      ).toBe('sonnet3.7');
    });

    test('session setting takes priority over customAgent', () => {
      expect(
        resolveModelConfig({
          session: { bedrockDefaultModel: 'haiku4.5' },
          customAgent: { bedrockDefaultModel: 'opus4.8' },
        }).bedrockModel
      ).toBe('haiku4.5');
    });

    test('override takes highest priority', () => {
      expect(
        resolveModelConfig({
          overrides: { modelOverride: 'haiku4.5' },
          session: { bedrockDefaultModel: 'opus4.8' },
          customAgent: { bedrockDefaultModel: 'sonnet4.6' },
        }).bedrockModel
      ).toBe('haiku4.5');
    });

    test('invalid override model is ignored', () => {
      expect(
        resolveModelConfig({
          overrides: { modelOverride: 'nonexistent-model' },
          customAgent: { bedrockDefaultModel: 'sonnet4.6' },
        }).bedrockModel
      ).toBe('sonnet4.6');
    });
  });
});
