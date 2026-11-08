import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { MessageSquare, X } from 'lucide-react';
import { AppEvents } from '../../constants/events';
import { useAcpChatSessionSnapshot } from '../../acp/chatSessionStore';
import { getSessionDisplayName } from '../../sessions';
import { TabStrip } from './TabStrip';
import { cn } from '../../utils';

function pairSessionPath(sessionId: string): string {
  const searchParams = new URLSearchParams({ resumeSessionId: sessionId });
  return `/pair?${searchParams.toString()}`;
}

function ChatTabTitle({ sessionId }: { sessionId: string }) {
  const snapshot = useAcpChatSessionSnapshot(sessionId);
  const name = snapshot?.session ? getSessionDisplayName(snapshot.session).trim() : '';
  return <>{name || 'Чат'}</>;
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

  if (openSessionIds.length === 0) {
    return null;
  }

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
      revealKey={currentSessionId ?? ''}
      tabsKey={openSessionIds.join('\0')}
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
    </TabStrip>
  );
};
