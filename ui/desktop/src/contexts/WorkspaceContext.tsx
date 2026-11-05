import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { OpenFileTab } from '../types/fileSystem';

interface WorkspaceContextType {
  workspacePath: string;
  setWorkspacePath: (newPath: string) => void;
  selectedFile: string | null;
  setSelectedFile: (filePath: string | null) => void;
  openFolderDialog: () => Promise<string | null>;
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
}

export const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_KEY = 'goose_workspace_path';
const CHAT_WIDTH_KEY = 'goose_chat_width';

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

  const setWorkspacePath = useCallback((newPath: string) => {
    setWorkspacePathState(newPath);
    try {
      localStorage.setItem(STORAGE_KEY, newPath);
    } catch {
      // Ignore storage errors
    }
  }, []);

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
  }, [workspacePath, setWorkspacePath, refreshWorkspace]);

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
    },
    [activeFilePath]
  );

  const closeAllFiles = useCallback(() => {
    setOpenFiles([]);
    setActiveFilePath(null);
    setSelectedFile(null);
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
