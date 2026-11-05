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
        isIgnored: false,
      },
      {
        name: 'Cargo.toml',
        path: '/mock/workspace/Cargo.toml',
        relativePath: 'Cargo.toml',
        isDirectory: false,
        gitStatus: 'modified',
        isIgnored: false,
      },
      {
        name: 'README.md',
        path: '/mock/workspace/README.md',
        relativePath: 'README.md',
        isDirectory: false,
        gitStatus: 'untracked',
        isIgnored: false,
      },
    ];

    const mockCratesChildren: WorkspaceFileNode[] = [
      {
        name: 'goose',
        path: '/mock/workspace/crates/goose',
        relativePath: 'crates/goose',
        isDirectory: true,
        isIgnored: false,
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

    // Verify workspace name in header and root node
    await waitFor(() => {
      expect(screen.getAllByText('workspace').length).toBe(2);
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

  it('collapses the root directory when clicking on its tree node', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    const mockRootNodes: WorkspaceFileNode[] = [
      {
        name: 'crates',
        path: '/mock/workspace/crates',
        relativePath: 'crates',
        isDirectory: true,
        isIgnored: false,
      },
    ];

    (window as unknown as { electron: Record<string, unknown> }).electron = {
      workspaceReadDirectory: vi.fn().mockImplementation((_root: string, relPath: string) => {
        if (!relPath) return Promise.resolve(mockRootNodes);
        return Promise.resolve([]);
      }),
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
      expect(screen.getByText('crates')).toBeDefined();
    });

    // The root node in the tree is the second 'workspace' element
    const rootNodes = screen.getAllByText('workspace');
    const treeRootNode = rootNodes[1];
    fireEvent.click(treeRootNode);

    // Collapsing root hides its children
    await waitFor(() => {
      expect(screen.queryByText('crates')).toBeNull();
    });

    // Clicking again expands it
    fireEvent.click(treeRootNode);
    await waitFor(() => {
      expect(screen.getByText('crates')).toBeDefined();
    });
  });

  it('renders multiple root nodes for multi-root workspace', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/multi-root');
    localStorage.setItem(
      'goose_workspace_folders',
      JSON.stringify([
        { path: '/mock/multi-root/backend', name: 'backend' },
        { path: '/mock/multi-root/frontend', name: 'frontend' },
      ])
    );

    (window as unknown as { electron: Record<string, unknown> }).electron = {
      workspaceReadDirectory: vi.fn().mockImplementation((root: string, relPath: string) => {
        if (root.endsWith('backend') && !relPath) {
          return Promise.resolve([
            {
              name: 'server.rs',
              path: '/mock/multi-root/backend/server.rs',
              relativePath: 'server.rs',
              isDirectory: false,
              isIgnored: false,
            },
          ]);
        }
        if (root.endsWith('frontend') && !relPath) {
          return Promise.resolve([
            {
              name: 'App.tsx',
              path: '/mock/multi-root/frontend/App.tsx',
              relativePath: 'App.tsx',
              isDirectory: false,
              isIgnored: false,
            },
          ]);
        }
        return Promise.resolve([]);
      }),
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

    // Both root folders and their children should be visible
    await waitFor(() => {
      expect(screen.getByText('backend')).toBeDefined();
      expect(screen.getByText('server.rs')).toBeDefined();
      expect(screen.getByText('frontend')).toBeDefined();
      expect(screen.getByText('App.tsx')).toBeDefined();
      expect(screen.getByText('2 папок')).toBeDefined();
    });
  });

  it('protects root folder from delete and rename in single-root workspace', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    const mockDeletePath = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as { electron: Record<string, unknown> }).electron = {
      workspaceReadDirectory: vi.fn().mockResolvedValue([]),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
      workspaceDeletePath: mockDeletePath,
      on: vi.fn(),
      off: vi.fn(),
    };

    render(
      <WorkspaceProvider>
        <FileExplorer />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('workspace').length).toBe(2);
    });

    const rootTreeItem = screen.getAllByText('workspace')[1];
    fireEvent.contextMenu(rootTreeItem);

    // Root folder should have create actions, but NOT rename or delete
    await waitFor(() => {
      expect(screen.getByText('Создать файл')).toBeDefined();
      expect(screen.getByText('Создать папку')).toBeDefined();
    });

    expect(screen.queryByText('Переименовать...')).toBeNull();
    expect(screen.queryByText('Удалить')).toBeNull();
    expect(screen.queryByText('Убрать папку из рабочей области')).toBeNull();
    expect(mockDeletePath).not.toHaveBeenCalled();
  });

  it('removes a root folder from multi-root workspace without physical deletion from disk', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/multi-root');
    localStorage.setItem(
      'goose_workspace_folders',
      JSON.stringify([
        { path: '/mock/multi-root/backend', name: 'backend' },
        { path: '/mock/multi-root/frontend', name: 'frontend' },
      ])
    );

    const mockDeletePath = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as { electron: Record<string, unknown> }).electron = {
      workspaceReadDirectory: vi.fn().mockResolvedValue([]),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
      workspaceDeletePath: mockDeletePath,
      on: vi.fn(),
      off: vi.fn(),
    };

    render(
      <WorkspaceProvider>
        <FileExplorer />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('backend')).toBeDefined();
      expect(screen.getByText('frontend')).toBeDefined();
    });

    // Right-click on backend root node
    const backendNode = screen.getByText('backend');
    fireEvent.contextMenu(backendNode);

    // Multi-root context menu should show "Убрать папку из рабочей области", but NOT "Переименовать..." or "Удалить"
    await waitFor(() => {
      expect(screen.getByText('Убрать папку из рабочей области')).toBeDefined();
    });
    expect(screen.queryByText('Переименовать...')).toBeNull();
    expect(screen.queryByText('Удалить')).toBeNull();

    // Click "Убрать папку из рабочей области"
    fireEvent.click(screen.getByText('Убрать папку из рабочей области'));

    // Confirmation modal should open
    await waitFor(() => {
      expect(screen.getByText(/Убрать папку «backend» из рабочей области\?/)).toBeDefined();
      expect(
        screen.getByText(/Папка будет убрана из рабочей области. Файлы на диске останутся без изменений./)
      ).toBeDefined();
    });

    // Confirm removal
    const confirmBtn = screen.getByRole('button', { name: 'Убрать' });
    fireEvent.click(confirmBtn);

    // Verify workspaceDeletePath (fs.rm) is NEVER called!
    expect(mockDeletePath).not.toHaveBeenCalled();

    // Verify backend is removed and frontend remains
    await waitFor(() => {
      expect(screen.queryByText('backend')).toBeNull();
      expect(screen.getAllByText('frontend').length).toBe(2);
    });

    // Verify localStorage workspace folders was updated
    const savedFolders = JSON.parse(localStorage.getItem('goose_workspace_folders') || '[]');
    expect(savedFolders).toEqual([{ path: '/mock/multi-root/frontend', name: 'frontend' }]);
  });
});
