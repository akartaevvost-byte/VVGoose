import { useState, useEffect, useCallback } from 'react';
import { Brain, Eye, Plus, Trash2, RotateCcw, Sparkles, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { defineMessages, useIntl } from '../../../i18n';
import type { ProviderDetails } from '../../../types/providers';
import { acpListProviderDetails } from '../../../acp/providers';
import {
  addCustomModelToProvider,
  computeDefaultVisibleModels,
  formatContextWindow,
  getModelPricingTier,
  loadCustomModelsSetting,
  loadVisibleModelsSetting,
  modelSupportsReasoning,
  modelSupportsVision,
  removeCustomModelFromProvider,
  resetVisibleModelsForProvider,
  toggleModelVisibilityForProvider,
} from './modelsVisibility';
import { fetchModelsForProviders } from './modelInterface';
import type { View } from '../../../utils/navigationUtils';

const i18n = defineMessages({
  title: {
    id: 'modelVisibilitySettings.title',
    defaultMessage: 'Visible Models (Quick Selector)',
  },
  description: {
    id: 'modelVisibilitySettings.description',
    defaultMessage:
      'Choose which models appear in the quick model selector in the chat toolbar. Pinned models can be switched in a single click without opening settings.',
  },
  resetAll: {
    id: 'modelVisibilitySettings.resetAll',
    defaultMessage: 'Reset to Defaults',
  },
  resetProvider: {
    id: 'modelVisibilitySettings.resetProvider',
    defaultMessage: 'Reset {provider}',
  },
  addCustomModel: {
    id: 'modelVisibilitySettings.addCustomModel',
    defaultMessage: 'Add',
  },
  customModelPlaceholder: {
    id: 'modelVisibilitySettings.customModelPlaceholder',
    defaultMessage: 'Add custom model ID (e.g. gpt-4.5-preview, claude-3-7-sonnet)',
  },
  customBadge: {
    id: 'modelVisibilitySettings.customBadge',
    defaultMessage: 'Custom',
  },
  noProviders: {
    id: 'modelVisibilitySettings.noProviders',
    defaultMessage: 'No configured providers found. Please configure a provider first.',
  },
  visibleCount: {
    id: 'modelVisibilitySettings.visibleCount',
    defaultMessage: '{count} visible',
  },
  filterPlaceholder: {
    id: 'modelVisibilitySettings.filterPlaceholder',
    defaultMessage: 'Filter models...',
  },
});

interface ModelVisibilitySettingsProps {
  setView?: (view: View) => void;
}

interface ProviderModelItem {
  name: string;
  provider: string;
  context_limit?: number;
  reasoning?: boolean;
  vision?: boolean;
  isCustom?: boolean;
}

export default function ModelVisibilitySettings({ setView }: ModelVisibilitySettingsProps) {
  const intl = useIntl();
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  const [providerModelsMap, setProviderModelsMap] = useState<Record<string, ProviderModelItem[]>>(
    {}
  );
  const [visibleModels, setVisibleModels] = useState<Record<string, string[]>>({});
  const [, setCustomModels] = useState<Record<string, string[]>>({});
  const [customInputMap, setCustomInputMap] = useState<Record<string, string>>({});
  const [filterQuery, setFilterQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [allProviders, savedVisible, savedCustom] = await Promise.all([
        acpListProviderDetails().catch(() => [] as ProviderDetails[]),
        loadVisibleModelsSetting(),
        loadCustomModelsSetting(),
      ]);

      const active = allProviders.filter((p) => p.is_configured);
      setProviders(active);
      setVisibleModels(savedVisible);
      setCustomModels(savedCustom);

      // Fetch dynamic models for active providers
      const modelsResults = await fetchModelsForProviders(active).catch(() => []);
      const newModelsMap: Record<string, ProviderModelItem[]> = {};

      active.forEach((p) => {
        const fetched = modelsResults.find((r) => r.provider.name === p.name)?.models || [];
        const known = p.metadata.known_models || [];
        const custom = savedCustom[p.name] || [];

        const combinedMap = new Map<string, ProviderModelItem>();

        // Add known models
        known.forEach((m) => {
          combinedMap.set(m.name, {
            name: m.name,
            provider: p.name,
            context_limit: m.context_limit ?? undefined,
            reasoning: m.reasoning ?? undefined,
            vision: undefined,
            isCustom: false,
          });
        });

        // Add fetched dynamic models
        fetched.forEach((m) => {
          const existing = combinedMap.get(m.name);
          combinedMap.set(m.name, {
            name: m.name,
            provider: p.name,
            context_limit: m.context_limit ?? existing?.context_limit,
            reasoning: m.reasoning ?? existing?.reasoning,
            vision: undefined,
            isCustom: false,
          });
        });

        // Add custom user models
        custom.forEach((customName) => {
          if (!combinedMap.has(customName)) {
            combinedMap.set(customName, {
              name: customName,
              provider: p.name,
              isCustom: true,
            });
          } else {
            const item = combinedMap.get(customName)!;
            item.isCustom = true;
          }
        });

        // Ensure default_model is present
        if (p.metadata.default_model && !combinedMap.has(p.metadata.default_model)) {
          combinedMap.set(p.metadata.default_model, {
            name: p.metadata.default_model,
            provider: p.name,
            isCustom: false,
          });
        }

        newModelsMap[p.name] = Array.from(combinedMap.values());
      });

      setProviderModelsMap(newModelsMap);
    } catch (error) {
      console.error('Failed to load model visibility settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const handleSync = () => {
      void loadVisibleModelsSetting().then(setVisibleModels);
      void loadCustomModelsSetting().then(setCustomModels);
    };

    window.addEventListener('goose-visible-models-changed', handleSync);
    return () => {
      window.removeEventListener('goose-visible-models-changed', handleSync);
    };
  }, [loadData]);

  const handleToggle = async (
    providerName: string,
    modelName: string,
    currentlyVisible: boolean
  ) => {
    const provider = providers.find((p) => p.name === providerName);
    const available = providerModelsMap[providerName] || [];
    const defaults = provider ? computeDefaultVisibleModels(provider, available) : [];

    const updated = await toggleModelVisibilityForProvider(
      providerName,
      modelName,
      currentlyVisible,
      defaults
    );
    setVisibleModels({ ...updated });
  };

  const handleAddCustomModel = async (providerName: string) => {
    const val = (customInputMap[providerName] || '').trim();
    if (!val) return;

    try {
      const { custom, visible } = await addCustomModelToProvider(providerName, val);
      setCustomModels({ ...custom });
      setVisibleModels({ ...visible });
      setCustomInputMap((prev) => ({ ...prev, [providerName]: '' }));

      // Also ensure it is in the provider models map
      setProviderModelsMap((prev) => {
        const existing = prev[providerName] || [];
        if (existing.some((m) => m.name === val)) return prev;
        return {
          ...prev,
          [providerName]: [...existing, { name: val, provider: providerName, isCustom: true }],
        };
      });
    } catch (e) {
      console.error('Error adding custom model:', e);
    }
  };

  const handleRemoveCustomModel = async (providerName: string, modelName: string) => {
    try {
      const { custom, visible } = await removeCustomModelFromProvider(providerName, modelName);
      setCustomModels({ ...custom });
      setVisibleModels({ ...visible });
      setProviderModelsMap((prev) => {
        const existing = prev[providerName] || [];
        return {
          ...prev,
          [providerName]: existing.filter((m) => !(m.name === modelName && m.isCustom)),
        };
      });
    } catch (e) {
      console.error('Error removing custom model:', e);
    }
  };

  const handleResetAll = async () => {
    const updated = await resetVisibleModelsForProvider();
    setVisibleModels({ ...updated });
  };

  const handleResetProvider = async (providerName: string) => {
    const updated = await resetVisibleModelsForProvider(providerName);
    setVisibleModels({ ...updated });
  };

  const getVisibleListForProvider = useCallback(
    (p: ProviderDetails): string[] => {
      if (visibleModels[p.name] !== undefined) {
        return visibleModels[p.name];
      }
      const available = providerModelsMap[p.name] || [];
      return computeDefaultVisibleModels(p, available);
    },
    [visibleModels, providerModelsMap]
  );

  return (
    <Card className="rounded-lg border border-border-primary bg-background-primary shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {intl.formatMessage(i18n.title)}
            </CardTitle>
            <CardDescription className="text-xs text-text-secondary mt-1">
              {intl.formatMessage(i18n.description)}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetAll}
            className="flex items-center gap-1.5 self-start text-xs h-8"
            title="Reset visibility to recommended defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {intl.formatMessage(i18n.resetAll)}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {providers.length > 1 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              type="text"
              placeholder={intl.formatMessage(i18n.filterPlaceholder)}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-8 text-xs h-8 bg-background-secondary"
            />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2 py-4">
            <div className="h-10 bg-background-secondary/60 rounded-md animate-pulse" />
            <div className="h-10 bg-background-secondary/60 rounded-md animate-pulse" />
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-6 text-xs text-text-muted">
            <p>{intl.formatMessage(i18n.noProviders)}</p>
            {setView && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => setView('ConfigureProviders')}
              >
                Configure Providers
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {providers.map((provider) => {
              const allModels = providerModelsMap[provider.name] || [];
              const visibleList = getVisibleListForProvider(provider);
              const customInput = customInputMap[provider.name] || '';

              const filteredModels = filterQuery
                ? allModels.filter((m) => m.name.toLowerCase().includes(filterQuery.toLowerCase()))
                : allModels;

              if (filterQuery && filteredModels.length === 0) {
                return null;
              }

              return (
                <div
                  key={provider.name}
                  className="rounded-lg border border-border-subtle bg-background-secondary/30 p-3 space-y-3"
                  data-testid={`provider-visibility-${provider.name}`}
                >
                  {/* Provider Header */}
                  <div className="flex items-center justify-between border-b border-border-subtle/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {provider.metadata.display_name || provider.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background-tertiary text-text-muted">
                        {intl.formatMessage(i18n.visibleCount, { count: visibleList.length })}
                      </span>
                    </div>

                    <button
                      onClick={() => handleResetProvider(provider.name)}
                      className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1 transition-colors"
                      title="Reset provider to default visible models"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {intl.formatMessage(i18n.resetProvider, {
                        provider: provider.metadata.display_name || provider.name,
                      })}
                    </button>
                  </div>

                  {/* Add Custom Model form for this provider */}
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder={intl.formatMessage(i18n.customModelPlaceholder)}
                      value={customInput}
                      onChange={(e) =>
                        setCustomInputMap((prev) => ({
                          ...prev,
                          [provider.name]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleAddCustomModel(provider.name);
                        }
                      }}
                      className="text-xs h-8 bg-background-primary flex-1"
                      data-testid={`input-custom-model-${provider.name}`}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleAddCustomModel(provider.name)}
                      disabled={!customInput.trim()}
                      className="h-8 text-xs flex items-center gap-1 px-3"
                      data-testid={`btn-add-custom-model-${provider.name}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {intl.formatMessage(i18n.addCustomModel)}
                    </Button>
                  </div>

                  {/* Model Checklist */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 pt-1">
                    {filteredModels.map((item) => {
                      const isVisible = visibleList.includes(item.name);
                      const isReasoning = modelSupportsReasoning(item.name, item.reasoning);
                      const isVision = modelSupportsVision(item.name, item.vision);
                      const contextLimit = formatContextWindow(item.context_limit);
                      const pricing = getModelPricingTier(item.name, item.provider);

                      return (
                        <div
                          key={item.name}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-xs transition-colors ${
                            isVisible
                              ? 'bg-background-primary border-border-primary/80 text-text-primary'
                              : 'bg-background-primary/40 border-transparent text-text-muted hover:bg-background-primary/70'
                          }`}
                        >
                          <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => handleToggle(provider.name, item.name, isVisible)}
                              className="w-3.5 h-3.5 rounded border-border-primary text-primary focus:ring-primary/30"
                              data-testid={`checkbox-model-${item.name}`}
                            />
                            <span
                              className={`truncate font-mono text-[11px] ${
                                isVisible ? 'font-medium text-text-primary' : 'text-text-muted'
                              }`}
                              title={item.name}
                            >
                              {item.name}
                            </span>
                          </label>

                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            {item.isCustom && (
                              <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/20 font-sans">
                                {intl.formatMessage(i18n.customBadge)}
                              </span>
                            )}
                            {isReasoning && (
                              <span
                                title="Reasoning / Extended thinking"
                                className="inline-flex items-center text-[10px] p-0.5 rounded text-purple-400"
                              >
                                <Brain className="w-3 h-3" />
                              </span>
                            )}
                            {isVision && (
                              <span
                                title="Vision / Multimodal"
                                className="inline-flex items-center text-[10px] p-0.5 rounded text-blue-400"
                              >
                                <Eye className="w-3 h-3" />
                              </span>
                            )}
                            {contextLimit && (
                              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-background-tertiary text-text-secondary border border-border-subtle">
                                {contextLimit}
                              </span>
                            )}
                            {pricing && (
                              <span className="text-[10px] font-mono text-text-muted">
                                {pricing}
                              </span>
                            )}
                            {item.isCustom && (
                              <button
                                onClick={() => handleRemoveCustomModel(provider.name, item.name)}
                                className="text-text-muted hover:text-text-danger ml-1 p-0.5 transition-colors"
                                title="Remove custom model"
                                data-testid={`btn-remove-custom-model-${item.name}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
