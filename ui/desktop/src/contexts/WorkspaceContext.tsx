import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type {
  OpenFileTab,
  ProposedFileDiff,
  RecentWorkspace,
  WorkspaceFolderInfo,
} from '../types/fileSystem';
import { computeDiffStats } from '../components/Editor/diffUtils';
import { resolveAcpPermissionRequest } from '../acp/permissionRequests';
import { parseCodeWorkspace } from '../utils/codeWorkspace';
import { AppEvents } from '../constants/events';
import { toastError } from '../toasts';

interface WorkspaceContextType {
  workspacePath: string;
  setWorkspacePath: (newPath: string) => void;
  workspaceFolders: WorkspaceFolderInfo[];
  setWorkspaceFolders: (folders: WorkspaceFolderInfo[]) => void;
  selectedFile: string | null;
  setSelectedFile: (filePath: string | null) => void;
  openFolderDialog: () => Promise<string | null>;
  openWorkspaceFileDialog: () => Promise<string | null>;
  openCodeWorkspace: (filePath: string) => Promise<boolean>;
  recentWorkspaces: RecentWorkspace[];
  openRecentWorkspace: (workspace: RecentWorkspace) => Promise<void>;
  refreshTrigger: number;
  refreshWorkspace: () => void;
  openFiles: OpenFileTab[];
  activeFilePath: string | null;
  activeFile: OpenFileTab | null;
  setActiveFilePath: (filePath: string | null) => void;
  openFile: (
    filePath: string,
    options?: { allowNew?: boolean; initialContent?: string }
  ) => Promise<void>;
  closeFile: (filePath: string) => void;
  closeAllFiles: () => void;
  saveFile: (filePath: string) => Promise<boolean>;
  saveActiveFile: () => Promise<boolean>;
  updateFileContent: (filePath: string, content: string) => void;
  isChatVisible: boolean;
  setIsChatVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isEditorVisible: boolean;
  setIsEditorVisible: React.Dispatch<React.SetStateAction<boolean>>;
  chatWidth: number;
  setChatWidth: (value: number | ((prev: number) => number)) => void;
  isExplorerVisible: boolean;
  setIsExplorerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  explorerWidth: number;
  setExplorerWidth: (value: number | ((prev: number) => number)) => void;
  pendingDiff: ProposedFileDiff | null;
  setPendingDiff: React.Dispatch<React.SetStateAction<ProposedFileDiff | null>>;
  proposeDiff: (diff: Omit<ProposedFileDiff, 'diffStats'>) => Promise<void>;
  acceptPendingDiff: () => Promise<boolean>;
  rejectPendingDiff: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_KEY = 'goose_workspace_path';
const WORKSPACE_FOLDERS_KEY = 'goose_workspace_folders';
const CHAT_WIDTH_KEY = 'goose_chat_width';
const CHAT_VISIBLE_KEY = 'goose_chat_visible';
const EDITOR_VISIBLE_KEY = 'goose_editor_visible';
const EXPLORER_VISIBLE_KEY = 'goose_explorer_visible';
const EXPLORER_WIDTH_KEY = 'goose_explorer_width';
const RECENT_WORKSPACES_KEY = 'goose_recent_workspaces';
const DEFAULT_CHAT_WIDTH = 420;
const DEFAULT_EXPLORER_WIDTH = 280;

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspacePath, setWorkspacePathState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const [workspaceFolders, setWorkspaceFoldersState] = useState<WorkspaceFolderInfo[]>(() => {
    try {
      const saved = localStorage.getItem(WORKSPACE_FOLDERS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const singlePath = localStorage.getItem(STORAGE_KEY) || '';
      if (singlePath) {
        const name = singlePath.split(/[/\\]/).filter(Boolean).pop() || singlePath;
        return [{ path: singlePath, name }];
      }
      return [];
    } catch {
      return [];
    }
  });

  const setWorkspaceFolders = useCallback((folders: WorkspaceFolderInfo[]) => {
    setWorkspaceFoldersState(folders);
    try {
      localStorage.setItem(WORKSPACE_FOLDERS_KEY, JSON.stringify(folders));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [openFiles, setOpenFiles] = useState<OpenFileTab[]>([]);
  const openFilesRef = useRef<OpenFileTab[]>(openFiles);
  openFilesRef.current = openFiles;

  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const [isChatVisible, setIsChatVisibleState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(CHAT_VISIBLE_KEY);
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const setIsChatVisible = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    setIsChatVisibleState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      try {
        localStorage.setItem(CHAT_VISIBLE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const [isEditorVisible, setIsEditorVisibleState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(EDITOR_VISIBLE_KEY);
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const setIsEditorVisible = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    setIsEditorVisibleState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      try {
        localStorage.setItem(EDITOR_VISIBLE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const [pendingDiff, setPendingDiff] = useState<ProposedFileDiff | null>(null);

  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_WORKSPACES_KEY);
      if (!raw) return [];
      const items = JSON.parse(raw) as Array<Partial<RecentWorkspace>>;
      return items.map((item) => ({
        path: item.path || '',
        name: item.name || '',
        lastOpened: item.lastOpened || Date.now(),
        isWorkspaceFile: Boolean(item.isWorkspaceFile),
        workspaceFilePath: item.workspaceFilePath,
      }));
    } catch {
      return [];
    }
  });

  const [chatWidth, setChatWidthState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(CHAT_WIDTH_KEY);
      const parsed = saved ? parseInt(saved, 10) : DEFAULT_CHAT_WIDTH;
      return Number.isFinite(parsed) ? parsed : DEFAULT_CHAT_WIDTH;
    } catch {
      return DEFAULT_CHAT_WIDTH;
    }
  });

  const setChatWidth = useCallback((value: number | ((prev: number) => number)) => {
    setChatWidthState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      const maxAllowed =
        typeof window !== 'undefined' ? Math.max(300, window.innerWidth - 450) : 900;
      // A NaN width would persist to localStorage and break the panel forever
      const clamped = Number.isFinite(next)
        ? Math.max(300, Math.min(next, Math.min(900, maxAllowed)))
        : DEFAULT_CHAT_WIDTH;
      try {
        localStorage.setItem(CHAT_WIDTH_KEY, clamped.toString());
      } catch {
        // Ignore storage errors
      }
      return clamped;
    });
  }, []);

  const [isExplorerVisible, setIsExplorerVisibleState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(EXPLORER_VISIBLE_KEY);
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const setIsExplorerVisible = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    setIsExplorerVisibleState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      try {
        localStorage.setItem(EXPLORER_VISIBLE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const [explorerWidth, setExplorerWidthState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(EXPLORER_WIDTH_KEY);
      const parsed = saved ? parseInt(saved, 10) : DEFAULT_EXPLORER_WIDTH;
      return Number.isFinite(parsed) ? parsed : DEFAULT_EXPLORER_WIDTH;
    } catch {
      return DEFAULT_EXPLORER_WIDTH;
    }
  });

  const setExplorerWidth = useCallback((value: number | ((prev: number) => number)) => {
    setExplorerWidthState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      const maxAllowed =
        typeof window !== 'undefined' ? Math.max(200, window.innerWidth - 500) : 600;
      const clamped = Number.isFinite(next)
        ? Math.max(200, Math.min(next, Math.min(600, maxAllowed)))
        : DEFAULT_EXPLORER_WIDTH;
      try {
        localStorage.setItem(EXPLORER_WIDTH_KEY, clamped.toString());
      } catch {
        // Ignore storage errors
      }
      return clamped;
    });
  }, []);

  const refreshWorkspace = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const addRecentWorkspace = useCallback(
    (
      path: string,
      customName?: string,
      isWorkspaceFile = false,
      workspaceFilePath?: string,
      folders?: WorkspaceFolderInfo[]
    ) => {
      if (!path) return;
      const name = customName || path.split(/[/\\]/).filter(Boolean).pop() || path;
      setRecentWorkspaces((prev) => {
        const filtered = prev.filter(
          (w) =>
            w.path !== path && (!workspaceFilePath || w.workspaceFilePath !== workspaceFilePath)
        );
        const updated: RecentWorkspace[] = [
          {
            path,
            name,
            lastOpened: Date.now(),
            isWorkspaceFile,
            workspaceFilePath,
            folders,
          },
          ...filtered,
        ].slice(0, 10);

        try {
          localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(updated));
        } catch {
          // Ignore storage errors
        }
        return updated;
      });
    },
    []
  );

  const closeAllFiles = useCallback(() => {
    setOpenFiles([]);
    setActiveFilePath(null);
    setSelectedFile(null);
    setPendingDiff(null);
  }, []);

  const setWorkspacePath = useCallback(
    (newPath: string) => {
      // Tabs from the previous root can no longer be saved under the new one
      closeAllFiles();
      setWorkspacePathState(newPath);
      const folders: WorkspaceFolderInfo[] = newPath
        ? [{ path: newPath, name: newPath.split(/[/\\]/).filter(Boolean).pop() || newPath }]
        : [];
      setWorkspaceFolders(folders);
      try {
        localStorage.setItem(STORAGE_KEY, newPath);
      } catch {
        // Ignore storage errors
      }
      if (newPath) {
        addRecentWorkspace(newPath, undefined, false, undefined, folders);
      }
    },
    [addRecentWorkspace, closeAllFiles, setWorkspaceFolders]
  );

  const openCodeWorkspace = useCallback(
    async (workspaceFilePath: string): Promise<boolean> => {
      if (!window.electron?.workspaceReadFile) return false;
      try {
        const res = await window.electron.workspaceReadFile(workspaceFilePath);
        if (res && res.found && res.content) {
          const parsed = parseCodeWorkspace(res.content, workspaceFilePath);
          if (parsed) {
            closeAllFiles();
            setWorkspacePathState(parsed.rootPath);
            setWorkspaceFolders(parsed.folders);
            try {
              localStorage.setItem(STORAGE_KEY, parsed.rootPath);
            } catch {
              // Ignore
            }
            addRecentWorkspace(parsed.rootPath, parsed.name, true, workspaceFilePath, parsed.folders);
            refreshWorkspace();
            return true;
          }
        }
        toastError({
          title: 'Не удалось открыть рабочее пространство',
          msg: res?.error || 'Файл имеет некорректный формат .code-workspace',
        });
        return false;
      } catch (err) {
        toastError({
          title: 'Ошибка открытия файла .code-workspace',
          msg: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    },
    [addRecentWorkspace, closeAllFiles, refreshWorkspace, setWorkspaceFolders]
  );

  const openRecentWorkspace = useCallback(
    async (workspace: RecentWorkspace) => {
      if (workspace.isWorkspaceFile && workspace.workspaceFilePath) {
        await openCodeWorkspace(workspace.workspaceFilePath);
      } else {
        setWorkspacePath(workspace.path);
        if (workspace.folders && workspace.folders.length > 0) {
          setWorkspaceFolders(workspace.folders);
        }
        setSelectedFile(null);
        refreshWorkspace();
      }
    },
    [openCodeWorkspace, setWorkspacePath, setWorkspaceFolders, refreshWorkspace]
  );

  // Listen for file changes from Electron main process with debounce
  useEffect(() => {
    if (!workspacePath || !window.electron?.workspaceStartWatching) return;

    const pathsToWatch =
      workspaceFolders.length > 0 ? workspaceFolders.map((f) => f.path) : [workspacePath];

    window.electron.workspaceStartWatching(pathsToWatch).catch(() => {});

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleFilesChanged = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshWorkspace();
      }, 300);
    };

    window.electron.on('workspace-files-changed', handleFilesChanged);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.electron?.off('workspace-files-changed', handleFilesChanged);
      window.electron?.workspaceStopWatching?.().catch(() => {});
    };
  }, [workspacePath, workspaceFolders, refreshWorkspace]);

  const selectAndOpenWorkspace = useCallback(
    async (kind: 'folder' | 'code-workspace'): Promise<string | null> => {
      if (!window.electron?.selectFileOrDirectory) return null;
      try {
        const isWorkspaceFile = kind === 'code-workspace';
        const selected = await window.electron.selectFileOrDirectory(
          workspacePath || undefined,
          isWorkspaceFile
            ? { mode: 'file', extensions: ['code-workspace'] }
            : { mode: 'directory' }
        );
        if (!selected) return null;

        if (isWorkspaceFile) {
          if (!selected.endsWith('.code-workspace')) {
            toastError({
              title: 'Ошибка открытия файла',
              msg: 'Выбранный файл должен иметь расширение .code-workspace',
            });
            return null;
          }
          await openCodeWorkspace(selected);
        } else {
          setWorkspacePath(selected);
        }
        setSelectedFile(null);
        refreshWorkspace();
        return selected;
      } catch (error) {
        toastError({
          title: kind === 'code-workspace' ? 'Ошибка открытия файла' : 'Ошибка выбора папки',
          msg: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    [workspacePath, openCodeWorkspace, setWorkspacePath, refreshWorkspace]
  );

  const openFolderDialog = useCallback(
    () => selectAndOpenWorkspace('folder'),
    [selectAndOpenWorkspace]
  );

  const openWorkspaceFileDialog = useCallback(
    () => selectAndOpenWorkspace('code-workspace'),
    [selectAndOpenWorkspace]
  );

  const openFile = useCallback(
    async (filePath: string, options?: { allowNew?: boolean; initialContent?: string }) => {
      // If already open, just switch active tab
      const existing = openFilesRef.current.find((f) => f.path === filePath);
      if (existing) {
        setActiveFilePath(filePath);
        setSelectedFile(filePath);
        setIsEditorVisible(true);
        return;
      }

      if (!window.electron?.workspaceReadFile) return;

      try {
        const result = await window.electron.workspaceReadFile(filePath);
        if (result?.error) {
          toastError({
            title: 'Не удалось открыть файл',
            msg: result.error,
          });
          return;
        }

        if (result && result.found && result.content !== null && result.content !== undefined) {
          const name = filePath.split(/[/\\]/).pop() || filePath;
          const newTab: OpenFileTab = {
            path: filePath,
            name,
            content: result.content,
            originalContent: result.content,
            isDirty: false,
          };
          setOpenFiles((prev) => {
            const alreadyHas = prev.some((f) => f.path === filePath);
            return alreadyHas ? prev : [...prev, newTab];
          });
          setActiveFilePath(filePath);
          setSelectedFile(filePath);
          setIsEditorVisible(true);
        } else if (options?.allowNew) {
          const name = filePath.split(/[/\\]/).pop() || filePath;
          const initial = options.initialContent ?? '';
          const newTab: OpenFileTab = {
            path: filePath,
            name,
            content: initial,
            originalContent: initial,
            isDirty: false,
          };
          setOpenFiles((prev) => {
            const alreadyHas = prev.some((f) => f.path === filePath);
            return alreadyHas ? prev : [...prev, newTab];
          });
          setActiveFilePath(filePath);
          setSelectedFile(filePath);
          setIsEditorVisible(true);
        } else {
          toastError({
            title: 'Файл не найден',
            msg: `Файл не существует: ${filePath}`,
          });
        }
      } catch (err) {
        toastError({
          title: 'Ошибка открытия файла',
          msg: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [setIsEditorVisible]
  );

  const closeFile = useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => {
        const closedIdx = prev.findIndex((f) => f.path === filePath);
        const remaining = prev.filter((f) => f.path !== filePath);

        if (activeFilePath === filePath) {
          if (remaining.length > 0) {
            const targetIdx = closedIdx >= 0 ? Math.min(closedIdx, remaining.length - 1) : 0;
            const nextActive = remaining[targetIdx];
            if (nextActive) {
              setActiveFilePath(nextActive.path);
              setSelectedFile(nextActive.path);
            } else {
              setActiveFilePath(null);
              setSelectedFile(null);
            }
          } else {
            setActiveFilePath(null);
            setSelectedFile(null);
          }
        }

        return remaining;
      });

      setPendingDiff((currentDiff) => {
        if (currentDiff?.filePath === filePath) {
          return null;
        }
        return currentDiff;
      });
    },
    [activeFilePath, setSelectedFile]
  );

  const updateFileContent = useCallback((filePath: string, content: string) => {
    setOpenFiles((prev) =>
      prev.map((tab) => {
        if (tab.path === filePath) {
          return {
            ...tab,
            content,
            isDirty: content !== tab.originalContent,
          };
        }
        return tab;
      })
    );
  }, []);

  const saveFile = useCallback(
    async (filePath: string): Promise<boolean> => {
      const tab = openFilesRef.current.find((f) => f.path === filePath);
      if (!tab) return false;
      if (!tab.isDirty) return true;
      if (!window.electron?.workspaceCreateFile) return false;

      const contentToSave = tab.content;
      try {
        const res = await window.electron.workspaceCreateFile(filePath, contentToSave, true);
        if (res.success) {
          setOpenFiles((prev) =>
            prev.map((t) =>
              t.path === filePath
                ? { ...t, originalContent: contentToSave, isDirty: t.content !== contentToSave }
                : t
            )
          );
          refreshWorkspace();
          return true;
        } else {
          toastError({
            title: 'Не удалось сохранить файл',
            msg: res.error || 'Ошибка записи на диск',
          });
          return false;
        }
      } catch (err) {
        toastError({
          title: 'Ошибка сохранения файла',
          msg: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    },
    [refreshWorkspace]
  );

  const saveActiveFile = useCallback(async (): Promise<boolean> => {
    if (!activeFilePath) return false;
    return saveFile(activeFilePath);
  }, [activeFilePath, saveFile]);

  const proposeDiff = useCallback(
    async (diffInput: Omit<ProposedFileDiff, 'diffStats'>) => {
      let original = diffInput.originalContent;
      // If original content is empty, try reading the actual file if it exists
      if (!original && window.electron?.workspaceReadFile) {
        try {
          const res = await window.electron.workspaceReadFile(diffInput.filePath);
          if (res?.found && res.content) {
            original = res.content;
          }
        } catch {
          // Keep as empty
        }
      }

      let proposed = diffInput.proposedContent;
      if (!proposed && diffInput.beforeText && diffInput.afterText) {
        const before = diffInput.beforeText;
        const after = diffInput.afterText;
        // Replacer function keeps $&-style sequences in `after` literal instead
        // of letting String.replace expand them as substitution patterns
        proposed = original.replace(before, () => after);
      }

      const stats = computeDiffStats(original, proposed);
      const fullDiff: ProposedFileDiff = {
        ...diffInput,
        originalContent: original,
        proposedContent: proposed,
        diffStats: stats,
      };

      setPendingDiff(fullDiff);
      setIsEditorVisible(true);
      await openFile(fullDiff.filePath, { allowNew: true, initialContent: original });
    },
    [openFile, setIsEditorVisible]
  );

  const acceptPendingDiff = useCallback(async (): Promise<boolean> => {
    if (!pendingDiff) return false;
    const { filePath, proposedContent, toolApprovalData } = pendingDiff;

    try {
      // Write first: the tab, the approval and the pending diff must only be
      // cleared once the edit really is on disk
      if (window.electron?.workspaceCreateFile) {
        const res = await window.electron.workspaceCreateFile(filePath, proposedContent, true);
        if (!res.success) {
          toastError({
            title: 'Не удалось применить изменения',
            msg: res.error || 'Ошибка записи на диск',
          });
          return false;
        }
      }

      setOpenFiles((prev) =>
        prev.map((tab) =>
          tab.path === filePath
            ? { ...tab, content: proposedContent, originalContent: proposedContent, isDirty: false }
            : tab
        )
      );

      if (toolApprovalData) {
        resolveAcpPermissionRequest(
          toolApprovalData.sessionId,
          toolApprovalData.id,
          toolApprovalData.generation,
          'allow_once'
        );
      }

      refreshWorkspace();
      setPendingDiff(null);
      return true;
    } catch (err) {
      toastError({
        title: 'Не удалось применить изменения',
        msg: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }, [pendingDiff, refreshWorkspace]);

  const rejectPendingDiff = useCallback(() => {
    if (!pendingDiff) return;
    const { toolApprovalData } = pendingDiff;

    if (toolApprovalData) {
      resolveAcpPermissionRequest(
        toolApprovalData.sessionId,
        toolApprovalData.id,
        toolApprovalData.generation,
        'deny_once'
      );
    }

    setPendingDiff(null);
  }, [pendingDiff]);

  // Listen for AGENT_PROPOSE_DIFF event
  useEffect(() => {
    const handleProposeDiffEvent = (e: Event) => {
      const customEvent = e as CustomEvent<Omit<ProposedFileDiff, 'diffStats'>>;
      if (customEvent.detail) {
        void proposeDiff(customEvent.detail);
      }
    };

    window.addEventListener(AppEvents.AGENT_PROPOSE_DIFF, handleProposeDiffEvent);
    return () => {
      window.removeEventListener(AppEvents.AGENT_PROPOSE_DIFF, handleProposeDiffEvent);
    };
  }, [proposeDiff]);

  const activeFile = useMemo(
    () => openFiles.find((f) => f.path === activeFilePath) || null,
    [openFiles, activeFilePath]
  );

  const contextValue = useMemo(
    () => ({
      workspacePath,
      setWorkspacePath,
      workspaceFolders,
      setWorkspaceFolders,
      selectedFile,
      setSelectedFile,
      openFolderDialog,
      openWorkspaceFileDialog,
      openCodeWorkspace,
      recentWorkspaces,
      openRecentWorkspace,
      refreshTrigger,
      refreshWorkspace,
      openFiles,
      activeFilePath,
      activeFile,
      setActiveFilePath,
      openFile,
      closeFile,
      closeAllFiles,
      saveFile,
      saveActiveFile,
      updateFileContent,
      isChatVisible,
      setIsChatVisible,
      isEditorVisible,
      setIsEditorVisible,
      chatWidth,
      setChatWidth,
      isExplorerVisible,
      setIsExplorerVisible,
      explorerWidth,
      setExplorerWidth,
      pendingDiff,
      setPendingDiff,
      proposeDiff,
      acceptPendingDiff,
      rejectPendingDiff,
    }),
    [
      workspacePath,
      setWorkspacePath,
      workspaceFolders,
      setWorkspaceFolders,
      selectedFile,
      setSelectedFile,
      openFolderDialog,
      openWorkspaceFileDialog,
      openCodeWorkspace,
      recentWorkspaces,
      openRecentWorkspace,
      refreshTrigger,
      refreshWorkspace,
      openFiles,
      activeFilePath,
      activeFile,
      setActiveFilePath,
      openFile,
      closeFile,
      closeAllFiles,
      saveFile,
      saveActiveFile,
      updateFileContent,
      isChatVisible,
      setIsChatVisible,
      isEditorVisible,
      setIsEditorVisible,
      chatWidth,
      setChatWidth,
      isExplorerVisible,
      setIsExplorerVisible,
      explorerWidth,
      setExplorerWidth,
      pendingDiff,
      setPendingDiff,
      proposeDiff,
      acceptPendingDiff,
      rejectPendingDiff,
    ]
  );

  return <WorkspaceContext.Provider value={contextValue}>{children}</WorkspaceContext.Provider>;
};

export function useWorkspace(): WorkspaceContextType {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
