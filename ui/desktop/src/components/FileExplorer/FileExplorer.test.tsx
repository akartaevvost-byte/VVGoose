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
});
