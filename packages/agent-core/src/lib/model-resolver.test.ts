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
      expect(resolveModelConfig({}).bedrockModel).toBe('kimi-k2.5');
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

  describe('partial update safety', () => {
    test('undefined fields do not shadow lower-priority sources', () => {
      const result = resolveModelConfig({
        session: { bedrockDefaultModel: undefined },
        customAgent: {
          bedrockDefaultModel: 'sonnet4.6',
        },
      });
      expect(result.bedrockModel).toBe('sonnet4.6');
    });

    test('empty session does not override agent settings', () => {
      const result = resolveModelConfig({
        session: {},
        customAgent: {
          bedrockDefaultModel: 'haiku4.5',
        },
      });
      expect(result.bedrockModel).toBe('haiku4.5');
    });
  });

  describe('session bedrockDefaultModel is respected in bedrock runtime', () => {
    test('session bedrockDefaultModel overrides customAgent when both are present', () => {
      const result = resolveModelConfig({
        session: { bedrockDefaultModel: 'haiku4.5' },
        customAgent: { bedrockDefaultModel: 'opus4.8', defaultModel: 'kimi-k2.5' },
      });
      expect(result.bedrockModel).toBe('haiku4.5');
    });

    test('session legacy defaultModel is used when session has no bedrockDefaultModel', () => {
      const result = resolveModelConfig({
        session: { defaultModel: 'sonnet4.6' },
        customAgent: { bedrockDefaultModel: 'opus4.8' },
      });
      expect(result.bedrockModel).toBe('sonnet4.6');
    });
  });

  describe('legacy updateAgent({defaultModel}) reflects correctly', () => {
    test('when bedrockDefaultModel is set via reverse sync, resolver picks it up', () => {
      // Simulates the scenario where updateAgent({defaultModel: 'sonnet4.6'})
      // triggers reverse sync to also set bedrockDefaultModel: 'sonnet4.6'
      const agentAfterSync = {
        defaultModel: 'sonnet4.6' as const,
        bedrockDefaultModel: 'sonnet4.6' as const,
      };
      const result = resolveModelConfig({ customAgent: agentAfterSync });
      expect(result.bedrockModel).toBe('sonnet4.6');
    });

    test('bedrockDefaultModel takes priority over stale defaultModel', () => {
      // If an agent had stale bedrockDefaultModel='opus4.8' and user updates
      // defaultModel='sonnet4.6' via legacy API, reverse sync should update
      // bedrockDefaultModel too. But if it didn't, bedrockDefaultModel wins.
      const result = resolveModelConfig({
        customAgent: {
          bedrockDefaultModel: 'opus4.8',
          defaultModel: 'sonnet4.6',
        },
      });
      expect(result.bedrockModel).toBe('opus4.8');
    });
  });
});
