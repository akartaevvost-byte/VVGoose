export interface ModelCapabilityInfo {
  contextLimit?: number | null;
  formattedContextLimit?: string | null;
  supportsReasoning: boolean;
  supportsVision: boolean;
  pricingTier?: string | null;
}

export const PREFERRED_MODEL_PATTERNS: RegExp[] = [
  /claude-3-7-sonnet/i,
  /claude-3\.7-sonnet/i,
  /claude-sonnet-4/i,
  /claude-3-5-sonnet/i,
  /claude-3\.5-sonnet/i,
  /gpt-4o(?!-mini)/i,
  /gpt-4o-mini/i,
  /o3-mini/i,
  /o1/i,
  /gemini-2\.0-flash/i,
  /gemini-2\.0-pro/i,
  /gemini-1\.5-pro/i,
  /deepseek-r1/i,
  /llama-3/i,
  /claude-3-5-haiku/i,
  /qwen/i,
];

export function formatContextWindow(contextLimit?: number | null): string | null {
  if (!contextLimit || contextLimit <= 0) return null;
  if (contextLimit >= 1_000_000) {
    const millions = (contextLimit / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${millions}M`;
  }
  if (contextLimit >= 1_000) {
    return `${Math.round(contextLimit / 1_000)}k`;
  }
  return `${contextLimit}`;
}

export function modelSupportsReasoning(modelName: string, explicitReasoning?: boolean): boolean {
  if (explicitReasoning !== undefined && explicitReasoning !== null) {
    return Boolean(explicitReasoning);
  }
  return /(?:^|\b|\/|-)(?:o1|o3|r1|deepseek-r1|thinking|claude-3-7|qwq)(?:$|\b|-|\/)/i.test(
    modelName
  );
}

export function modelSupportsVision(modelName: string, explicitVision?: boolean): boolean {
  if (explicitVision !== undefined && explicitVision !== null) {
    return Boolean(explicitVision);
  }
  return /(?:vision|gpt-4o|claude-3|claude-4|gemini|llava|pixtral|qwen-vl)/i.test(modelName);
}

export function getModelPricingTier(
  modelName: string,
  provider: string,
  inputCost?: number | null
): string | null {
  const normalizedProvider = provider.toLowerCase();
  if (normalizedProvider === 'local' || normalizedProvider === 'ollama') {
    return 'Free';
  }
  if (inputCost !== undefined && inputCost !== null) {
    if (inputCost === 0) return 'Free';
    if (inputCost < 1.0) return '$';
    if (inputCost < 5.0) return '$$';
    return '$$$';
  }
  if (/(?:mini|haiku|flash|nano|small|8b|1\.5-flash)/i.test(modelName)) {
    return '$';
  }
  if (/(?:sonnet|gpt-4o|pro|70b)/i.test(modelName)) {
    return '$$';
  }
  if (/(?:opus|o1|405b|pro-exp)/i.test(modelName)) {
    return '$$$';
  }
  return null;
}

export function getModelCapabilities(model: {
  name: string;
  provider: string;
  context_limit?: number;
  reasoning?: boolean;
  vision?: boolean;
  input_token_cost?: number | null;
}): ModelCapabilityInfo {
  return {
    contextLimit: model.context_limit,
    formattedContextLimit: formatContextWindow(model.context_limit),
    supportsReasoning: modelSupportsReasoning(model.name, model.reasoning),
    supportsVision: modelSupportsVision(model.name, model.vision),
    pricingTier: getModelPricingTier(model.name, model.provider, model.input_token_cost),
  };
}

export function computeDefaultVisibleModels(
  provider: {
    name: string;
    metadata?: { default_model?: string; known_models?: { name: string }[] };
  },
  availableModels: { name: string }[] = []
): string[] {
  const modelNames: string[] = [];
  const addModel = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !modelNames.includes(trimmed)) {
      modelNames.push(trimmed);
    }
  };

  // Add default model first
  if (provider.metadata?.default_model) {
    addModel(provider.metadata.default_model);
  }

  // Combine names from availableModels and known_models
  const pool = [
    ...availableModels.map((m) => m.name),
    ...(provider.metadata?.known_models?.map((m) => m.name) ?? []),
  ];

  if (pool.length <= 5) {
    pool.forEach(addModel);
    return modelNames.length > 0
      ? modelNames
      : pool.length > 0
        ? pool
        : provider.metadata?.default_model
          ? [provider.metadata.default_model]
          : [];
  }

  // Find preferred models in priority order
  for (const pattern of PREFERRED_MODEL_PATTERNS) {
    const match = pool.find((name) => pattern.test(name));
    if (match) {
      addModel(match);
      if (modelNames.length >= 5) break;
    }
  }

  // If still fewer than 3, add from pool
  for (const name of pool) {
    if (modelNames.length >= 4) break;
    addModel(name);
  }

  return modelNames;
}

export async function loadVisibleModelsSetting(): Promise<Record<string, string[]>> {
  try {
    const config = await window.electron.getSetting('visibleModels');
    return config && typeof config === 'object' ? config : {};
  } catch {
    return {};
  }
}

export async function saveVisibleModelsSetting(
  visibleModels: Record<string, string[]>
): Promise<void> {
  await window.electron.setSetting('visibleModels', visibleModels);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('goose-visible-models-changed'));
  }
}

export async function loadCustomModelsSetting(): Promise<Record<string, string[]>> {
  try {
    const config = await window.electron.getSetting('customModels');
    return config && typeof config === 'object' ? config : {};
  } catch {
    return {};
  }
}

export async function saveCustomModelsSetting(
  customModels: Record<string, string[]>
): Promise<void> {
  await window.electron.setSetting('customModels', customModels);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('goose-visible-models-changed'));
  }
}

export async function addCustomModelToProvider(
  providerName: string,
  modelName: string
): Promise<{ custom: Record<string, string[]>; visible: Record<string, string[]> }> {
  const trimmed = modelName.trim();
  if (!trimmed) {
    throw new Error('Model identifier cannot be empty');
  }

  const [custom, visible] = await Promise.all([
    loadCustomModelsSetting(),
    loadVisibleModelsSetting(),
  ]);

  const existingCustom = custom[providerName] || [];
  if (!existingCustom.includes(trimmed)) {
    custom[providerName] = [...existingCustom, trimmed];
    await saveCustomModelsSetting(custom);
  }

  const existingVisible = visible[providerName] || [];
  if (!existingVisible.includes(trimmed)) {
    visible[providerName] = [...existingVisible, trimmed];
    await saveVisibleModelsSetting(visible);
  }

  return { custom, visible };
}

export async function removeCustomModelFromProvider(
  providerName: string,
  modelName: string
): Promise<{ custom: Record<string, string[]>; visible: Record<string, string[]> }> {
  const [custom, visible] = await Promise.all([
    loadCustomModelsSetting(),
    loadVisibleModelsSetting(),
  ]);

  if (custom[providerName]) {
    custom[providerName] = custom[providerName].filter((m) => m !== modelName);
    await saveCustomModelsSetting(custom);
  }

  if (visible[providerName]) {
    visible[providerName] = visible[providerName].filter((m) => m !== modelName);
    await saveVisibleModelsSetting(visible);
  }

  return { custom, visible };
}

export async function toggleModelVisibilityForProvider(
  providerName: string,
  modelName: string,
  currentlyVisible: boolean,
  defaultModels: string[]
): Promise<Record<string, string[]>> {
  const visible = await loadVisibleModelsSetting();
  const currentList = visible[providerName] ?? [...defaultModels];

  const updatedList = currentlyVisible
    ? currentList.filter((m) => m !== modelName)
    : currentList.includes(modelName)
      ? currentList
      : [...currentList, modelName];

  visible[providerName] = updatedList;
  await saveVisibleModelsSetting(visible);
  return visible;
}

export async function resetVisibleModelsForProvider(
  providerName?: string
): Promise<Record<string, string[]>> {
  const visible = await loadVisibleModelsSetting();
  if (providerName) {
    delete visible[providerName];
  } else {
    for (const key of Object.keys(visible)) {
      delete visible[key];
    }
  }
  await saveVisibleModelsSetting(visible);
  return visible;
}

export const CLI_PROVIDER_BINARIES: Record<string, string> = {
  'cursor-agent': 'cursor-agent',
  'cursor_agent': 'cursor-agent',
  'gemini-cli': 'gemini',
  'claude-code': 'claude',
  'codex': 'codex',
  'claude-acp': 'claude-agent-acp',
  'codex-acp': 'codex-acp',
  'copilot-acp': 'copilot-acp',
  'amp-acp': 'amp',
  'pi-acp': 'pi-acp',
  'ollama': 'ollama',
};

export function getCliBinaryForProvider(providerName: string): string | null {
  const normalized = providerName.toLowerCase().trim();
  return CLI_PROVIDER_BINARIES[normalized] || null;
}

export async function isProviderAccessible(
  provider: { name: string; is_configured?: boolean; is_available?: boolean },
  fetchResult?: { error?: string | null; models?: unknown[] | null }
): Promise<boolean> {
  if (!provider.is_configured) {
    return false;
  }

  if (fetchResult && fetchResult.error && (!fetchResult.models || fetchResult.models.length === 0)) {
    return false;
  }

  const cliBinary = getCliBinaryForProvider(provider.name);
  if (cliBinary) {
    if (cliBinary === 'ollama') {
      try {
        const hasCli = await window.electron?.isCommandAvailable?.('ollama');
        if (hasCli) return true;
        const isRunning = await window.electron?.checkForOllama?.();
        if (isRunning) return true;
      } catch {
        // ignore error
      }
      return provider.is_available ?? false;
    }

    if (window.electron?.isCommandAvailable) {
      try {
        const available = await window.electron.isCommandAvailable(cliBinary);
        return Boolean(available);
      } catch {
        return false;
      }
    }
    return provider.is_available ?? false;
  }

  return true;
}
