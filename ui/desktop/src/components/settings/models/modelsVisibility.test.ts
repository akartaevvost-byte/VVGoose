import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatContextWindow,
  modelSupportsReasoning,
  modelSupportsVision,
  getModelPricingTier,
  computeDefaultVisibleModels,
  addCustomModelToProvider,
  removeCustomModelFromProvider,
  toggleModelVisibilityForProvider,
  resetVisibleModelsForProvider,
  loadVisibleModelsSetting,
  loadCustomModelsSetting,
} from './modelsVisibility';

describe('modelsVisibility utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatContextWindow', () => {
    it('formats numbers correctly', () => {
      expect(formatContextWindow(null)).toBeNull();
      expect(formatContextWindow(0)).toBeNull();
      expect(formatContextWindow(128000)).toBe('128k');
      expect(formatContextWindow(200000)).toBe('200k');
      expect(formatContextWindow(1000000)).toBe('1M');
      expect(formatContextWindow(2000000)).toBe('2M');
      expect(formatContextWindow(512)).toBe('512');
    });
  });

  describe('modelSupportsReasoning', () => {
    it('detects reasoning models by flag or pattern', () => {
      expect(modelSupportsReasoning('custom-model', true)).toBe(true);
      expect(modelSupportsReasoning('custom-model', false)).toBe(false);
      expect(modelSupportsReasoning('o1-preview')).toBe(true);
      expect(modelSupportsReasoning('o3-mini')).toBe(true);
      expect(modelSupportsReasoning('deepseek-r1')).toBe(true);
      expect(modelSupportsReasoning('claude-3-7-sonnet-20250219')).toBe(true);
      expect(modelSupportsReasoning('gpt-4o')).toBe(false);
      expect(modelSupportsReasoning('claude-3-5-sonnet-20241022')).toBe(false);
    });
  });

  describe('modelSupportsVision', () => {
    it('detects vision support by flag or pattern', () => {
      expect(modelSupportsVision('custom-model', true)).toBe(true);
      expect(modelSupportsVision('custom-model', false)).toBe(false);
      expect(modelSupportsVision('gpt-4o')).toBe(true);
      expect(modelSupportsVision('claude-3-5-sonnet-latest')).toBe(true);
      expect(modelSupportsVision('gemini-2.0-flash')).toBe(true);
      expect(modelSupportsVision('deepseek-r1')).toBe(false);
    });
  });

  describe('getModelPricingTier', () => {
    it('identifies pricing tiers correctly', () => {
      expect(getModelPricingTier('any-model', 'local')).toBe('Free');
      expect(getModelPricingTier('any-model', 'ollama')).toBe('Free');
      expect(getModelPricingTier('gpt-4o-mini', 'openai')).toBe('$');
      expect(getModelPricingTier('claude-3-5-haiku', 'anthropic')).toBe('$');
      expect(getModelPricingTier('gpt-4o', 'openai')).toBe('$$');
      expect(getModelPricingTier('claude-3-5-sonnet', 'anthropic')).toBe('$$');
      expect(getModelPricingTier('claude-3-opus', 'anthropic')).toBe('$$$');
      expect(getModelPricingTier('o1', 'openai')).toBe('$$$');
    });
  });

  describe('computeDefaultVisibleModels', () => {
    it('includes default model and top matching preferred models', () => {
      const provider = {
        name: 'anthropic',
        metadata: {
          default_model: 'claude-3-5-sonnet-latest',
          known_models: [
            { name: 'claude-3-5-sonnet-latest' },
            { name: 'claude-3-7-sonnet-latest' },
            { name: 'claude-3-5-haiku-latest' },
            { name: 'claude-3-opus-latest' },
            { name: 'claude-2.1' },
            { name: 'claude-instant-1.2' },
          ],
        },
      };

      const result = computeDefaultVisibleModels(provider);
      expect(result).toContain('claude-3-5-sonnet-latest');
      expect(result).toContain('claude-3-7-sonnet-latest');
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('settings management (add, remove, toggle, reset)', () => {
    it('adds custom model and marks it visible', async () => {
      const res = await addCustomModelToProvider('openai', 'gpt-4.5-preview');
      expect(res.custom['openai']).toContain('gpt-4.5-preview');
      expect(res.visible['openai']).toContain('gpt-4.5-preview');

      const customStored = await loadCustomModelsSetting();
      expect(customStored['openai']).toContain('gpt-4.5-preview');
    });

    it('removes custom model from both custom and visible sets', async () => {
      await addCustomModelToProvider('openai', 'temp-test-model');
      const res = await removeCustomModelFromProvider('openai', 'temp-test-model');
      expect(res.custom['openai']).not.toContain('temp-test-model');
      expect(res.visible['openai']).not.not?.toContain('temp-test-model');
    });

    it('toggles visibility correctly', async () => {
      const defaults = ['model-a', 'model-b'];
      // Hide model-a
      let visible = await toggleModelVisibilityForProvider('test-prov', 'model-a', true, defaults);
      expect(visible['test-prov']).not.toContain('model-a');
      expect(visible['test-prov']).toContain('model-b');

      // Unhide model-a
      visible = await toggleModelVisibilityForProvider('test-prov', 'model-a', false, defaults);
      expect(visible['test-prov']).toContain('model-a');
    });

    it('resets visible models for a provider or all providers', async () => {
      await toggleModelVisibilityForProvider('prov1', 'm1', false, []);
      await toggleModelVisibilityForProvider('prov2', 'm2', false, []);

      await resetVisibleModelsForProvider('prov1');
      let visible = await loadVisibleModelsSetting();
      expect(visible['prov1']).toBeUndefined();
      expect(visible['prov2']).toBeDefined();

      await resetVisibleModelsForProvider();
      visible = await loadVisibleModelsSetting();
      expect(Object.keys(visible).length).toBe(0);
    });
  });
});
