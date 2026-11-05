/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import * as acpModule from '../acp/permissionRequests';
import * as toastsModule from '../toasts';

vi.mock('../acp/permissionRequests', () => ({
  resolveAcpPermissionRequest: vi.fn(),
}));

vi.mock('../toasts', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

describe('WorkspaceContext', () => {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <WorkspaceProvider>{children}</WorkspaceProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    (window as unknown as { electron: Record<string, unknown> }).electron = {
      workspaceReadFile: vi.fn().mockImplementation((filePath: string) => {
        return Promise.resolve({
          content: `Content of ${filePath}`,
          filePath,
          error: null,
          found: true,
        });
      }),
      workspaceCreateFile: vi.fn().mockResolvedValue({ success: true }),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    };
  });

  it('initializes with default values or localStorage', () => {
    localStorage.setItem('goose_workspace_path', '/custom/path');
    localStorage.setItem('goose_chat_width', '500');

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    expect(result.current.workspacePath).toBe('/custom/path');
    expect(result.current.chatWidth).toBe(500);
    expect(result.current.openFiles).toEqual([]);
    expect(result.current.activeFile).toBeNull();
  });

  it('updates workspacePath and saves to recentWorkspaces', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    act(() => {
      result.current.setWorkspacePath('/my/new/project');
    });

    expect(result.current.workspacePath).toBe('/my/new/project');
    expect(localStorage.getItem('goose_workspace_path')).toBe('/my/new/project');
    expect(result.current.recentWorkspaces.length).toBe(1);
    expect(result.current.recentWorkspaces[0].path).toBe('/my/new/project');
    expect(result.current.recentWorkspaces[0].name).toBe('project');
  });

  it('clamps chatWidth to min/max boundaries', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1600,
    });
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    act(() => {
      result.current.setChatWidth(150); // Below 300
    });
    expect(result.current.chatWidth).toBe(300);

    act(() => {
      result.current.setChatWidth(1200); // Above 900
    });
    expect(result.current.chatWidth).toBe(900);
  });

  it('opens files, manages tabs, and switches active file', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.openFile('/repo/src/main.rs');
    });

    expect(result.current.openFiles.length).toBe(1);
    expect(result.current.activeFilePath).toBe('/repo/src/main.rs');
    expect(result.current.activeFile?.name).toBe('main.rs');
    expect(result.current.activeFile?.content).toBe('Content of /repo/src/main.rs');

    // Opening the same file again shouldn't duplicate the tab
    await act(async () => {
      await result.current.openFile('/repo/src/main.rs');
    });
    expect(result.current.openFiles.length).toBe(1);

    // Open second file
    await act(async () => {
      await result.current.openFile('/repo/src/lib.rs');
    });
    expect(result.current.openFiles.length).toBe(2);
    expect(result.current.activeFilePath).toBe('/repo/src/lib.rs');
  });

  it('updates file content and sets dirty flag', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.openFile('/repo/src/main.rs');
    });

    act(() => {
      result.current.updateFileContent('/repo/src/main.rs', 'fn main() { println!("Updated"); }');
    });

    expect(result.current.activeFile?.content).toBe('fn main() { println!("Updated"); }');
    expect(result.current.activeFile?.isDirty).toBe(true);
  });

  it('saves file and clears dirty flag', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.openFile('/repo/src/main.rs');
    });

    act(() => {
      result.current.updateFileContent('/repo/src/main.rs', 'New content');
    });

    let saveSuccess = false;
    await act(async () => {
      saveSuccess = await result.current.saveFile('/repo/src/main.rs');
    });

    expect(saveSuccess).toBe(true);
    expect(window.electron.workspaceCreateFile).toHaveBeenCalledWith(
      '/repo/src/main.rs',
      'New content'
    );
    expect(result.current.activeFile?.isDirty).toBe(false);
  });

  it('closes a file and switches to adjacent tab', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.openFile('/repo/a.txt');
      await result.current.openFile('/repo/b.txt');
    });

    expect(result.current.openFiles.length).toBe(2);
    expect(result.current.activeFilePath).toBe('/repo/b.txt');

    act(() => {
      result.current.closeFile('/repo/b.txt');
    });

    expect(result.current.openFiles.length).toBe(1);
    expect(result.current.activeFilePath).toBe('/repo/a.txt');

    act(() => {
      result.current.closeAllFiles();
    });

    expect(result.current.openFiles.length).toBe(0);
    expect(result.current.activeFilePath).toBeNull();
  });

  it('proposes diff, calculates LCS stats, and accepts diff with ACP approval', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.proposeDiff({
        id: 'diff-1',
        filePath: '/repo/src/app.ts',
        fileName: 'app.ts',
        originalContent: 'const a = 1;\nconst b = 2;',
        proposedContent: 'const a = 1;\nconst b = 3;\nconst c = 4;',
        toolApprovalData: {
          sessionId: 'session-123',
          id: 'tool-456',
          generation: 'gen-1',
        },
      });
    });

    expect(result.current.pendingDiff).not.toBeNull();
    expect(result.current.pendingDiff?.diffStats?.added).toBe(2);
    expect(result.current.pendingDiff?.diffStats?.deleted).toBe(1);

    // Accept diff
    let accepted = false;
    await act(async () => {
      accepted = await result.current.acceptPendingDiff();
    });

    expect(accepted).toBe(true);
    expect(window.electron.workspaceCreateFile).toHaveBeenCalledWith(
      '/repo/src/app.ts',
      'const a = 1;\nconst b = 3;\nconst c = 4;'
    );
    expect(acpModule.resolveAcpPermissionRequest).toHaveBeenCalledWith(
      'session-123',
      'tool-456',
      'gen-1',
      'allow_once'
    );
    expect(result.current.pendingDiff).toBeNull();
  });

  it('rejects diff with ACP denial and clears pendingDiff', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.proposeDiff({
        id: 'diff-2',
        filePath: '/repo/src/test.ts',
        fileName: 'test.ts',
        originalContent: 'hello',
        proposedContent: 'world',
        toolApprovalData: {
          sessionId: 'session-1',
          id: 'tool-1',
          generation: 'gen-2',
        },
      });
    });

    act(() => {
      result.current.rejectPendingDiff();
    });

    expect(acpModule.resolveAcpPermissionRequest).toHaveBeenCalledWith(
      'session-1',
      'tool-1',
      'gen-2',
      'deny_once'
    );
    expect(result.current.pendingDiff).toBeNull();
  });

  it('displays toast error when opening non-existent or failed file', async () => {
    (window.electron.workspaceReadFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: '',
      filePath: '/nonexistent.txt',
      error: 'File exceeds maximum supported size (10MB)',
      found: true,
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.openFile('/nonexistent.txt');
    });

    expect(toastsModule.toastError).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Не удалось открыть файл',
        msg: 'File exceeds maximum supported size (10MB)',
      })
    );
  });
});
