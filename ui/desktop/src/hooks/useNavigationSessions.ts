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
      const [sessions, archived] = await Promise.all([
        acpListRecentSessions(MAX_RECENT_SESSIONS),
        acpListArchivedSessions(),
      ]);
      if (fetchId === latestFetchIdRef.current) {
        setRecentSessions(sessions);
        setArchivedSessions(archived);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      if (fetchId === latestFetchIdRef.current) {
        setIsLoadingSessions(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    if (recentSessions.some((s) => s.id === activeSessionId)) return;

    acpGetSessionListItem(activeSessionId)
      .then((item) => {
        if (item.archivedAt) return;
        setRecentSessions((prev) => prependUnique(prev, item));
      })
      .catch((error) => {
        console.error('Failed to fetch active session:', error);
      });
  }, [activeSessionId, recentSessions]);

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
          setRecentSessions((prev) => mergeWithEmptyLocals(prev, listed));
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
          setRecentSessions(sessions.filter((session) => session.id !== sessionId));
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
      setRecentSessions((prev) => prev.filter((item) => item.id !== sessionId));
      if (session) {
        setArchivedSessions((prev) => [
          { ...session, archivedAt: new Date().toISOString() },
          ...prev.filter((item) => item.id !== sessionId),
        ]);
      }
      releaseSession(sessionId);
    },
    [recentSessions, releaseSession]
  );

  const unarchiveSession = useCallback(async (sessionId: string) => {
    await acpUnarchiveSession(sessionId);
    setArchivedSessions((prev) => prev.filter((item) => item.id !== sessionId));
    const listed = await acpListRecentSessions(MAX_RECENT_SESSIONS);
    setRecentSessions(listed);
  }, []);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await acpDeleteSession(sessionId);
      setRecentSessions((prev) => prev.filter((item) => item.id !== sessionId));
      setArchivedSessions((prev) => prev.filter((item) => item.id !== sessionId));
      releaseSession(sessionId);
    },
    [releaseSession]
  );

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
