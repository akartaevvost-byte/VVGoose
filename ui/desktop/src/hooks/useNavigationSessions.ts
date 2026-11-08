import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router';
import { useChatContext } from '../contexts/ChatContext';
import { getSessionDisplayName } from '../sessions';
import { AppEvents } from '../constants/events';
import type { Session } from '../types/session';
import { acpChatSessionActions } from '../acp/chatSessionStore';
import { cancelAcpElicitationRequestsForSession } from '../acp/elicitationRequests';
import { cancelAcpPermissionRequestsForSession } from '../acp/permissionRequests';
import {
  acpArchiveSession,
  acpDeleteSession,
  acpGetSessionListItem,
  acpListArchivedSessions,
  acpListRecentSessions,
  acpUnarchiveSession,
  type SessionListItem,
} from '../acp/sessions';
import { groupSessionsByProject } from '../utils/projectSessions';
import type { SessionListChange } from '../types/sessionListSync';

const MAX_RECENT_SESSIONS = 25;

function pairSessionPath(sessionId: string): string {
  const searchParams = new URLSearchParams({ resumeSessionId: sessionId });
  return `/pair?${searchParams.toString()}`;
}

export function prependUnique(
  prev: SessionListItem[],
  session: SessionListItem
): SessionListItem[] {
  if (prev.some((s) => s.id === session.id)) return prev;
  return [session, ...prev].slice(0, MAX_RECENT_SESSIONS);
}

function moveToFront(prev: SessionListItem[], session: SessionListItem): SessionListItem[] {
  const rest = prev.filter((item) => item.id !== session.id);
  return [session, ...rest].slice(0, MAX_RECENT_SESSIONS);
}

const RESTORED_SESSIONS_STORAGE_KEY = 'goose-restored-sessions';

function isStoredSessionListItem(value: unknown): value is SessionListItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as SessionListItem;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.workingDir === 'string'
  );
}

function readRestoredSessions(): Map<string, SessionListItem> {
  try {
    const raw = localStorage.getItem(RESTORED_SESSIONS_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed
        .filter(isStoredSessionListItem)
        .map((session) => [session.id, { ...session, archivedAt: undefined }])
    );
  } catch {
    return new Map();
  }
}

function writeRestoredSessions(sessions: Map<string, SessionListItem>) {
  try {
    if (sessions.size === 0) {
      localStorage.removeItem(RESTORED_SESSIONS_STORAGE_KEY);
      return;
    }
    localStorage.setItem(RESTORED_SESSIONS_STORAGE_KEY, JSON.stringify([...sessions.values()]));
  } catch {
    // Storage can be blocked; the map still keeps the chat until this page closes.
  }
}

function rememberRestoredSession(
  restored: Map<string, SessionListItem>,
  session: SessionListItem
): SessionListItem {
  const item = { ...session, archivedAt: undefined };
  restored.set(item.id, item);
  writeRestoredSessions(restored);
  return item;
}

function forgetRestoredSession(restored: Map<string, SessionListItem>, sessionId: string) {
  if (!restored.delete(sessionId)) return;
  writeRestoredSessions(restored);
}

function retainRestoredSessions(
  listed: SessionListItem[],
  restored: Map<string, SessionListItem>
): SessionListItem[] {
  const listedIds = new Set(listed.map((session) => session.id));
  let removed = false;
  for (const sessionId of [...restored.keys()]) {
    if (!listedIds.has(sessionId)) continue;
    restored.delete(sessionId);
    removed = true;
  }
  if (removed) writeRestoredSessions(restored);
  return [...restored.values(), ...listed].slice(0, MAX_RECENT_SESSIONS);
}

function publishSessionListChange(change: SessionListChange) {
  window.electron?.broadcastSessionListChange?.(change);
}

function mergeWithEmptyLocals(
  prev: SessionListItem[],
  listed: SessionListItem[]
): SessionListItem[] {
  const emptyLocals = prev.filter(
    (local) => local.messageCount === 0 && !listed.some((s) => s.id === local.id)
  );
  return [...emptyLocals, ...listed].slice(0, MAX_RECENT_SESSIONS);
}

export function sessionToListItem(s: Session): SessionListItem {
  return {
    id: s.id,
    name: getSessionDisplayName(s),
    workingDir: s.working_dir,
    updatedAt: s.updated_at,
    messageCount: s.message_count,
    lastMessageAt: s.last_message_at ?? undefined,
    createdAt: s.created_at,
    archivedAt: s.archived_at ?? undefined,
    projectId: s.project_id ?? undefined,
    providerId: s.provider_name ?? undefined,
    modelId: s.model_config?.model_name ?? undefined,
    userSetName: s.user_set_name ?? undefined,
    hasRecipe: !!s.recipe,
  };
}

export function useNavigationSessions() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const chatContext = useChatContext();

  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<SessionListItem[]>([]);
  const [pendingReleaseId, setPendingReleaseId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const latestFetchIdRef = useRef(0);
  const restoredSessionsRef = useRef(readRestoredSessions());
  const discardInFlightSessionFetch = useCallback(() => {
    latestFetchIdRef.current += 1;
    setIsLoadingSessions(false);
  }, []);
  const recentSessionsByProject = useMemo(
    () => groupSessionsByProject(recentSessions),
    [recentSessions]
  );
  const lastSessionIdRef = useRef<string | null>(null);

  const activeSessionId = searchParams.get('resumeSessionId') ?? undefined;
  const currentSessionId =
    location.pathname === '/pair' ? searchParams.get('resumeSessionId') : null;

  useEffect(() => {
    if (currentSessionId) {
      lastSessionIdRef.current = currentSessionId;
    }
  }, [currentSessionId]);

  const fetchSessions = useCallback(async () => {
    const fetchId = ++latestFetchIdRef.current;
    setIsLoadingSessions(true);
    try {
      // The archive list must not be able to take the recent-chats list down
      // with it: a long paginated archive fetch is the likelier one to fail.
      const [recent, archived] = await Promise.allSettled([
        acpListRecentSessions(MAX_RECENT_SESSIONS),
        acpListArchivedSessions(),
      ]);
      if (fetchId !== latestFetchIdRef.current) {
        return;
      }
      if (recent.status === 'fulfilled') {
        setRecentSessions(retainRestoredSessions(recent.value, restoredSessionsRef.current));
      } else {
        console.error('Failed to fetch sessions:', recent.reason);
      }
      if (archived.status === 'fulfilled') {
        const archivedIds = new Set(archived.value.map((session) => session.id));
        for (const sessionId of archivedIds) {
          forgetRestoredSession(restoredSessionsRef.current, sessionId);
        }
        setArchivedSessions(archived.value);
        setRecentSessions((prev) => prev.filter((session) => !archivedIds.has(session.id)));
      } else {
        console.error('Failed to fetch archived sessions:', archived.reason);
      }
    } finally {
      if (fetchId === latestFetchIdRef.current) {
        setIsLoadingSessions(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    if (recentSessions.some((s) => s.id === activeSessionId)) return;

    let cancelled = false;
    acpGetSessionListItem(activeSessionId)
      .then(async (item) => {
        if (cancelled) return;
        if (!item.archivedAt) {
          setRecentSessions((prev) => prependUnique(prev, item));
          return;
        }
        await acpUnarchiveSession(item.id);
        if (cancelled) return;
        const restored = { ...item, archivedAt: undefined };
        rememberRestoredSession(restoredSessionsRef.current, item);
        discardInFlightSessionFetch();
        setArchivedSessions((prev) => prev.filter((session) => session.id !== item.id));
        setRecentSessions((prev) => moveToFront(prev, restored));
        publishSessionListChange({
          kind: 'unarchived',
          sessionId: item.id,
          session: restored,
        });
      })
      .catch((error) => {
        console.error('Failed to fetch active session:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, discardInFlightSessionFetch, recentSessions]);

  useEffect(() => {
    let pollingTimeouts: ReturnType<typeof setTimeout>[] = [];
    let isPolling = false;

    const handleSessionCreated = (event: Event) => {
      const { session } = (event as CustomEvent<{ session?: Session }>).detail || {};
      if (session) {
        setRecentSessions((prev) => prependUnique(prev, sessionToListItem(session)));
      }

      if (isPolling) return;
      isPolling = true;

      const pollIntervalMs = 300;
      const maxPollDurationMs = 10000;
      const maxPolls = maxPollDurationMs / pollIntervalMs;
      let pollCount = 0;

      const pollForUpdates = async () => {
        pollCount++;
        try {
          const listed = await acpListRecentSessions(MAX_RECENT_SESSIONS);
          setRecentSessions((prev) =>
            retainRestoredSessions(mergeWithEmptyLocals(prev, listed), restoredSessionsRef.current)
          );
        } catch (error) {
          console.error('Failed to poll sessions:', error);
        }

        if (pollCount < maxPolls) {
          const timeout = setTimeout(pollForUpdates, pollIntervalMs);
          pollingTimeouts.push(timeout);
        } else {
          isPolling = false;
        }
      };

      pollForUpdates();
    };

    window.addEventListener(AppEvents.SESSION_CREATED, handleSessionCreated);
    return () => {
      window.removeEventListener(AppEvents.SESSION_CREATED, handleSessionCreated);
      pollingTimeouts.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    let fetchVersion = 0;

    const handleSessionDeleted = (event: Event) => {
      const { sessionId } = (event as CustomEvent<{ sessionId: string }>).detail;

      setRecentSessions((prev) => prev.filter((session) => session.id !== sessionId));

      if (lastSessionIdRef.current === sessionId) {
        lastSessionIdRef.current = null;
      }
      const version = ++fetchVersion;
      acpListRecentSessions(MAX_RECENT_SESSIONS)
        .then((sessions) => {
          if (version !== fetchVersion) return;
          setRecentSessions(
            retainRestoredSessions(
              sessions.filter((session) => session.id !== sessionId),
              restoredSessionsRef.current
            )
          );
        })
        .catch((error) => console.error('Failed to fetch sessions:', error));
    };

    const handleSessionRenamed = (event: Event) => {
      const { sessionId, newName, userInitiated } = (
        event as CustomEvent<{ sessionId: string; newName: string; userInitiated?: boolean }>
      ).detail;

      setRecentSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { ...session, name: newName, ...(userInitiated && { user_set_name: true }) }
            : session
        )
      );
    };

    const handleWorkingDirChanged = (event: Event) => {
      const { sessionId, workingDir } = (
        event as CustomEvent<{ sessionId: string; workingDir: string }>
      ).detail;
      setRecentSessions((prev) =>
        prev.map((session) => (session.id === sessionId ? { ...session, workingDir } : session))
      );
    };

    window.addEventListener(AppEvents.SESSION_DELETED, handleSessionDeleted);
    window.addEventListener(AppEvents.SESSION_RENAMED, handleSessionRenamed);
    window.addEventListener(AppEvents.SESSION_WORKING_DIR_CHANGED, handleWorkingDirChanged);

    return () => {
      window.removeEventListener(AppEvents.SESSION_DELETED, handleSessionDeleted);
      window.removeEventListener(AppEvents.SESSION_RENAMED, handleSessionRenamed);
      window.removeEventListener(AppEvents.SESSION_WORKING_DIR_CHANGED, handleWorkingDirChanged);
    };
  }, []);

  useEffect(() => {
    if (!pendingReleaseId || currentSessionId === pendingReleaseId) return;
    window.dispatchEvent(
      new CustomEvent(AppEvents.SESSION_DELETED, { detail: { sessionId: pendingReleaseId } })
    );
    setPendingReleaseId(null);
  }, [pendingReleaseId, currentSessionId]);

  const releaseSession = useCallback(
    (sessionId: string) => {
      if (lastSessionIdRef.current === sessionId) {
        lastSessionIdRef.current = null;
      }
      cancelAcpPermissionRequestsForSession(sessionId);
      cancelAcpElicitationRequestsForSession(sessionId);
      acpChatSessionActions.deleteSnapshot(sessionId);
      if (currentSessionId === sessionId) {
        navigate('/');
        setPendingReleaseId(sessionId);
        return;
      }
      window.dispatchEvent(new CustomEvent(AppEvents.SESSION_DELETED, { detail: { sessionId } }));
    },
    [currentSessionId, navigate]
  );

  const archiveSession = useCallback(
    async (sessionId: string) => {
      const session = recentSessions.find((item) => item.id === sessionId);
      await acpArchiveSession(sessionId);
      forgetRestoredSession(restoredSessionsRef.current, sessionId);
      discardInFlightSessionFetch();
      setRecentSessions((prev) => prev.filter((item) => item.id !== sessionId));
      const archived = session ? { ...session, archivedAt: new Date().toISOString() } : undefined;
      if (archived) {
        setArchivedSessions((prev) => [archived, ...prev.filter((item) => item.id !== sessionId)]);
      }
      publishSessionListChange({ kind: 'archived', sessionId, session: archived });
      releaseSession(sessionId);
    },
    [discardInFlightSessionFetch, recentSessions, releaseSession]
  );

  const unarchiveSession = useCallback(
    async (sessionId: string) => {
      const session = archivedSessions.find((item) => item.id === sessionId);
      await acpUnarchiveSession(sessionId);
      discardInFlightSessionFetch();
      setArchivedSessions((prev) => prev.filter((item) => item.id !== sessionId));
      const restored = session
        ? rememberRestoredSession(restoredSessionsRef.current, session)
        : undefined;
      if (restored) {
        setRecentSessions((prev) => moveToFront(prev, restored));
      }
      publishSessionListChange({ kind: 'unarchived', sessionId, session: restored });
    },
    [archivedSessions, discardInFlightSessionFetch]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await acpDeleteSession(sessionId);
      forgetRestoredSession(restoredSessionsRef.current, sessionId);
      discardInFlightSessionFetch();
      setRecentSessions((prev) => prev.filter((item) => item.id !== sessionId));
      setArchivedSessions((prev) => prev.filter((item) => item.id !== sessionId));
      publishSessionListChange({ kind: 'deleted', sessionId });
      releaseSession(sessionId);
    },
    [discardInFlightSessionFetch, releaseSession]
  );

  useEffect(() => {
    const applyRemoteChange = (change: SessionListChange) => {
      discardInFlightSessionFetch();
      if (change.kind === 'deleted' || change.kind === 'archived') {
        forgetRestoredSession(restoredSessionsRef.current, change.sessionId);
      }
      if (change.kind === 'archived') {
        setRecentSessions((prev) => prev.filter((item) => item.id !== change.sessionId));
        if (change.session) {
          const archived = {
            ...change.session,
            archivedAt: change.session.archivedAt ?? new Date().toISOString(),
          };
          setArchivedSessions((prev) => [
            archived,
            ...prev.filter((item) => item.id !== change.sessionId),
          ]);
        }
        releaseSession(change.sessionId);
        return;
      }
      if (change.kind === 'unarchived') {
        setArchivedSessions((prev) => prev.filter((item) => item.id !== change.sessionId));
        const restored = change.session;
        if (restored) {
          rememberRestoredSession(restoredSessionsRef.current, restored);
          setRecentSessions((prev) => moveToFront(prev, { ...restored, archivedAt: undefined }));
        }
        return;
      }
      setRecentSessions((prev) => prev.filter((item) => item.id !== change.sessionId));
      setArchivedSessions((prev) => prev.filter((item) => item.id !== change.sessionId));
      releaseSession(change.sessionId);
    };

    return window.electron?.onSessionListChange?.(applyRemoteChange);
  }, [discardInFlightSessionFetch, releaseSession]);

  const handleNavClick = useCallback(
    (path: string) => {
      if (path === '/pair') {
        const sessionId =
          currentSessionId || lastSessionIdRef.current || chatContext?.chat?.sessionId;
        if (sessionId && sessionId.length > 0) {
          navigate(pairSessionPath(sessionId));
        } else {
          navigate('/');
        }
      } else {
        navigate(path);
      }
    },
    [navigate, currentSessionId, chatContext?.chat?.sessionId]
  );

  const handleSessionClick = useCallback(
    (sessionId: string) => {
      navigate(pairSessionPath(sessionId));
    },
    [navigate]
  );

  return {
    recentSessions,
    recentSessionsByProject,
    archivedSessions,
    isLoadingSessions,
    activeSessionId,
    fetchSessions,
    archiveSession,
    unarchiveSession,
    deleteSession,
    handleNavClick,
    handleSessionClick,
  };
}
