import { useState, useEffect, useCallback, useMemo } from 'react';
import { Brain, Check } from 'lucide-react';
import { defineMessages, useIntl } from 'react-intl';
import type { ThinkingEffort } from '../types/providers';
import {
  acpReadThinkingEffort,
  acpSaveThinkingEffort,
  acpSetSessionProviderModel,
} from '../acp/providers';
import { acpChatSessionStore, acpChatSessionActions } from '../acp/chatSessionStore';
import { fetchModelReasoning } from './settings/models/modelInterface';
import { getPredefinedModelsFromEnv } from './settings/models/predefinedModelsUtils';
import { cn } from '../utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/Tooltip';

const messages = defineMessages({
  title: {
    id: 'thinkingEffortButton.title',
    defaultMessage: 'Thinking Effort',
  },
  subtitle: {
    id: 'thinkingEffortButton.subtitle',
    defaultMessage: 'Control reasoning depth before responding',
  },
  labelThinking: {
    id: 'thinkingEffortButton.labelThinking',
    defaultMessage: 'Thinking: {level}',
  },
  offLabel: {
    id: 'thinkingEffortButton.offLabel',
    defaultMessage: 'Off',
  },
  lowLabel: {
    id: 'thinkingEffortButton.lowLabel',
    defaultMessage: 'Low',
  },
  mediumLabel: {
    id: 'thinkingEffortButton.mediumLabel',
    defaultMessage: 'Medium',
  },
  highLabel: {
    id: 'thinkingEffortButton.highLabel',
    defaultMessage: 'High',
  },
  maxLabel: {
    id: 'thinkingEffortButton.maxLabel',
    defaultMessage: 'Max',
  },
  offDesc: {
    id: 'thinkingEffortButton.offDesc',
    defaultMessage: 'No extended thinking, fastest responses',
  },
  lowDesc: {
    id: 'thinkingEffortButton.lowDesc',
    defaultMessage: 'Minimal thinking, light reasoning',
  },
  mediumDesc: {
    id: 'thinkingEffortButton.mediumDesc',
    defaultMessage: 'Moderate thinking for balanced reasoning',
  },
  highDesc: {
    id: 'thinkingEffortButton.highDesc',
    defaultMessage: 'Deep reasoning for complex problems',
  },
  maxDesc: {
    id: 'thinkingEffortButton.maxDesc',
    defaultMessage: 'Maximum depth without reasoning constraints',
  },
  tooltip: {
    id: 'thinkingEffortButton.tooltip',
    defaultMessage: 'Thinking effort: {level} (⌥T to cycle)',
  },
});

interface ThinkingOption {
  value: ThinkingEffort;
  labelKey: keyof typeof messages;
  descKey: keyof typeof messages;
  badge: string;
}

const EFFORT_OPTIONS: ThinkingOption[] = [
  {
    value: 'off',
    labelKey: 'offLabel',
    descKey: 'offDesc',
    badge: 'Off',
  },
  {
    value: 'low',
    labelKey: 'lowLabel',
    descKey: 'lowDesc',
    badge: 'Fast',
  },
  {
    value: 'medium',
    labelKey: 'mediumLabel',
    descKey: 'mediumDesc',
    badge: 'Balanced',
  },
  {
    value: 'high',
    labelKey: 'highLabel',
    descKey: 'highDesc',
    badge: 'Deep',
  },
  {
    value: 'max',
    labelKey: 'maxLabel',
    descKey: 'maxDesc',
    badge: 'Max',
  },
];

const getEffortStyles = (effort: ThinkingEffort) => {
  switch (effort) {
    case 'max':
      return {
        buttonClass:
          'bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/30 font-medium',
        iconClass: 'text-purple-600 dark:text-purple-300',
        badgeClass: 'bg-purple-500/20 text-purple-700 dark:text-purple-300',
      };
    case 'high':
      return {
        buttonClass:
          'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border-indigo-500/30 font-medium',
        iconClass: 'text-indigo-600 dark:text-indigo-300',
        badgeClass: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
      };
    case 'medium':
      return {
        buttonClass:
          'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-500/25',
        iconClass: 'text-blue-600 dark:text-blue-300',
        badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
      };
    case 'low':
      return {
        buttonClass:
          'bg-background-secondary/60 hover:bg-background-secondary text-text-primary border-border-primary/40',
        iconClass: 'text-text-secondary',
        badgeClass: 'bg-background-tertiary text-text-secondary',
      };
    case 'off':
    default:
      return {
        buttonClass:
          'bg-transparent hover:bg-background-secondary/50 text-text-primary/60 hover:text-text-primary border-border-primary/30',
        iconClass: 'text-text-primary/40',
        badgeClass: 'bg-background-tertiary text-text-tertiary',
      };
  }
};

export interface ThinkingEffortButtonProps {
  sessionId?: string | null;
  currentProvider?: string | null;
  currentModel?: string | null;
  isNarrow?: boolean;
  className?: string;
  onEffortChanged?: (effort: ThinkingEffort) => void;
}

export default function ThinkingEffortButton({
  sessionId,
  currentProvider,
  currentModel,
  isNarrow = false,
  className,
  onEffortChanged,
}: ThinkingEffortButtonProps) {
  const intl = useIntl();
  const [supportsReasoning, setSupportsReasoning] = useState<boolean>(false);
  const [currentEffort, setCurrentEffort] = useState<ThinkingEffort>('off');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkReasoningAndEffort() {
      if (!currentProvider || !currentModel) {
        if (isMounted) setSupportsReasoning(false);
        return;
      }

      try {
        let fallback: boolean | undefined = undefined;
        if (sessionId) {
          const session = acpChatSessionStore.getSnapshot(sessionId)?.session;
          if (session?.model_config?.reasoning != null) {
            fallback = Boolean(session.model_config.reasoning);
          } else if (session?.model_config?.request_params?.thinking_effort) {
            fallback = true;
          }
        }

        if (fallback === undefined) {
          const predefined = getPredefinedModelsFromEnv().find((m) => m.name === currentModel);
          if (predefined?.reasoning != null) {
            fallback = predefined.reasoning;
          }
        }

        const reasoning = await fetchModelReasoning(currentProvider, currentModel, fallback);

        if (!isMounted) return;

        if (!reasoning) {
          setSupportsReasoning(false);
          return;
        }

        setSupportsReasoning(true);

        let initialEffort: ThinkingEffort | null = null;
        if (sessionId) {
          const session = acpChatSessionStore.getSnapshot(sessionId)?.session;
          const sessionEffort = session?.model_config?.request_params?.thinking_effort;
          if (typeof sessionEffort === 'string') {
            initialEffort = sessionEffort as ThinkingEffort;
          }
        }

        if (!initialEffort) {
          initialEffort = await acpReadThinkingEffort().catch(() => null);
        }

        if (isMounted) {
          setCurrentEffort(initialEffort ?? 'off');
        }
      } catch (err) {
        console.warn('Error checking model reasoning:', err);
        if (isMounted) setSupportsReasoning(false);
      }
    }

    void checkReasoningAndEffort();

    return () => {
      isMounted = false;
    };
  }, [currentProvider, currentModel, sessionId]);

  const handleSelectEffort = useCallback(
    async (effort: ThinkingEffort) => {
      setCurrentEffort(effort);
      setIsMenuOpen(false);

      try {
        await acpSaveThinkingEffort(effort);
      } catch (err) {
        console.warn('Failed to save thinking effort:', err);
      }

      if (sessionId && currentProvider) {
        try {
          await acpSetSessionProviderModel(sessionId, currentProvider, currentModel, effort);
          const currentSession = acpChatSessionStore.getSnapshot(sessionId)?.session;
          if (currentSession) {
            acpChatSessionActions.setSessionMetadata(sessionId, {
              ...currentSession,
              model_config: {
                ...(currentSession.model_config ?? {
                  model_name: currentModel ?? '',
                  toolshim: false,
                }),
                request_params: {
                  ...(currentSession.model_config?.request_params ?? {}),
                  thinking_effort: effort,
                },
              },
            });
          }
        } catch (err) {
          console.warn('Failed to update session model with thinking effort:', err);
        }
      }

      onEffortChanged?.(effort);
    },
    [sessionId, currentProvider, currentModel, onEffortChanged]
  );

  const cycleEffort = useCallback(async () => {
    const levels: ThinkingEffort[] = ['off', 'low', 'medium', 'high', 'max'];
    const currentIndex = levels.indexOf(currentEffort);
    const nextEffort = levels[(currentIndex + 1) % levels.length];
    await handleSelectEffort(nextEffort);
  }, [currentEffort, handleSelectEffort]);

  useEffect(() => {
    if (!supportsReasoning) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 't' || e.key === 'T' || e.key === '†')) {
        e.preventDefault();
        void cycleEffort();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [supportsReasoning, cycleEffort]);

  const effortStyles = useMemo(() => getEffortStyles(currentEffort), [currentEffort]);

  const activeLevelLabel = useMemo(() => {
    const option = EFFORT_OPTIONS.find((o) => o.value === currentEffort);
    return option ? intl.formatMessage(messages[option.labelKey]) : currentEffort;
  }, [currentEffort, intl]);

  const triggerLabel = useMemo(() => {
    if (isNarrow) {
      return activeLevelLabel;
    }
    return intl.formatMessage(messages.labelThinking, { level: activeLevelLabel });
  }, [isNarrow, activeLevelLabel, intl]);

  if (!supportsReasoning) {
    return null;
  }

  return (
    <Tooltip
      open={isTooltipOpen}
      onOpenChange={(open) => {
        if (!isMenuOpen) setIsTooltipOpen(open);
      }}
    >
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="thinking-effort-button"
              data-effort={currentEffort}
              aria-label={intl.formatMessage(messages.tooltip, { level: activeLevelLabel })}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs transition-colors hover:cursor-pointer select-none border shrink-0',
                effortStyles.buttonClass,
                className
              )}
            >
              <Brain className={cn('h-3.5 w-3.5 flex-shrink-0', effortStyles.iconClass)} />
              <span className="truncate">{triggerLabel}</span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <DropdownMenuContent
          className="w-64 p-1 space-y-0.5 text-xs z-50"
          side="top"
          align="start"
          data-testid="thinking-effort-dropdown"
        >
          <div className="px-2.5 py-1.5 border-b border-border-primary/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-primary">
                {intl.formatMessage(messages.title)}
              </span>
              <span className="text-[10px] text-text-secondary/70 font-mono">⌥T</span>
            </div>
            <p className="text-[11px] text-text-secondary leading-tight mt-0.5">
              {intl.formatMessage(messages.subtitle)}
            </p>
          </div>

          <div className="pt-1">
            {EFFORT_OPTIONS.map((option) => {
              const isSelected = currentEffort === option.value;
              const optStyles = getEffortStyles(option.value);
              const label = intl.formatMessage(messages[option.labelKey]);
              const description = intl.formatMessage(messages[option.descKey]);

              return (
                <DropdownMenuItem
                  key={option.value}
                  data-testid={`thinking-effort-option-${option.value}`}
                  onSelect={() => void handleSelectEffort(option.value)}
                  className={cn(
                    'flex items-start gap-2 px-2 py-1.5 cursor-pointer rounded-md transition-colors',
                    isSelected
                      ? 'bg-background-secondary font-medium'
                      : 'hover:bg-background-secondary/60'
                  )}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-text-primary" />
                    ) : (
                      <div className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs text-text-primary">{label}</span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.2 rounded font-mono font-normal',
                          optStyles.badgeClass
                        )}
                      >
                        {option.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-secondary leading-snug line-clamp-2 mt-0.5">
                      {description}
                    </p>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipContent side="top">
        {intl.formatMessage(messages.tooltip, { level: activeLevelLabel })}
      </TooltipContent>
    </Tooltip>
  );
}
