import { expect, test } from 'vitest';
import { calculateCost } from './cost.js';

test('calculateCost for sonnet3.7 model', () => {
  // GIVEN
  const modelId = 'us.anthropic.claude-3-7-sonnet-20250219-v1:0';
  const inputTokens = 1000;
  const outputTokens = 500;
  const cacheReadTokens = 200;
  const cacheWriteTokens = 100;

  // WHEN
  const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

  // THEN
  // Pricing is per 1M tokens: input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75
  const expectedCost = (1000 * 3.0 + 500 * 15.0 + 200 * 0.3 + 100 * 3.75) / 1_000_000;
  expect(cost).toBeCloseTo(expectedCost, 8);
});

test('calculateCost for haiku3.5 model', () => {
  // GIVEN
  const modelId = 'apac.anthropic.claude-3-5-haiku-20241022-v1:0';
  const inputTokens = 2000;
  const outputTokens = 1000;
  const cacheReadTokens = 500;
  const cacheWriteTokens = 250;

  // WHEN
  const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

  // THEN
  // Pricing is per 1M tokens: input: 800.0, output: 4000.0, cacheRead: 80.0, cacheWrite: 1000.0
  const expectedCost = (2000 * 800.0 + 1000 * 4000.0 + 500 * 80.0 + 250 * 1000.0) / 1_000_000;
  expect(cost).toBeCloseTo(expectedCost, 8);
});

test('calculateCost returns 0 for unknown model', () => {
  // GIVEN
  const modelId = 'unknown-model-id';
  const inputTokens = 1000;
  const outputTokens = 500;
  const cacheReadTokens = 200;
  const cacheWriteTokens = 100;

  // WHEN
  const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

  // THEN
  expect(cost).toBe(0);
});

test('calculateCost with zero tokens', () => {
  // GIVEN
  const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
  const inputTokens = 0;
  const outputTokens = 0;
  const cacheReadTokens = 0;
  const cacheWriteTokens = 0;

  // WHEN
  const cost = calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

  // THEN
  expect(cost).toBe(0);
});
