import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getModelDisplayName,
  getProviderDisplayName,
  getPredefinedModelsFromEnv,
} from '../predefinedModelsUtils';

describe('predefinedModelsUtils', () => {
  const mockModels = [
    {
      name: 'glm-5.3-flash',
      provider: 'zai',
      alias: 'GLM 5.3 Flash (Z.AI)',
      subtext: 'Z.AI',
    },
    {
      name: 'glm-5.3-flash',
      provider: 'zai_coding_plan',
      alias: 'GLM 5.3 Flash (Coding Plan)',
      subtext: 'Z.AI Coding Plan',
    },
    {
      name: 'gpt-4o',
      provider: 'openai',
      alias: 'GPT-4o',
      subtext: 'OpenAI',
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('appConfig', {
      get: vi.fn((key: string) => {
        if (key === 'GOOSE_PREDEFINED_MODELS') {
          return JSON.stringify(mockModels);
        }
        return null;
      }),
    });
  });

  it('correctly loads predefined models from env', () => {
    const models = getPredefinedModelsFromEnv();
    expect(models).toHaveLength(3);
  });

  it('distinguishes between zai and zai_coding_plan providers for the same model name', () => {
    const zaiModelName = getModelDisplayName('glm-5.3-flash', 'zai');
    const zaiProviderName = getProviderDisplayName('glm-5.3-flash', 'zai');

    const codingPlanModelName = getModelDisplayName('glm-5.3-flash', 'zai_coding_plan');
    const codingPlanProviderName = getProviderDisplayName('glm-5.3-flash', 'zai_coding_plan');

    expect(zaiModelName).toBe('GLM 5.3 Flash (Z.AI)');
    expect(zaiProviderName).toBe('Z.AI');

    expect(codingPlanModelName).toBe('GLM 5.3 Flash (Coding Plan)');
    expect(codingPlanProviderName).toBe('Z.AI Coding Plan');
  });

  it('falls back to first matching model when providerName is not specified', () => {
    const modelName = getModelDisplayName('glm-5.3-flash');
    expect(modelName).toBe('GLM 5.3 Flash (Z.AI)');
  });

  it('returns raw model name if model is not predefined', () => {
    expect(getModelDisplayName('custom-model-123')).toBe('custom-model-123');
    expect(getProviderDisplayName('custom-model-123')).toBe('');
  });
});
