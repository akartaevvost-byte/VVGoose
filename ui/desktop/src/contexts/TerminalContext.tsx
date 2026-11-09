import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useWorkspace } from './WorkspaceContext';
import type { TerminalContextType, TerminalSession } from '../types/terminal';

const TERMINAL_VISIBLE_KEY = 'terminal_visible';
const TERMINAL_HEIGHT_KEY = 'terminal_height';
const TERMINAL_FONT_SIZE_KEY = 'terminal_font_size';
export const DEFAULT_TERMINAL_HEIGHT = 260;
export const MIN_TERMINAL_HEIGHT = 120;
export const DEFAULT_TERMINAL_FONT_SIZE = 12;
export const MIN_TERMINAL_FONT_SIZE = 10;
export const MAX_TERMINAL_FONT_SIZE = 20;

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

export interface TerminalProviderProps {
  children: ReactNode;
}

export const TerminalProvider: React.FC<TerminalProviderProps> = ({ children }) => {
  const { workspacePath, setIsChatVisible } = useWorkspace();

  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  const clearHandlersRef = useRef<Map<string, () => void>>(new Map());
  const selectionGettersRef = useRef<Map<string, () => string>>(new Map());
  const pendingCommandsRef = useRef<Map<string, string>>(new Map());

  const [terminalHeight, setTerminalHeightState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(TERMINAL_HEIGHT_KEY);
      const parsed = saved ? parseInt(saved, 10) : DEFAULT_TERMINAL_HEIGHT;
      return Number.isFinite(parsed) ? parsed : DEFAULT_TERMINAL_HEIGHT;
    } catch {
      return DEFAULT_TERMINAL_HEIGHT;
    }
  });

  const setTerminalHeight = useCallback((value: number | ((prev: number) => number)) => {
    setTerminalHeightState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      const maxHeight =
        typeof window !== 'undefined'
          ? Math.max(MIN_TERMINAL_HEIGHT, window.innerHeight - 150)
          : 800;
      const clamped = Number.isFinite(next)
        ? Math.max(MIN_TERMINAL_HEIGHT, Math.min(next, maxHeight))
        : DEFAULT_TERMINAL_HEIGHT;
      try {
        localStorage.setItem(TERMINAL_HEIGHT_KEY, clamped.toString());
      } catch {
        // Ignore storage errors
      }
      return clamped;
    });
  }, []);

  const [isTerminalVisible, setIsTerminalVisibleState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(TERMINAL_VISIBLE_KEY);
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const setIsTerminalVisible = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => {
      setIsTerminalVisibleState((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        try {
          localStorage.setItem(TERMINAL_VISIBLE_KEY, String(next));
        } catch {
          // Ignore storage errors
        }
        return next;
      });
    },
    []
  );

  const [terminalFontSize, setTerminalFontSizeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(TERMINAL_FONT_SIZE_KEY);
      const parsed = saved ? parseInt(saved, 10) : DEFAULT_TERMINAL_FONT_SIZE;
      return Number.isFinite(parsed) &&
        parsed >= MIN_TERMINAL_FONT_SIZE &&
        parsed <= MAX_TERMINAL_FONT_SIZE
        ? parsed
        : DEFAULT_TERMINAL_FONT_SIZE;
    } catch {
      return DEFAULT_TERMINAL_FONT_SIZE;
    }
  });

  const setTerminalFontSize = useCallback((value: number | ((prev: number) => number)) => {
    setTerminalFontSizeState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      const clamped = Number.isFinite(next)
        ? Math.max(MIN_TERMINAL_FONT_SIZE, Math.min(next, MAX_TERMINAL_FONT_SIZE))
        : DEFAULT_TERMINAL_FONT_SIZE;
      try {
        localStorage.setItem(TERMINAL_FONT_SIZE_KEY, clamped.toString());
      } catch {
        // Ignore storage errors
      }
      return clamped;
    });
  }, []);

  const createTerminal = useCallback(
    (cwd?: string): string => {
      const id = uuidv4();
      const targetCwd = cwd || workspacePath || undefined;

      setSessions((prev) => {
        const title = `Terminal ${prev.length + 1}`;
        const newSession: TerminalSession = {
          id,
          title,
          cwd: targetCwd,
          exitCode: null,
          isRunning: true,
          createdAt: Date.now(),
        };
        return [...prev, newSession];
      });

      setActiveTerminalId(id);
      setIsTerminalVisible(true);

      if (window?.electron?.terminalCreate) {
        const isAura = document.documentElement.getAttribute('data-theme') === 'aura';
        const isDark =
          document.documentElement.classList.contains('dark') ||
          document.documentElement.getAttribute('data-theme') === 'dark' ||
          (!isAura &&
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-color-scheme: dark)').matches);
        const theme: 'light' | 'dark' = isDark || isAura ? 'dark' : 'light';

        window.electron.terminalCreate({ id, cwd: targetCwd, theme }).catch((err) => {
          console.error(`Failed to create terminal session ${id}:`, err);
        });
      }

      return id;
    },
    [workspacePath, setIsTerminalVisible]
  );

  const closeTerminal = useCallback((id: string) => {
    if (window?.electron?.terminalKill) {
      window.electron.terminalKill(id).catch((err) => {
        console.error(`Failed to kill terminal session ${id}:`, err);
      });
    }

    clearHandlersRef.current.delete(id);
    selectionGettersRef.current.delete(id);
    pendingCommandsRef.current.delete(id);

    setSessions((prev) => {
      const nextSessions = prev.filter((s) => s.id !== id);
      return nextSessions;
    });

    setActiveTerminalId((prevActive) => {
      if (prevActive === id) {
        setSessions((currentSessions) => {
          const remaining = currentSessions.filter((s) => s.id !== id);
          if (remaining.length === 0) {
            return [];
          }
          return remaining;
        });
        return null;
      }
      return prevActive;
    });
  }, []);

  // Update activeTerminalId when sessions change if active was closed
  useEffect(() => {
    if (sessions.length > 0) {
      if (!activeTerminalId || !sessions.some((s) => s.id === activeTerminalId)) {
        setActiveTerminalId(sessions[sessions.length - 1].id);
      }
    } else {
      setActiveTerminalId(null);
    }
  }, [sessions, activeTerminalId]);

  const isTerminalVisibleRef = useRef(isTerminalVisible);
  isTerminalVisibleRef.current = isTerminalVisible;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const toggleTerminal = useCallback(() => {
    if (isTerminalVisibleRef.current) {
      setIsTerminalVisible(false);
    } else {
      setIsTerminalVisible(true);
      if (sessionsRef.current.length === 0) {
        createTerminal();
      }
    }
  }, [createTerminal, setIsTerminalVisible]);

  const toggleMaximize = useCallback(() => {
    setIsMaximized((prev) => !prev);
  }, []);

  const registerClearHandler = useCallback((id: string, handler: () => void) => {
    clearHandlersRef.current.set(id, handler);
    return () => {
      clearHandlersRef.current.delete(id);
    };
  }, []);

  const registerSelectionGetter = useCallback((id: string, getter: () => string) => {
    selectionGettersRef.current.set(id, getter);
    return () => {
      selectionGettersRef.current.delete(id);
    };
  }, []);

  const clearActiveTerminal = useCallback(() => {
    if (activeTerminalId) {
      const handler = clearHandlersRef.current.get(activeTerminalId);
      if (handler) {
        handler();
      }
    }
  }, [activeTerminalId]);

  const sendToChat = useCallback(
    (text?: string) => {
      let content = text;
      if (!content && activeTerminalId) {
        const getter = selectionGettersRef.current.get(activeTerminalId);
        if (getter) {
          content = getter();
        }
      }

      if (content && content.trim()) {
        const formatted = content.startsWith('```') ? content : `\`\`\`\n${content}\n\`\`\``;
        window.dispatchEvent(
          new CustomEvent('goose:append-to-chat', {
            detail: { text: formatted },
          })
        );
        setIsChatVisible(true);
      }
    },
    [activeTerminalId, setIsChatVisible]
  );

  const runCommand = useCallback(
    (command: string, autoExecute: boolean = true) => {
      setIsTerminalVisible(true);
      const textToWrite = autoExecute
        ? command.endsWith('\n')
          ? command
          : `${command}\n`
        : command;

      let targetId = activeTerminalId;
      if (!targetId || !sessions.some((s) => s.id === targetId && s.isRunning)) {
        targetId = createTerminal();
        // Store pending command to be flushed when instance mounts
        pendingCommandsRef.current.set(targetId, textToWrite);
        return;
      }

      if (window?.electron?.terminalData) {
        window.electron.terminalData(targetId, textToWrite);
      }
    },
    [activeTerminalId, sessions, createTerminal, setIsTerminalVisible]
  );

  const updateSessionExitCode = useCallback((id: string, exitCode: number) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, exitCode, isRunning: false } : s))
    );
  }, []);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeTerminalId) || null,
    [sessions, activeTerminalId]
  );

  const value = useMemo<TerminalContextType>(
    () => ({
      sessions,
      activeTerminalId,
      activeSession,
      isTerminalVisible,
      terminalHeight,
      isMaximized,
      createTerminal,
      closeTerminal,
      setActiveTerminalId,
      setIsTerminalVisible,
      setTerminalHeight,
      toggleTerminal,
      toggleMaximize,
      clearActiveTerminal,
      sendToChat,
      runCommand,
      registerClearHandler,
      registerSelectionGetter,
      updateSessionExitCode,
      terminalFontSize,
      setTerminalFontSize,
    }),
    [
      sessions,
      activeTerminalId,
      activeSession,
      isTerminalVisible,
      terminalHeight,
      isMaximized,
      createTerminal,
      closeTerminal,
      setActiveTerminalId,
      setIsTerminalVisible,
      setTerminalHeight,
      toggleTerminal,
      toggleMaximize,
      clearActiveTerminal,
      sendToChat,
      runCommand,
      registerClearHandler,
      registerSelectionGetter,
      updateSessionExitCode,
      terminalFontSize,
      setTerminalFontSize,
    ]
  );

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
};

export const useTerminal = (): TerminalContextType => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal must be used within a TerminalProvider');
  }
  return context;
};

export const useOptionalTerminal = (): TerminalContextType | null => {
  return useContext(TerminalContext) || null;
};
