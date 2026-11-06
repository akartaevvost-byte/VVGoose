import {
  Sliders,
  Bot,
  LoaderCircle,
  Settings,
  Search,
  Check,
  Brain,
  Eye,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useModelAndProvider } from '../../../ModelAndProviderContext';
import { SwitchModelModal } from '../subcomponents/SwitchModelModal';
import { View, ViewOptions } from '../../../../utils/navigationUtils';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover';
import Model, {
  getProviderMetadata,
  fetchModelReasoning,
  fetchModelsForProviders,
} from '../modelInterface';
import {
  getModelDisplayName,
  getPredefinedModelsFromEnv,
  shouldShowPredefinedModels,
} from '../predefinedModelsUtils';
import {
  computeDefaultVisibleModels,
  formatContextWindow,
  getModelPricingTier,
  isProviderAccessible,
  loadCustomModelsSetting,
  loadVisibleModelsSetting,
  modelSupportsReasoning,
  modelSupportsVision,
} from '../modelsVisibility';
import { acpListProviderDetails, acpReadThinkingEffort } from '../../../../acp/providers';
import type { ProviderDetails } from '../../../../types/providers';

import { ModelSettingsPanel } from '../../localInference/ModelSettingsPanel';
import { ScrollArea } from '../../../ui/scroll-area';
import { defineMessages, useIntl } from '../../../../i18n';
import type { Message } from '../../../../types/message';
import type { RecentModel } from '../../../../utils/settings';
import { addToRecentModels } from '../../../../utils/recentModels';
import { trackModelChanged } from '../../../../utils/analytics';

const i18n = defineMessages({
  selectModel: {
    id: 'modelsBottomBar.selectModel',
    defaultMessage: 'Select Model',
  },
  currentModel: {
    id: 'modelsBottomBar.currentModel',
    defaultMessage: 'Current model',
  },
  loadingModel: {
    id: 'modelsBottomBar.loadingModel',
    defaultMessage: 'Loading model...',
  },
  searchPlaceholder: {
    id: 'modelsBottomBar.searchPlaceholder',
    defaultMessage: 'Search models...',
  },
  noVisibleModels: {
    id: 'modelsBottomBar.noVisibleModels',
    defaultMessage: 'No models selected. Configure visible models in Settings.',
  },
  allModels: {
    id: 'modelsBottomBar.allModels',
    defaultMessage: 'All Models',
  },
  noModelsFound: {
    id: 'modelsBottomBar.noModelsFound',
    defaultMessage: 'No models found matching "{query}"',
  },
  configureVisibleModels: {
    id: 'modelsBottomBar.configureVisibleModels',
    defaultMessage: 'Configure visible models...',
  },
  moreOptions: {
    id: 'modelsBottomBar.moreOptions',
    defaultMessage: 'More...',
  },
  changeModel: {
    id: 'modelsBottomBar.changeModel',
    defaultMessage: 'Change Model',
  },
  localModelSettings: {
    id: 'modelsBottomBar.localModelSettings',
    defaultMessage: 'Local Model Settings',
  },
  localModelSettingsTitle: {
    id: 'modelsBottomBar.localModelSettingsTitle',
    defaultMessage: 'Local Model Settings — {modelName}',
  },
  resolvedModel: {
    id: 'modelsBottomBar.resolvedModel',
    defaultMessage: 'Resolved model',
  },
  recentModels: {
    id: 'modelsBottomBar.recentModels',
    defaultMessage: 'Recent',
  },
});

interface ModelsBottomBarProps {
  sessionId: string | null;
  dropdownRef: React.RefObject<HTMLDivElement>;
  setView: (view: View, viewOptions?: ViewOptions) => void;
  sessionModel?: string | null;
  sessionProvider?: string | null;
  latestInference?: Message['metadata']['inference'] | null;
  onModelChanged: (override: { model: string; provider: string }) => void;
  sessionLoaded?: boolean;
}

export default function ModelsBottomBar({
  sessionId,
  dropdownRef,
  setView,
  sessionModel,
  sessionProvider,
  latestInference,
  onModelChanged,
  sessionLoaded,
}: ModelsBottomBarProps) {
  const {
    currentModel: configModel,
    currentProvider: configProvider,
    changeModel,
  } = useModelAndProvider();
  const currentModel = sessionModel ?? configModel;
  const currentProvider = sessionProvider ?? configProvider;

  const intl = useIntl();
  const [displayProvider, setDisplayProvider] = useState<string | null>(null);
  const [displayModelName, setDisplayModelName] = useState<string>(
    intl.formatMessage(i18n.selectModel)
  );
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAddModelModalOpen, setIsAddModelModalOpen] = useState(false);
  const [isLocalModelSettingsOpen, setIsLocalModelSettingsOpen] = useState(false);
  const [providerDefaultModel, setProviderDefaultModel] = useState<string | null>(null);
  const [recentModels, setRecentModels] = useState<RecentModel[]>([]);

  // Quick picker data
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  const [providerModelsMap, setProviderModelsMap] = useState<Record<string, Model[]>>({});
  const [visibleModelsMap, setVisibleModelsMap] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const loadRecentModels = useCallback(async () => {
    const stored = (await window.electron.getSetting('recentModels')) ?? [];
    setRecentModels(stored);
  }, []);

  const loadModelsAndSettings = useCallback(async () => {
    try {
      const [allProviders, savedVisible, savedCustom] = await Promise.all([
        acpListProviderDetails().catch(() => [] as ProviderDetails[]),
        loadVisibleModelsSetting(),
        loadCustomModelsSetting(),
      ]);

      const configured = allProviders.filter((p) => p.is_configured);
      const accessibleChecks = await Promise.all(
        configured.map(async (p) => {
          const accessible = await isProviderAccessible(p);
          return { provider: p, accessible };
        })
      );
      const active = accessibleChecks.filter((item) => item.accessible).map((item) => item.provider);
      setProviders(active);
      setVisibleModelsMap(savedVisible);

      // Fast initial map from known_models and customModels
      const initialMap: Record<string, Model[]> = {};
      active.forEach((p) => {
        const known = (p.metadata.known_models || []).map(
          (m) =>
            ({
              name: m.name,
              provider: p.name,
              context_limit: m.context_limit ?? undefined,
              reasoning: m.reasoning ?? undefined,
            }) as Model
        );
        const custom = (savedCustom[p.name] || []).map(
          (name) =>
            ({
              name,
              provider: p.name,
            }) as Model
        );

        const list = [...known];
        custom.forEach((c) => {
          if (!list.some((item) => item.name === c.name)) {
            list.push(c);
          }
        });

        if (p.metadata.default_model && !list.some((m) => m.name === p.metadata.default_model)) {
          list.unshift({ name: p.metadata.default_model, provider: p.name });
        }

        initialMap[p.name] = list;
      });
      setProviderModelsMap(initialMap);

      // Fetch dynamic models in background
      fetchModelsForProviders(active)
        .then((results) => {
          setProviderModelsMap((prev) => {
            const updated = { ...prev };
            results.forEach(({ provider: p, models }) => {
              if (models && models.length > 0) {
                const existing = updated[p.name] || [];
                const merged = [...models];
                existing.forEach((item) => {
                  if (!merged.some((m) => m.name === item.name)) {
                    merged.push(item);
                  }
                });
                updated[p.name] = merged;
              }
            });
            return updated;
          });
        })
        .catch(() => {
          // Keep known models
        });
    } catch (e) {
      console.error('Failed to load models for quick picker:', e);
    }
  }, []);

  useEffect(() => {
    void loadRecentModels();
    void loadModelsAndSettings();

    const handleSync = () => {
      void loadModelsAndSettings();
    };
    window.addEventListener('goose-visible-models-changed', handleSync);
    return () => {
      window.removeEventListener('goose-visible-models-changed', handleSync);
    };
  }, [loadRecentModels, loadModelsAndSettings]);

  const isModelLoading = Boolean(sessionId && !sessionLoaded);
  const displayModel = currentModel || providerDefaultModel || displayModelName;
  const resolvedModel = latestInference?.resolvedModel ?? null;
  const shouldShowResolvedModel = Boolean(
    !isModelLoading &&
    resolvedModel &&
    latestInference?.provider === currentProvider &&
    latestInference?.requestedModel === currentModel &&
    resolvedModel !== currentModel
  );
  const loadingModelLabel = intl.formatMessage(i18n.loadingModel);
  const triggerLabel = isModelLoading ? loadingModelLabel : displayModel;
  const menuModelLabel = isModelLoading ? loadingModelLabel : displayModelName;

  useEffect(() => {
    if (!currentProvider) return;
    getProviderMetadata(currentProvider)
      .then((metadata) => {
        setDisplayProvider(metadata.display_name || currentProvider);
      })
      .catch(() => {
        setDisplayProvider(currentProvider);
      });
  }, [currentProvider, currentModel]);

  useEffect(() => {
    if (currentProvider && !currentModel) {
      (async () => {
        try {
          const metadata = await getProviderMetadata(currentProvider);
          setProviderDefaultModel(metadata.default_model);
        } catch (error) {
          console.error('Failed to get provider default model:', error);
          setProviderDefaultModel(null);
        }
      })();
    } else if (currentModel) {
      setProviderDefaultModel(null);
    }
  }, [currentProvider, currentModel]);

  useEffect(() => {
    if (!currentModel) return;
    setDisplayModelName(getModelDisplayName(currentModel, currentProvider ?? undefined));
  }, [currentModel, currentProvider]);

  const resolvedDisplayModelName = useMemo(
    () => (resolvedModel ? getModelDisplayName(resolvedModel) : null),
    [resolvedModel]
  );

  const handleSelectModel = async (
    modelName: string,
    providerName: string,
    reasoning?: boolean
  ) => {
    const previousModel = currentModel;
    const previousProvider = currentProvider;

    const [modelReasoning, savedEffort] = await Promise.all([
      reasoning !== undefined
        ? reasoning
        : fetchModelReasoning(providerName, modelName).catch(() => null),
      acpReadThinkingEffort().catch(() => null),
    ]);

    const modelArg = modelReasoning
      ? {
          name: modelName,
          provider: providerName,
          request_params: { thinking_effort: savedEffort ?? 'off' },
        }
      : { name: modelName, provider: providerName };

    const success = await changeModel(sessionId, modelArg);
    if (success) {
      trackModelChanged(providerName, modelName);
      if (previousModel && previousProvider) {
        const updated = addToRecentModels(recentModels, previousProvider, previousModel);
        await window.electron.setSetting('recentModels', updated);
        setRecentModels(updated);
      }
      onModelChanged({ model: modelName, provider: providerName });
      setIsPickerOpen(false);
      setSearchQuery('');
    }
  };

  // Compute visible models across all active providers (only those checked by user)
  const visibleModelsList = useMemo(() => {
    if (shouldShowPredefinedModels()) {
      return getPredefinedModelsFromEnv();
    }

    const list: Model[] = [];
    providers.forEach((p) => {
      const allForProvider = providerModelsMap[p.name] || [];
      const visibleNames =
        visibleModelsMap[p.name] !== undefined
          ? visibleModelsMap[p.name]
          : computeDefaultVisibleModels(p, allForProvider);

      visibleNames.forEach((name) => {
        const found = allForProvider.find((m) => m.name === name);
        if (found) {
          list.push(found);
        } else {
          list.push({ name, provider: p.name });
        }
      });
    });

    return list;
  }, [providers, providerModelsMap, visibleModelsMap]);

  // Filtered models for search query within visible models
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return visibleModelsList.filter((m) => {
      const nameMatch = m.name.toLowerCase().includes(q);
      const aliasMatch = m.alias ? m.alias.toLowerCase().includes(q) : false;
      const providerMatch = m.provider.toLowerCase().includes(q);
      return nameMatch || aliasMatch || providerMatch;
    });
  }, [searchQuery, visibleModelsList]);

  const renderModelRow = (m: Model, showProviderTag = true) => {
    const isSelected = m.name === currentModel && m.provider === currentProvider;
    const isReasoning = modelSupportsReasoning(m.name, m.reasoning);
    const isVision = modelSupportsVision(m.name, m.vision);
    const contextLimit = formatContextWindow(m.context_limit);
    const pricing = getModelPricingTier(m.name, m.provider);
    const displayName = m.alias || getModelDisplayName(m.name, m.provider);

    return (
      <button
        key={`${m.provider}/${m.name}`}
        type="button"
        onClick={() => void handleSelectModel(m.name, m.provider, m.reasoning)}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors group cursor-pointer ${
          isSelected
            ? 'bg-primary/10 text-text-primary font-medium'
            : 'hover:bg-background-tertiary text-text-secondary hover:text-text-primary'
        }`}
        data-testid={`model-item-${m.name}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {isSelected ? (
              <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-border-primary group-hover:bg-text-muted" />
            )}
          </div>
          <span className="truncate text-xs font-mono" title={m.name}>
            {displayName}
          </span>
          {showProviderTag && (
            <span className="text-[10px] text-text-muted/80 flex-shrink-0 font-sans">
              ({m.provider})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isReasoning && (
            <span
              title="Extended reasoning / thinking"
              className="inline-flex items-center text-[10px] text-purple-400 p-0.5"
            >
              <Brain className="w-3 h-3" />
            </span>
          )}
          {isVision && (
            <span
              title="Vision support"
              className="inline-flex items-center text-[10px] text-blue-400 p-0.5"
            >
              <Eye className="w-3 h-3" />
            </span>
          )}
          {contextLimit && (
            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-background-tertiary text-text-secondary border border-border-subtle">
              {contextLimit}
            </span>
          )}
          {pricing && <span className="text-[10px] font-mono text-text-muted">{pricing}</span>}
        </div>
      </button>
    );
  };

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center hover:cursor-pointer max-w-[180px] md:max-w-[200px] lg:max-w-[380px] min-w-0 text-text-primary/70 hover:text-text-primary transition-colors focus:outline-hidden"
            data-testid="model-selector-button"
            aria-label="Select Model"
          >
            <div className="flex items-center truncate max-w-[130px] md:max-w-[200px] lg:max-w-[360px] min-w-0">
              <Bot className="mr-1 h-4 w-4 flex-shrink-0" />
              {isModelLoading ? (
                <span
                  data-testid="model-loading-state"
                  className="inline-flex items-center gap-1 truncate text-xs"
                >
                  <LoaderCircle className="h-3 w-3 animate-spin flex-shrink-0" />
                  <span className="truncate">{triggerLabel}</span>
                </span>
              ) : (
                <span className="truncate text-xs">{triggerLabel}</span>
              )}
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[340px] sm:w-[380px] p-0 shadow-2xl border border-border-primary bg-background-primary rounded-xl overflow-hidden flex flex-col max-h-[480px]"
          data-testid="quick-model-picker-content"
        >
          {/* Search bar */}
          <div className="p-2 border-b border-border-subtle flex items-center gap-2 bg-background-secondary/30">
            <Search className="w-4 h-4 text-text-muted flex-shrink-0 ml-1" />
            <input
              type="text"
              placeholder={intl.formatMessage(i18n.searchPlaceholder)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs w-full outline-hidden text-text-primary placeholder:text-text-muted"
              autoFocus
              data-testid="model-picker-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-text-muted hover:text-text-primary p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Current Model info header */}
          <div className="px-3 py-1.5 bg-background-secondary/20 border-b border-border-subtle/40 flex items-center justify-between text-[11px] text-text-muted">
            <span className="truncate">
              {menuModelLabel}
              {!isModelLoading && displayProvider && ` — ${displayProvider}`}
            </span>
            {shouldShowResolvedModel && resolvedDisplayModelName && (
              <span className="text-[10px] text-primary truncate ml-2">
                ({resolvedDisplayModelName})
              </span>
            )}
          </div>

          {/* Model items scroll area */}
          <ScrollArea className="flex-1 overflow-y-auto max-h-[320px] p-1.5 space-y-1">
            {searchQuery.trim() ? (
              // Search results mode
              searchResults.length > 0 ? (
                <div className="space-y-0.5" data-testid="visible-models-section">
                  <div className="px-2 py-1 text-[11px] font-medium text-text-muted uppercase tracking-wider">
                    Matches ({searchResults.length})
                  </div>
                  {searchResults.map((m) => renderModelRow(m, providers.length > 1))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-text-muted">
                  {intl.formatMessage(i18n.noModelsFound, { query: searchQuery })}
                </div>
              )
            ) : (
              // Visible/checked models list only
              visibleModelsList.length > 0 ? (
                <div className="space-y-0.5" data-testid="visible-models-section">
                  {visibleModelsList.map((m) => renderModelRow(m, providers.length > 1))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-text-muted space-y-2">
                  <p>{intl.formatMessage(i18n.noVisibleModels)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPickerOpen(false);
                      setView('settings', { section: 'models' });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors cursor-pointer"
                  >
                    {intl.formatMessage(i18n.configureVisibleModels)}
                  </button>
                </div>
              )
            )}
          </ScrollArea>

          {/* Popover footer actions */}
          <div className="p-2 border-t border-border-subtle bg-background-secondary/30 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setIsPickerOpen(false);
                setView('settings', { section: 'models' });
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-background-tertiary rounded-md transition-colors cursor-pointer text-xs"
              data-testid="btn-configure-visible-models"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{intl.formatMessage(i18n.configureVisibleModels)}</span>
            </button>

            <div className="flex items-center gap-1">
              {currentProvider === 'local' && currentModel && (
                <button
                  type="button"
                  onClick={() => {
                    setIsPickerOpen(false);
                    setIsLocalModelSettingsOpen(true);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-background-tertiary rounded-md transition-colors cursor-pointer text-xs"
                  title={intl.formatMessage(i18n.localModelSettings)}
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsPickerOpen(false);
                  setIsAddModelModalOpen(true);
                }}
                className="text-text-muted hover:text-text-primary px-1.5 py-1 text-[11px] rounded-md transition-colors cursor-pointer"
                title="Open detailed model switcher modal"
                data-testid="btn-more-options"
              >
                {intl.formatMessage(i18n.moreOptions)}
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {isAddModelModalOpen ? (
        <SwitchModelModal
          sessionId={sessionId}
          setView={setView}
          onClose={() => setIsAddModelModalOpen(false)}
          sessionModel={currentModel}
          sessionProvider={currentProvider}
          onModelSelected={(model, provider) => onModelChanged({ model, provider })}
        />
      ) : null}

      {isLocalModelSettingsOpen && currentModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background-primary border border-border-primary rounded-lg shadow-lg w-[480px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <h3 className="text-sm font-medium text-text-default">
                {intl.formatMessage(i18n.localModelSettingsTitle, {
                  modelName: getModelDisplayName(currentModel, currentProvider ?? undefined),
                })}
              </h3>
              <button
                onClick={() => setIsLocalModelSettingsOpen(false)}
                className="text-text-muted hover:text-text-default text-lg leading-none cursor-pointer"
              >
                ×
              </button>
            </div>
            <ScrollArea className="flex-1 px-4 py-3 overflow-y-auto max-h-[calc(80vh-52px)]">
              <ModelSettingsPanel modelId={currentModel} />
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
