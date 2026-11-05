import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface WorkspaceContextType {
  workspacePath: string;
  setWorkspacePath: (newPath: string) => void;
  selectedFile: string | null;
  setSelectedFile: (filePath: string | null) => void;
  openFolderDialog: () => Promise<string | null>;
  refreshTrigger: number;
  refreshWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_KEY = 'goose_workspace_path';

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
