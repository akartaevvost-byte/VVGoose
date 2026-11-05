import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { OpenFileTab, ProposedFileDiff, RecentWorkspace } from '../types/fileSystem';
import { computeDiffStats } from '../components/Editor/diffUtils';
import { resolveAcpPermissionRequest } from '../acp/permissionRequests';
import { parseCodeWorkspace } from '../utils/codeWorkspace';
import { AppEvents } from '../constants/events';

interface WorkspaceContextType {
  workspacePath: string;
  setWorkspacePath: (newPath: string) => void;
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
  openFile: (filePath: string) => Promise<void>;
  closeFile: (filePath: string) => void;
  closeAllFiles: () => void;
  saveFile: (filePath: string) => Promise<boolean>;
  saveActiveFile: () => Promise<boolean>;
  updateFileContent: (filePath: string, content: string) => void;
  isEditorVisible: boolean;
  setIsEditorVisible: React.Dispatch<React.SetStateAction<boolean>>;
  chatWidth: number;
  setChatWidth: (value: number | ((prev: number) => number)) => void;
  pendingDiff: ProposedFileDiff | null;
  setPendingDiff: React.Dispatch<React.SetStateAction<ProposedFileDiff | null>>;
  proposeDiff: (diff: Omit<ProposedFileDiff, 'diffStats'>) => Promise<void>;
  acceptPendingDiff: () => Promise<boolean>;
  rejectPendingDiff: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_KEY = 'goose_workspace_path';
const CHAT_WIDTH_KEY = 'goose_chat_width';
const RECENT_WORKSPACES_KEY = 'goose_recent_workspaces';

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspacePath, setWorkspacePathState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [openFiles, setOpenFiles] = useState<OpenFileTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [isEditorVisible, setIsEditorVisible] = useState<boolean>(true);
  const [pendingDiff, setPendingDiff] = useState<ProposedFileDiff | null>(null);

  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_WORKSPACES_KEY);
      return raw ? (JSON.parse(raw) as RecentWorkspace[]) : [];
    } catch {
      return [];
    }
  });

  const [chatWidth, setChatWidthState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(CHAT_WIDTH_KEY);
      return saved ? parseInt(saved, 10) : 420;
    } catch {
      return 420;
    }
  });

  const setChatWidth = useCallback((value: number | ((prev: number) => number)) => {
    setChatWidthState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      const clamped = Math.max(300, Math.min(next, 900));
      try {
        localStorage.setItem(CHAT_WIDTH_KEY, clamped.toString());
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
    (path: string, customName?: string, isWorkspaceFile = false, workspaceFilePath?: string) => {
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

  const setWorkspacePath = useCallback(
    (newPath: string) => {
      setWorkspacePathState(newPath);
      try {
        localStorage.setItem(STORAGE_KEY, newPath);
      } catch {
        // Ignore storage errors
      }
      if (newPath) {
        addRecentWorkspace(newPath);
      }
    },
    [addRecentWorkspace]
  );

  const openCodeWorkspace = useCallback(
    async (workspaceFilePath: string): Promise<boolean> => {
      if (!window.electron?.workspaceReadFile) return false;
      try {
        const res = await window.electron.workspaceReadFile(workspaceFilePath);
        if (res && res.found && res.content) {
          const parsed = parseCodeWorkspace(res.content, workspaceFilePath);
          if (parsed) {
            setWorkspacePathState(parsed.rootPath);
            try {
              localStorage.setItem(STORAGE_KEY, parsed.rootPath);
            } catch {
              // Ignore
            }
            addRecentWorkspace(parsed.rootPath, parsed.name, true, workspaceFilePath);
            setSelectedFile(null);
            refreshWorkspace();
            return true;
          }
        }
        return false;
      } catch (err) {
        console.error('Failed to open .code-workspace file:', err);
        return false;
      }
    },
    [addRecentWorkspace, refreshWorkspace]
  );

  const openRecentWorkspace = useCallback(
    async (workspace: RecentWorkspace) => {
      if (workspace.isWorkspaceFile && workspace.workspaceFilePath) {
        await openCodeWorkspace(workspace.workspaceFilePath);
      } else {
        setWorkspacePath(workspace.path);
        setSelectedFile(null);
        refreshWorkspace();
      }
    },
    [openCodeWorkspace, setWorkspacePath, refreshWorkspace]
  );

  // Listen for file changes from Electron main process
  useEffect(() => {
    if (!workspacePath || !window.electron?.workspaceStartWatching) return;

    window.electron.workspaceStartWatching(workspacePath).catch(() => {});

    const handleFilesChanged = () => {
      refreshWorkspace();
    };

    window.electron.on('workspace-files-changed', handleFilesChanged);

    return () => {
      window.electron?.off('workspace-files-changed', handleFilesChanged);
      window.electron?.workspaceStopWatching?.().catch(() => {});
    };
  }, [workspacePath, refreshWorkspace]);

  const openFolderDialog = useCallback(async (): Promise<string | null> => {
    if (!window.electron?.selectFileOrDirectory) return null;
    try {
      const selected = await window.electron.selectFileOrDirectory(workspacePath || undefined);
      if (selected) {
        if (selected.endsWith('.code-workspace')) {
          await openCodeWorkspace(selected);
          return selected;
        }
        setWorkspacePath(selected);
        setSelectedFile(null);
        refreshWorkspace();
        return selected;
      }
      return null;
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
      return null;
    }
  }, [workspacePath, setWorkspacePath, openCodeWorkspace, refreshWorkspace]);

  const openWorkspaceFileDialog = useCallback(async (): Promise<string | null> => {
    if (!window.electron?.selectFileOrDirectory) return null;
    try {
      const selected = await window.electron.selectFileOrDirectory(workspacePath || undefined);
      if (selected) {
        if (selected.endsWith('.code-workspace')) {
          await openCodeWorkspace(selected);
        } else {
          setWorkspacePath(selected);
        }
        setSelectedFile(null);
        refreshWorkspace();
        return selected;
      }
      return null;
    } catch (error) {
      console.error('Failed to open workspace dialog:', error);
      return null;
    }
  }, [workspacePath, openCodeWorkspace, setWorkspacePath, refreshWorkspace]);

  const openFile = useCallback(
    async (filePath: string) => {
      // If already open, just switch active tab
      const existing = openFiles.find((f) => f.path === filePath);
      if (existing) {
        setActiveFilePath(filePath);
        setSelectedFile(filePath);
        setIsEditorVisible(true);
        return;
      }

      if (!window.electron?.workspaceReadFile) return;

      try {
        const result = await window.electron.workspaceReadFile(filePath);
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
        } else if (result?.error) {
          console.error(`Failed to read file ${filePath}:`, result.error);
        }
      } catch (err) {
        console.error(`Error opening file ${filePath}:`, err);
      }
    },
    [openFiles]
  );

  const closeFile = useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => {
        const next = prev.filter((f) => f.path !== filePath);
        if (activeFilePath === filePath) {
          if (next.length > 0) {
            const closedIdx = prev.findIndex((f) => f.path === filePath);
            const nextActive = next[Math.min(closedIdx, next.length - 1)];
            setActiveFilePath(nextActive.path);
            setSelectedFile(nextActive.path);
          } else {
            setActiveFilePath(null);
            setSelectedFile(null);
          }
        }
        return next;
      });
      // If closing the file with a pending diff, clear the diff
      if (pendingDiff?.filePath === filePath) {
        setPendingDiff(null);
      }
    },
    [activeFilePath, pendingDiff]
  );

  const closeAllFiles = useCallback(() => {
    setOpenFiles([]);
    setActiveFilePath(null);
    setSelectedFile(null);
    setPendingDiff(null);
  }, []);

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
      const tab = openFiles.find((f) => f.path === filePath);
      if (!tab) return false;
      if (!window.electron?.workspaceCreateFile) return false;

      try {
        const res = await window.electron.workspaceCreateFile(filePath, tab.content);
        if (res.success) {
          setOpenFiles((prev) =>
            prev.map((t) =>
              t.path === filePath ? { ...t, originalContent: t.content, isDirty: false } : t
            )
          );
          refreshWorkspace();
          return true;
        } else {
          console.error('Failed to save file:', res.error);
          return false;
        }
      } catch (err) {
        console.error('Error saving file:', err);
        return false;
      }
    },
    [openFiles, refreshWorkspace]
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
        proposed = original.replace(diffInput.beforeText, diffInput.afterText);
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
      await openFile(fullDiff.filePath);
    },
    [openFile]
  );

  const acceptPendingDiff = useCallback(async (): Promise<boolean> => {
    if (!pendingDiff) return false;
    const { filePath, proposedContent, toolApprovalData } = pendingDiff;

    try {
      // 1. Update in openFiles
      setOpenFiles((prev) =>
        prev.map((tab) =>
          tab.path === filePath
            ? { ...tab, content: proposedContent, originalContent: proposedContent, isDirty: false }
            : tab
        )
      );

      // 2. Save to disk
      if (window.electron?.workspaceCreateFile) {
        await window.electron.workspaceCreateFile(filePath, proposedContent);
      }

      // 3. If there is ACP tool approval data, approve it!
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
      console.error('Failed to accept pending diff:', err);
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

  return (
    <WorkspaceContext.Provider
      value={{
        workspacePath,
        setWorkspacePath,
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
        isEditorVisible,
        setIsEditorVisible,
        chatWidth,
        setChatWidth,
        pendingDiff,
        setPendingDiff,
        proposeDiff,
        acceptPendingDiff,
        rejectPendingDiff,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace(): WorkspaceContextType {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
