/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileExplorer } from './FileExplorer';
import { WorkspaceProvider } from '../../contexts/WorkspaceContext';
import type { WorkspaceFileNode } from '../../types/fileSystem';

describe('FileExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders prompt when no workspace directory is open', () => {
    render(
      <WorkspaceProvider>
        <FileExplorer />
      </WorkspaceProvider>
    );

    expect(screen.getByText('Папка проекта не открыта')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Открыть папку...' })).toBeDefined();
  });

  it('renders files and folders when workspace directory is selected', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    const mockRootNodes: WorkspaceFileNode[] = [
      {
        name: 'crates',
        path: '/mock/workspace/crates',
        relativePath: 'crates',
        isDirectory: true,
      },
      {
        name: 'Cargo.toml',
        path: '/mock/workspace/Cargo.toml',
        relativePath: 'Cargo.toml',
        isDirectory: false,
        gitStatus: 'modified',
      },
      {
        name: 'README.md',
        path: '/mock/workspace/README.md',
        relativePath: 'README.md',
        isDirectory: false,
        gitStatus: 'untracked',
      },
    ];

    const mockCratesChildren: WorkspaceFileNode[] = [
      {
        name: 'goose',
        path: '/mock/workspace/crates/goose',
        relativePath: 'crates/goose',
        isDirectory: true,
      },
    ];

    (window as unknown as { electron: Record<string, unknown> }).electron = {
      workspaceReadDirectory: vi.fn().mockImplementation((_root: string, relPath: string) => {
        if (!relPath) return Promise.resolve(mockRootNodes);
        if (relPath === 'crates') return Promise.resolve(mockCratesChildren);
        return Promise.resolve([]);
      }),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
      selectFileOrDirectory: vi.fn(),
    };

    render(
      <WorkspaceProvider>
        <FileExplorer />
      </WorkspaceProvider>
    );

    // Verify workspace name in header
    await waitFor(() => {
      expect(screen.getByText('workspace')).toBeDefined();
      expect(screen.getByText('crates')).toBeDefined();
      expect(screen.getByText('Cargo.toml')).toBeDefined();
      expect(screen.getByText('README.md')).toBeDefined();
    });

    // Verify Git status badges M and U
    expect(screen.getByText('M')).toBeDefined();
    expect(screen.getByText('U')).toBeDefined();

    // Toggle folder expansion
    fireEvent.click(screen.getByText('crates'));

    await waitFor(() => {
      expect(screen.getByText('goose')).toBeDefined();
    });
  });

  it('opens create-file action modal when clicking create file button in header', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    (window as unknown as { electron: Record<string, unknown> }).electron = {
      workspaceReadDirectory: vi.fn().mockResolvedValue([]),
      workspaceReadFile: vi
        .fn()
        .mockResolvedValue({ found: false, content: '', filePath: '', error: null }),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
      workspaceCreateFile: vi.fn().mockResolvedValue({ success: true }),
      on: vi.fn(),
      off: vi.fn(),
    };

    render(
      <WorkspaceProvider>
        <FileExplorer />
      </WorkspaceProvider>
    );

    const createFileBtn = screen.getByTitle('Создать файл в корне проекта');
    fireEvent.click(createFileBtn);

    expect(screen.getByText('Создать новый файл')).toBeDefined();
    const input = screen.getByPlaceholderText('Введите имя...');
    fireEvent.change(input, { target: { value: 'newfile.rs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(window.electron.workspaceCreateFile).toHaveBeenCalledWith(
        '/mock/workspace/newfile.rs',
        '',
        false
      );
    });
  });

  it('asks for confirmation before overwriting an existing file', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    (window as unknown as { electron: Record<string, unknown> }).electron = {
      workspaceReadDirectory: vi.fn().mockResolvedValue([]),
      workspaceReadFile: vi.fn().mockResolvedValue({
        found: true,
        content: 'existing content',
        filePath: '/mock/workspace/main.rs',
        error: null,
      }),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
      workspaceCreateFile: vi.fn().mockResolvedValue({ success: true }),
      on: vi.fn(),
      off: vi.fn(),
    };

    render(
      <WorkspaceProvider>
        <FileExplorer />
      </WorkspaceProvider>
    );

    fireEvent.click(screen.getByTitle('Создать файл в корне проекта'));
    const input = screen.getByPlaceholderText('Введите имя...');
    fireEvent.change(input, { target: { value: 'main.rs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    // The first confirm only reveals the overwrite warning; nothing is written yet
    await waitFor(() => {
      expect(screen.getByText(/уже существует/)).toBeDefined();
    });
    expect(window.electron.workspaceCreateFile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Перезаписать' }));

    await waitFor(() => {
      expect(window.electron.workspaceCreateFile).toHaveBeenCalledWith(
        '/mock/workspace/main.rs',
        '',
        true
      );
    });
  });

  it('toggles gitignore visibility when clicking eye button', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    const mockNodes: WorkspaceFileNode[] = [
      {
        name: 'target',
        path: '/mock/workspace/target',
        relativePath: 'target',
        isDirectory: true,
        isIgnored: true,
      },
    ];

    (window as unknown as { electron: Record<string, unknown> }).electron = {
      workspaceReadDirectory: vi.fn().mockResolvedValue(mockNodes),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    };

    render(
      <WorkspaceProvider>
        <FileExplorer />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('target')).toBeDefined();
    });

    const toggleBtn = screen.getByTitle('Скрыть файлы из .gitignore');
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.queryByText('target')).toBeNull();
    });
  });
});
