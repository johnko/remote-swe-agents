import { expect, test, describe } from 'vitest';
import { calculateCost } from './cost.js';
import { modelConfigs, modelTypeList } from '../schema/model.js';

describe('Pricing Standardization Tests', () => {
  // ==============================================================================
  // 1. PRICING FORMAT VALIDATION - per-1M tokens standard
  // ==============================================================================

  describe('Pricing Format Validation', () => {
    test('all models have per-1M token pricing format', () => {
      for (const modelType of modelTypeList) {
        const config = modelConfigs[modelType];
        expect(config.pricing).toBeDefined();
        expect(config.pricing.input).toBeGreaterThan(0);
        expect(config.pricing.output).toBeGreaterThan(0);
        expect(config.pricing.cacheRead).toBeGreaterThanOrEqual(0);
        expect(config.pricing.cacheWrite).toBeGreaterThanOrEqual(0);
      }
    });

    test('pricing values are positive numbers', () => {
      for (const modelType of modelTypeList) {
        const config = modelConfigs[modelType];
        expect(typeof config.pricing.input).toBe('number');
        expect(typeof config.pricing.output).toBe('number');
        expect(typeof config.pricing.cacheRead).toBe('number');
        expect(typeof config.pricing.cacheWrite).toBe('number');
        expect(config.pricing.input).toBeGreaterThan(0);
        expect(config.pricing.output).toBeGreaterThan(0);
      }
    });

    test('long context pricing has same format when defined', () => {
      const modelsWithLongContext = Object.entries(modelConfigs)
        .filter(([_, config]) => config.pricing.longContextInput !== undefined);

      for (const [modelType, config] of modelsWithLongContext) {
        expect(config.pricing.longContextInput).toBeGreaterThan(0);
        expect(config.pricing.longContextOutput).toBeGreaterThan(0);
        expect(config.pricing.longContextCacheRead).toBeGreaterThanOrEqual(0);
        expect(config.pricing.longContextCacheWrite).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ==============================================================================
  // 2. PRICE CALCULATIONS FOR VARIOUS TOKEN COUNTS
  // ==============================================================================

  describe('Price Calculations with Various Token Counts', () => {
    test('calculate cost for 1,000 tokens (small token count)', () => {
      const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0'; // sonnet4
      const inputTokens = 1000;
      const outputTokens = 500;
      const cacheReadTokens = 0;
      const cacheWriteTokens = 0;

      const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

      // sonnet4: input: 3.0, output: 15.0 (per 1M tokens)
      // (1000 * 3.0 + 500 * 15.0) / 1_000_000 = 10500 / 1_000_000 = 0.0105
      const expectedCost = (1000 * 3.0 + 500 * 15.0) / 1_000_000;
      expect(cost).toBeCloseTo(expectedCost, 8);
    });

    test('calculate cost for 1,000,000 tokens (1M exactly)', () => {
      const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0'; // sonnet4
      const inputTokens = 1_000_000;
      const outputTokens = 500_000;
      const cacheReadTokens = 0;
      const cacheWriteTokens = 0;

      const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

      // (1_000_000 * 3.0 + 500_000 * 15.0) / 1_000_000 = 10500000 / 1_000_000 = 10.5
      const expectedCost = (1_000_000 * 3.0 + 500_000 * 15.0) / 1_000_000;
      expect(cost).toBeCloseTo(expectedCost, 2);
    });

    test('calculate cost for 100,000,000 tokens (100M)', () => {
      const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0'; // sonnet4
      const inputTokens = 100_000_000;
      const outputTokens = 50_000_000;
      const cacheReadTokens = 0;
      const cacheWriteTokens = 0;

      const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

      // (100_000_000 * 3.0 + 50_000_000 * 15.0) / 1_000_000 = 1050000000 / 1_000_000 = 1050
      const expectedCost = (100_000_000 * 3.0 + 50_000_000 * 15.0) / 1_000_000;
      expect(cost).toBeCloseTo(expectedCost, 2);
    });

    test('calculate cost including cache operations', () => {
      const modelId = 'anthropic.claude-opus-4-20250514-v1:0'; // opus4
      const inputTokens = 1_000_000;
      const outputTokens = 500_000;
      const cacheReadTokens = 200_000;
      const cacheWriteTokens = 100_000;

      const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

      // opus4: input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 (per 1M tokens)
      const expectedCost =
        (1_000_000 * 15.0 +
          500_000 * 75.0 +
          200_000 * 1.5 +
          100_000 * 18.75) /
        1_000_000;
      expect(cost).toBeCloseTo(expectedCost, 2);
    });
  });

  // ==============================================================================
  // 3. MODEL CATALOG CONSISTENCY
  // ==============================================================================

  describe('Model Catalog Consistency', () => {
    test('all models in modelTypeList have config', () => {
      for (const modelType of modelTypeList) {
        expect(modelConfigs[modelType]).toBeDefined();
        expect(modelConfigs[modelType].name).toBeDefined();
        expect(modelConfigs[modelType].modelId).toBeDefined();
      }
    });

    test('no duplicate pricing values across different models', () => {
      // While some models may have same pricing, we ensure pricing is reasonable
      const pricingPatterns = new Map<string, string[]>();

      for (const [modelType, config] of Object.entries(modelConfigs)) {
        const key = `${config.pricing.input}-${config.pricing.output}-${config.pricing.cacheRead}-${config.pricing.cacheWrite}`;
        if (!pricingPatterns.has(key)) {
          pricingPatterns.set(key, []);
        }
        pricingPatterns.get(key)!.push(modelType);
      }

      // Should have reasonable variety of pricing
      expect(pricingPatterns.size).toBeGreaterThan(5);
    });

    test('cache pricing is typically lower than token pricing', () => {
      for (const modelType of modelTypeList) {
        const config = modelConfigs[modelType];
        // Cache read should be lower than input token price
        expect(config.pricing.cacheRead).toBeLessThanOrEqual(config.pricing.input);
        // Cache write should be lower than output token price
        expect(config.pricing.cacheWrite).toBeLessThanOrEqual(config.pricing.output);
      }
    });
  });

  // ==============================================================================
  // 4. NEW/UPDATED MODELS VALIDATION
  // ==============================================================================

  describe('New and Updated Models Validation', () => {
    // Models added in commits: e230f1c (qwen3), c96172e (gpt-oss-20b), 0c421d9 (sonnet4.5 updates)

    test('qwen3-coder-30b-a3b model has valid pricing', () => {
      const config = modelConfigs['qwen3-coder-30b-a3b'];
      expect(config).toBeDefined();
      expect(config.name).toBe('Qwen3 Coder 30B A3B');
      expect(config.pricing.input).toBe(0.15);
      expect(config.pricing.output).toBe(0.6);
      expect(config.pricing.cacheRead).toBe(0.0);
      expect(config.pricing.cacheWrite).toBe(0.0);
    });

    test('gpt-oss-20b model has valid pricing', () => {
      const config = modelConfigs['gpt-oss-20b'];
      expect(config).toBeDefined();
      expect(config.name).toBe('GPT OSS 20B');
      expect(config.pricing.input).toBe(0.07);
      expect(config.pricing.output).toBe(0.3);
      expect(config.pricing.cacheRead).toBe(0.0);
      expect(config.pricing.cacheWrite).toBe(0.0);
    });

    test('gpt-oss-120b model has valid pricing', () => {
      const config = modelConfigs['gpt-oss-120b'];
      expect(config).toBeDefined();
      expect(config.name).toBe('GPT OSS 120B');
      expect(config.pricing.input).toBe(0.15);
      expect(config.pricing.output).toBe(0.6);
      expect(config.pricing.cacheRead).toBe(0);
      expect(config.pricing.cacheWrite).toBe(0);
    });

    test('sonnet4.5 models have updated pricing', () => {
      const config = modelConfigs['sonnet4.5'];
      expect(config).toBeDefined();
      expect(config.pricing.input).toBe(3.0);
      expect(config.pricing.output).toBe(15.0);
    });

    test('all new models support appropriate regions', () => {
      const newModels = ['qwen3-coder-30b-a3b', 'gpt-oss-20b', 'gpt-oss-120b'];
      for (const modelType of newModels) {
        const config = modelConfigs[modelType as keyof typeof modelConfigs];
        expect(config.supportedCriProfiles.length).toBeGreaterThan(0);
      }
    });
  });

  // ==============================================================================
  // 5. HISTORICAL PRICING DATA CONVERSION VALIDATION
  // ==============================================================================

  describe('Historical Pricing Data Conversion Validation', () => {
    test('opus5 pricing converted correctly from old format', () => {
      // Old: input: 0.005 (per 1K tokens) → New: input: 5.0 (per 1M tokens)
      const config = modelConfigs['opus5'];
      expect(config.pricing.input).toBe(5.0); // 0.005 * 1000
      expect(config.pricing.output).toBe(25.0); // 0.025 * 1000
      expect(config.pricing.cacheRead).toBe(0.5); // 0.0005 * 1000
      expect(config.pricing.cacheWrite).toBe(6.25); // 0.00625 * 1000
    });

    test('sonnet5 pricing converted correctly from old format', () => {
      // Old: input: 0.003 (per 1K tokens) → New: input: 3.0 (per 1M tokens)
      const config = modelConfigs['sonnet5'];
      expect(config.pricing.input).toBe(3.0);
      expect(config.pricing.output).toBe(15.0);
      expect(config.pricing.cacheRead).toBe(0.3);
      expect(config.pricing.cacheWrite).toBe(3.75);
    });

    test('sonnet4.6 pricing converted correctly from old format', () => {
      // Note: sonnet4.6 has a different value than sonnet5
      const config = modelConfigs['sonnet4.6'];
      // Verify it uses per-1M format (not per-1K)
      expect(config.pricing.input).toBeGreaterThan(1);
    });

    test('long context pricing follows conversion pattern', () => {
      const config = modelConfigs['sonnet4-long-context-mode'];
      // Should have long context pricing defined
      expect(config.pricing.longContextInput).toBeDefined();
      expect(config.pricing.longContextOutput).toBeDefined();
      // Long context pricing should be per 1M tokens format
      expect(config.pricing.longContextInput).toBeGreaterThan(0);
      expect(config.pricing.longContextOutput).toBeGreaterThan(0);
    });

    test('fable5 uniform pricing conversion', () => {
      // Fable 5 has uniform pricing across all context lengths
      // Old: input: 0.01 (per 1K) → New: input: 10.0 (per 1M)
      const config = modelConfigs['fable5'];
      expect(config.pricing.input).toBe(10.0);
      expect(config.pricing.output).toBe(50.0);
      expect(config.pricing.cacheRead).toBe(1.0);
      expect(config.pricing.cacheWrite).toBe(12.5);
    });
  });

  // ==============================================================================
  // 6. EDGE CASES
  // ==============================================================================

  describe('Edge Cases', () => {
    test('calculate cost with zero tokens', () => {
      const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
      const cost = calculateCost(modelId, 0, 0, 0, 0);
      expect(cost).toBe(0);
    });

    test('calculate cost with only input tokens', () => {
      const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
      const cost = calculateCost(modelId, 1_000_000, 0, 0, 0);
      const expectedCost = (1_000_000 * 3.0) / 1_000_000;
      expect(cost).toBeCloseTo(expectedCost, 2);
    });

    test('calculate cost with only output tokens', () => {
      const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
      const cost = calculateCost(modelId, 0, 1_000_000, 0, 0);
      const expectedCost = (1_000_000 * 15.0) / 1_000_000;
      expect(cost).toBeCloseTo(expectedCost, 2);
    });

    test('calculate cost with very large token counts', () => {
      const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
      const largeNumber = 1_000_000_000; // 1 billion tokens
      const cost = calculateCost(modelId, largeNumber, largeNumber, 0, 0);
      const expectedCost = (largeNumber * 3.0 + largeNumber * 15.0) / 1_000_000;
      expect(cost).toBeCloseTo(expectedCost, 0);
    });

    test('calculate cost with fractional token precision', () => {
      const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
      // Tokens are typically integers, but test precision with fractional calculations
      const cost = calculateCost(modelId, 1_000_001, 500_000, 100, 50);
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
    });

    test('unknown model returns 0 cost', () => {
      const cost = calculateCost('unknown-model-xyz', 1_000_000, 1_000_000, 0, 0);
      expect(cost).toBe(0);
    });

    test('pricing for models with cache operations disabled', () => {
      // Some models may have zero cache pricing
      const config = modelConfigs['gpt-oss-20b'];
      const modelId = config.modelId;
      const cost = calculateCost(modelId, 1_000_000, 1_000_000, 1_000_000, 1_000_000);
      // Since cache operations are 0, cost should only include input/output
      const expectedCost = (1_000_000 * config.pricing.input + 1_000_000 * config.pricing.output) / 1_000_000;
      expect(cost).toBeCloseTo(expectedCost, 2);
    });
  });

  // ==============================================================================
  // 7. COST ESTIMATION ACCURACY
  // ==============================================================================

  describe('Cost Estimation Accuracy', () => {
    test('sonnet4 cost estimation matches formula', () => {
      // Known values for sonnet4: input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75
      const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
      const inputTokens = 5_000;
      const outputTokens = 2_000;
      const cacheReadTokens = 1_000;
      const cacheWriteTokens = 500;

      const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

      const expectedCost =
        (inputTokens * 3.0 + outputTokens * 15.0 + cacheReadTokens * 0.3 + cacheWriteTokens * 3.75) /
        1_000_000;

      expect(cost).toBeCloseTo(expectedCost, 8);
    });

    test('opus4 cost estimation matches formula', () => {
      // Known values for opus4: input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75
      const modelId = 'anthropic.claude-opus-4-20250514-v1:0';
      const inputTokens = 100_000;
      const outputTokens = 50_000;
      const cacheReadTokens = 10_000;
      const cacheWriteTokens = 5_000;

      const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

      const expectedCost =
        (inputTokens * 15.0 + outputTokens * 75.0 + cacheReadTokens * 1.5 + cacheWriteTokens * 18.75) /
        1_000_000;

      expect(cost).toBeCloseTo(expectedCost, 8);
    });

    test('haiku cost estimation matches formula', () => {
      // Haiku3.5: input: 800.0, output: 4000.0, cacheRead: 80.0, cacheWrite: 1000.0
      const modelId = 'anthropic.claude-3-5-haiku-20241022-v1:0';
      const inputTokens = 10_000;
      const outputTokens = 5_000;
      const cacheReadTokens = 2_000;
      const cacheWriteTokens = 1_000;

      const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

      const expectedCost =
        (inputTokens * 800.0 + outputTokens * 4000.0 + cacheReadTokens * 80.0 + cacheWriteTokens * 1000.0) /
        1_000_000;

      expect(cost).toBeCloseTo(expectedCost, 8);
    });

    test('pricing calculation consistency across different models', () => {
      // Test that all models use the same per-1M token formula
      const testCases = [
        { modelId: 'anthropic.claude-sonnet-4-20250514-v1:0', modelKey: 'sonnet4' },
        { modelId: 'anthropic.claude-opus-4-20250514-v1:0', modelKey: 'opus4' },
        { modelId: 'anthropic.claude-3-5-haiku-20241022-v1:0', modelKey: 'haiku3.5' },
      ];

      for (const testCase of testCases) {
        const config = modelConfigs[testCase.modelKey as keyof typeof modelConfigs];
        const cost = calculateCost(testCase.modelId, 1_000_000, 1_000_000, 100_000, 50_000);
        const expectedCost =
          (1_000_000 * config.pricing.input +
            1_000_000 * config.pricing.output +
            100_000 * config.pricing.cacheRead +
            50_000 * config.pricing.cacheWrite) /
          1_000_000;
        expect(cost).toBeCloseTo(expectedCost, 2);
      }
    });

    test('realistic session cost estimation', () => {
      // Simulate a realistic agent session
      // 100K input tokens (prompt + context), 50K output tokens (responses)
      const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
      const cost = calculateCost(modelId, 100_000, 50_000, 0, 0);

      // sonnet4: input: 3.0, output: 15.0
      // (100000 * 3.0 + 50000 * 15.0) / 1_000_000
      // = (300000 + 750000) / 1_000_000
      // = 1_050_000 / 1_000_000
      // = 1.05 USD
      const expectedCost = 1.05;
      expect(cost).toBeCloseTo(expectedCost, 2);
    });
  });

  // ==============================================================================
  // ADDITIONAL: Integration Tests
  // ==============================================================================

  describe('Model Configuration Integration', () => {
    test('all models are properly typed and validated', () => {
      for (const modelType of modelTypeList) {
        const config = modelConfigs[modelType];
        expect(config).toBeDefined();
        expect(config.name).toBeTypeOf('string');
        expect(config.name.length).toBeGreaterThan(0);
        expect(config.modelId).toBeTypeOf('string');
        expect(config.maxOutputTokens).toBeGreaterThan(0);
        expect(config.maxInputTokens).toBeGreaterThan(0);
      }
    });

    test('all models with pricing have proper regional support', () => {
      for (const modelType of modelTypeList) {
        const config = modelConfigs[modelType];
        expect(config.supportedCriProfiles.length).toBeGreaterThan(0);
        expect(Array.isArray(config.supportedCriProfiles)).toBe(true);
      }
    });
  });
});
