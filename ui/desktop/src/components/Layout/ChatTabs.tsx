import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { Loader2, MessageSquare, Plus, ShieldAlert, X } from 'lucide-react';
import { AppEvents } from '../../constants/events';
import {
  acpChatSessionActions,
  acpChatSessionStore,
  setActiveSessionId,
  useAcpChatSessionSnapshot,
} from '../../acp/chatSessionStore';
import { ChatState } from '../../types/chatState';
import { getSessionDisplayName } from '../../sessions';
import { TabStrip } from './TabStrip';
import { cn } from '../../utils';

function pairSessionPath(sessionId: string): string {
  const searchParams = new URLSearchParams({ resumeSessionId: sessionId });
  return `/pair?${searchParams.toString()}`;
}

export function ChatTabStatusIndicator({
  sessionId,
  isActive,
}: {
  sessionId: string;
  isActive?: boolean;
}) {
  const snapshot = useAcpChatSessionSnapshot(sessionId);
  if (!snapshot) return null;

  if (snapshot.hasError || snapshot.sessionLoadError) {
    return (
      <span
        data-testid="status-error"
        title="Ошибка выполнения"
        aria-label="Ошибка"
        className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 pointer-events-none"
      />
    );
  }

  if (snapshot.isWaitingForInput || snapshot.hasPendingUserInput) {
    return (
      <ShieldAlert
        data-testid="status-waiting-input"
        aria-label="Ожидание ввода"
        className="w-3.5 h-3.5 flex-shrink-0 text-amber-500 animate-pulse pointer-events-none"
      />
    );
  }

  if (
    snapshot.isProcessing ||
    snapshot.chatState === ChatState.Thinking ||
    snapshot.chatState === ChatState.Streaming
  ) {
    return (
      <Loader2
        data-testid="status-processing"
        aria-label="Выполняется"
        className="w-3.5 h-3.5 flex-shrink-0 text-accent-primary animate-spin pointer-events-none"
      />
    );
  }

  if (snapshot.unreadCompleted && !isActive) {
    return (
      <span
        data-testid="status-unread-completed"
        aria-label="Завершено"
        className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 pointer-events-none"
      />
    );
  }

  return null;
}

function ChatTabTitle({ sessionId }: { sessionId: string }) {
  const snapshot = useAcpChatSessionSnapshot(sessionId);
  const name = snapshot?.session ? getSessionDisplayName(snapshot.session).trim() : '';
  return <>{name || 'Чат'}</>;
}

function getIsMac(): boolean {
  if (typeof window !== 'undefined' && window.electron?.platform) {
    return window.electron.platform === 'darwin';
  }
  if (typeof navigator !== 'undefined') {
    return /mac/i.test(navigator.platform);
  }
  return true;
}

interface ChatTabsProps {
  sessionIds: string[];
}

function incomingSessionIds(sessionIds: string[], currentSessionId: string | null): string[] {
  const incomingIds = [...sessionIds];
  if (currentSessionId && !incomingIds.includes(currentSessionId)) {
    incomingIds.push(currentSessionId);
  }
  return incomingIds;
}

function reconcileSessionOrder(previous: string[], incoming: string[]): string[] {
  const keptIds = previous.filter((sessionId) => incoming.includes(sessionId));
  const addedIds = incoming.filter((sessionId) => !keptIds.includes(sessionId));
  return [...keptIds, ...addedIds];
}

export const ChatTabs: React.FC<ChatTabsProps> = ({ sessionIds }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);
  const currentSessionId =
    location.pathname === '/pair' ? searchParams.get('resumeSessionId') : null;
  const incomingIds = incomingSessionIds(sessionIds, currentSessionId);
  const incomingKey = incomingIds.join('\0');
  const [storedOrder, setStoredOrder] = useState(incomingIds);
  const [seenKey, setSeenKey] = useState(incomingKey);
  let openSessionIds = storedOrder;
  if (incomingKey !== seenKey) {
    openSessionIds = reconcileSessionOrder(storedOrder, incomingIds);
    setSeenKey(incomingKey);
    setStoredOrder(openSessionIds);
  }

  useEffect(() => {
    if (!pendingCloseId || currentSessionId === pendingCloseId) return;
    window.dispatchEvent(
      new CustomEvent(AppEvents.CHAT_TAB_CLOSED, { detail: { sessionId: pendingCloseId } })
    );
    setPendingCloseId(null);
  }, [currentSessionId, pendingCloseId]);

  useEffect(() => {
    if (currentSessionId) {
      acpChatSessionActions.markSessionRead(currentSessionId);
      setActiveSessionId(currentSessionId);
    } else {
      setActiveSessionId(null);
    }
  }, [currentSessionId]);

  const isOnHubRoute = location.pathname === '/';
  if (openSessionIds.length === 0 && !isOnHubRoute) {
    return null;
  }

  const focusInputField = () => {
    const inputField = document.querySelector('input[type="text"], textarea') as HTMLElement | null;
    inputField?.focus();
  };

  const currentSessionWorkingDir = currentSessionId
    ? acpChatSessionStore.getSnapshot(currentSessionId)?.session?.working_dir
    : undefined;

  const handleOpenNewChat = () => {
    if (isOnHubRoute) {
      focusInputField();
      return;
    }
    navigate('/', { state: { workingDir: currentSessionWorkingDir } });
  };

  const isMac = getIsMac();

  const closeTab = (sessionId: string) => {
    if (currentSessionId === sessionId) {
      const remaining = openSessionIds.filter((id) => id !== sessionId);
      const currentIndex = openSessionIds.indexOf(sessionId);
      const nextId = remaining[Math.min(currentIndex, remaining.length - 1)];
      navigate(nextId ? pairSessionPath(nextId) : '/');
      setPendingCloseId(sessionId);
      return;
    }
    window.dispatchEvent(new CustomEvent(AppEvents.CHAT_TAB_CLOSED, { detail: { sessionId } }));
  };

  return (
    <TabStrip
      testId="chat-tabs-scroller"
      previousLabel="Предыдущие чаты"
      nextLabel="Следующие чаты"
      revealKey={currentSessionId ?? (isOnHubRoute ? 'new-chat' : '')}
      tabsKey={`${openSessionIds.join('\0')}\0${isOnHubRoute ? 'hub' : ''}`}
      tabsClassName="gap-1"
    >
      {openSessionIds.map((sessionId) => {
        const isActive = sessionId === currentSessionId;
        return (
          <div
            key={sessionId}
            data-tab
            data-active={isActive ? 'true' : 'false'}
            onClick={() => navigate(pairSessionPath(sessionId))}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              event.stopPropagation();
              closeTab(sessionId);
            }}
            className={cn(
              'no-drag group relative flex shrink-0 items-center gap-2 h-7 px-3 text-xs rounded-md cursor-pointer transition-colors max-w-[200px]',
              isActive
                ? 'bg-background-tertiary text-text-primary font-medium shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/50'
            )}
          >
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 pointer-events-none" />
            <span className="truncate flex-1 pointer-events-none">
              <ChatTabTitle sessionId={sessionId} />
            </span>
            <ChatTabStatusIndicator sessionId={sessionId} isActive={isActive} />
            <button
              type="button"
              title="Закрыть вкладку"
              aria-label="Закрыть чат"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                closeTab(sessionId);
              }}
              className={cn(
                'no-drag flex items-center justify-center w-5 h-5 rounded hover:bg-background-primary/80 text-text-muted hover:text-text-primary transition-all cursor-pointer z-10',
                isActive
                  ? 'flex opacity-75 hover:opacity-100'
                  : 'hidden group-hover:flex opacity-60 hover:opacity-100'
              )}
            >
              <X className="w-3.5 h-3.5 pointer-events-none" />
            </button>
          </div>
        );
      })}
      {isOnHubRoute && (
        <div
          data-tab
          data-active="true"
          onClick={focusInputField}
          onAuxClick={(event) => {
            if (event.button !== 1 || openSessionIds.length === 0) return;
            event.preventDefault();
            event.stopPropagation();
            const lastSessionId = openSessionIds[openSessionIds.length - 1];
            navigate(pairSessionPath(lastSessionId));
          }}
          className="no-drag group relative flex shrink-0 items-center gap-2 h-7 px-3 text-xs rounded-md cursor-pointer transition-colors max-w-[200px] bg-background-tertiary text-text-primary font-medium shadow-xs"
        >
          <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 pointer-events-none" />
          <span className="truncate flex-1 pointer-events-none">Новый чат</span>
          {openSessionIds.length > 0 && (
            <button
              type="button"
              title="Закрыть вкладку"
              aria-label="Закрыть новый чат"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                const lastSessionId = openSessionIds[openSessionIds.length - 1];
                navigate(pairSessionPath(lastSessionId));
              }}
              className="no-drag flex items-center justify-center w-5 h-5 rounded hover:bg-background-primary/80 text-text-muted hover:text-text-primary transition-all cursor-pointer z-10 opacity-75 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5 pointer-events-none" />
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={handleOpenNewChat}
        className="no-drag h-6 w-6 flex shrink-0 items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60 transition-colors cursor-pointer"
        title={isMac ? 'Новый чат (⌘T)' : 'Новый чат (Ctrl+T)'}
        aria-label="Новый чат"
      >
        <Plus className="w-3.5 h-3.5 pointer-events-none" />
      </button>
    </TabStrip>
  );
};
