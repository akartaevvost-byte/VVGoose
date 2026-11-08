/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyEditorView } from './EmptyEditorView';
import { WorkspaceProvider, useWorkspace } from '../../contexts/WorkspaceContext';

const TestWorkspaceSetter: React.FC<{ path: string }> = ({ path }) => {
  const { setWorkspacePath } = useWorkspace();
  React.useEffect(() => {
    setWorkspacePath(path);
  }, [path, setWorkspacePath]);
  return null;
};

describe('EmptyEditorView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    window.electron = {
      ...window.electron,
      selectFileOrDirectory: vi.fn().mockResolvedValue('/mock/selected-folder'),
      workspaceReadDirectory: vi.fn().mockResolvedValue([]),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
      setSetting: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as typeof window.electron;
  });

  it('renders all empty state elements in standard spacious mode when no workspace is open', () => {
    localStorage.setItem(
      'goose_recent_workspaces',
      JSON.stringify([
        { path: '/Users/test/projects/alpha', name: 'alpha', isWorkspaceFile: false },
        { path: '/Users/test/projects/beta.code-workspace', name: 'beta', isWorkspaceFile: true },
      ])
    );

    const { container } = render(
      <WorkspaceProvider>
        <EmptyEditorView />
      </WorkspaceProvider>
    );

    // Decorative badge
    const badge = container.querySelector('.empty-editor-badge');
    expect(badge).toBeInTheDocument();
    expect(badge?.getAttribute('aria-hidden')).toBe('true');

    // Title and inline icon
    expect(screen.getByText('Рабочее пространство Goose')).toBeInTheDocument();
    const inlineIcon = container.querySelector('.empty-editor-title-inline-icon');
    expect(inlineIcon).toBeInTheDocument();
    expect(inlineIcon?.getAttribute('aria-hidden')).toBe('true');

    // Description for unset workspace
    expect(
      screen.getByText(
        'Откройте локальный каталог с исходным кодом проекта или файл рабочего пространства, совместимый с Cursor и VS Code.'
      )
    ).toBeInTheDocument();

    // Primary action buttons
    expect(screen.getByText('Открыть папку проекта...')).toBeInTheDocument();
    expect(screen.getByText('Открыть файл .code-workspace...')).toBeInTheDocument();

    // Recent workspaces block
    expect(screen.getByText('Недавние проекты')).toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.getByText('workspace')).toBeInTheDocument();

    // Shortcuts section
    const shortcuts = container.querySelector('.empty-editor-shortcuts');
    expect(shortcuts).toBeInTheDocument();
    expect(screen.getByText('Сохранить файл')).toBeInTheDocument();
    expect(screen.getByText('Боковая панель')).toBeInTheDocument();
  });

  it('applies safe centering classes to prevent flexbox centering scroll bug', () => {
    const { container } = render(
      <WorkspaceProvider>
        <EmptyEditorView />
      </WorkspaceProvider>
    );

    // Outer scroll container must have overflow-y-auto and overflow-x-hidden
    const scrollContainer = container.querySelector('.empty-editor-scroll-container');
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer?.classList.contains('w-full')).toBe(true);
    expect(scrollContainer?.classList.contains('h-full')).toBe(true);
    expect(scrollContainer?.classList.contains('overflow-y-auto')).toBe(true);
    expect(scrollContainer?.classList.contains('overflow-x-hidden')).toBe(true);

    // Inner flex container must have min-h-full and my-auto for safe centering
    const inner = container.querySelector('.empty-editor-inner');
    expect(inner).toBeInTheDocument();
    expect(inner?.classList.contains('min-h-full')).toBe(true);
    expect(inner?.classList.contains('my-auto')).toBe(true);
    expect(inner?.classList.contains('flex')).toBe(true);
    expect(inner?.classList.contains('flex-col')).toBe(true);
    expect(inner?.classList.contains('items-center')).toBe(true);
    expect(inner?.classList.contains('justify-center')).toBe(true);
  });

  it('hides action buttons and recent workspaces when workspacePath is set', async () => {
    localStorage.setItem(
      'goose_recent_workspaces',
      JSON.stringify([{ path: '/projects/alpha', name: 'alpha', isWorkspaceFile: false }])
    );

    render(
      <WorkspaceProvider>
        <TestWorkspaceSetter path="/mock/workspace" />
        <EmptyEditorView />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          'Выберите файл в проводнике слева для просмотра и редактирования в Monaco Editor.'
        )
      ).toBeInTheDocument();
    });

    expect(screen.queryByText('Открыть папку проекта...')).toBeNull();
    expect(screen.queryByText('Открыть файл .code-workspace...')).toBeNull();
    expect(screen.queryByText('Недавние проекты')).toBeNull();
  });

  it('handles empty recentWorkspaces gracefully without rendering the recent projects section', () => {
    render(
      <WorkspaceProvider>
        <EmptyEditorView />
      </WorkspaceProvider>
    );

    expect(screen.queryByText('Недавние проекты')).toBeNull();
    expect(screen.getByText('Открыть папку проекта...')).toBeInTheDocument();
  });

  it('marks recent workspaces with index >= 3 with empty-editor-recent-item-extra for compact truncation', () => {
    const mockWorkspaces = [
      { path: '/Users/test/p1', name: 'Project 1', isWorkspaceFile: false },
      { path: '/Users/test/p2', name: 'Project 2', isWorkspaceFile: false },
      { path: '/Users/test/p3', name: 'Project 3', isWorkspaceFile: false },
      { path: '/Users/test/p4', name: 'Project 4', isWorkspaceFile: false },
      { path: '/Users/test/p5', name: 'Project 5', isWorkspaceFile: false },
    ];

    localStorage.setItem('goose_recent_workspaces', JSON.stringify(mockWorkspaces));

    const { container } = render(
      <WorkspaceProvider>
        <EmptyEditorView />
      </WorkspaceProvider>
    );

    const items = container.querySelectorAll('.empty-editor-recent-item');
    expect(items).toHaveLength(5);

    // Items 0, 1, 2 should not have the extra class
    expect(items[0].classList.contains('empty-editor-recent-item-extra')).toBe(false);
    expect(items[1].classList.contains('empty-editor-recent-item-extra')).toBe(false);
    expect(items[2].classList.contains('empty-editor-recent-item-extra')).toBe(false);

    // Items 3 and 4 should have empty-editor-recent-item-extra class to hide in compact mode
    expect(items[3].classList.contains('empty-editor-recent-item-extra')).toBe(true);
    expect(items[4].classList.contains('empty-editor-recent-item-extra')).toBe(true);
  });

  it('supports density prop for explicit compact and ultra-compact mode simulation', () => {
    const { container, rerender } = render(
      <WorkspaceProvider>
        <EmptyEditorView density="compact" />
      </WorkspaceProvider>
    );

    const scrollContainer = container.querySelector('.empty-editor-scroll-container');
    expect(scrollContainer?.getAttribute('data-density')).toBe('compact');
    expect(scrollContainer?.classList.contains('empty-editor-compact')).toBe(true);

    rerender(
      <WorkspaceProvider>
        <EmptyEditorView density="ultra-compact" />
      </WorkspaceProvider>
    );

    expect(scrollContainer?.getAttribute('data-density')).toBe('ultra-compact');
    expect(scrollContainer?.classList.contains('empty-editor-ultra-compact')).toBe(true);
  });

  it('ensures accessibility: semantic buttons and tooltip titles with full path', () => {
    localStorage.setItem(
      'goose_recent_workspaces',
      JSON.stringify([
        { path: '/Users/test/my-project', name: 'my-project', isWorkspaceFile: false },
      ])
    );

    const { container } = render(
      <WorkspaceProvider>
        <EmptyEditorView />
      </WorkspaceProvider>
    );

    // Recent items are semantic <button> elements
    const recentBtn = container.querySelector('.empty-editor-recent-item');
    expect(recentBtn?.tagName.toLowerCase()).toBe('button');
    expect(recentBtn?.getAttribute('type')).toBe('button');
    expect(recentBtn?.getAttribute('title')).toBe('/Users/test/my-project');

    // Path is formatted with ~ in the UI
    expect(screen.getByText('~/my-project')).toBeInTheDocument();
  });

  it('invokes openFolderDialog when clicking "Открыть папку проекта..."', async () => {
    render(
      <WorkspaceProvider>
        <EmptyEditorView />
      </WorkspaceProvider>
    );

    const openFolderBtn = screen.getByText('Открыть папку проекта...');
    fireEvent.click(openFolderBtn);

    await waitFor(() => {
      expect(window.electron.selectFileOrDirectory).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ mode: 'directory' })
      );
    });
  });

  it('invokes openWorkspaceFileDialog when clicking "Открыть файл .code-workspace..."', async () => {
    render(
      <WorkspaceProvider>
        <EmptyEditorView />
      </WorkspaceProvider>
    );

    const openWorkspaceFileBtn = screen.getByText('Открыть файл .code-workspace...');
    fireEvent.click(openWorkspaceFileBtn);

    await waitFor(() => {
      expect(window.electron.selectFileOrDirectory).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ mode: 'file', extensions: ['code-workspace'] })
      );
    });
  });

  it('invokes openRecentWorkspace when clicking a recent workspace item', async () => {
    localStorage.setItem(
      'goose_recent_workspaces',
      JSON.stringify([{ path: '/projects/test-proj', name: 'test-proj', isWorkspaceFile: false }])
    );

    render(
      <WorkspaceProvider>
        <EmptyEditorView />
      </WorkspaceProvider>
    );

    const item = screen.getByText('test-proj');
    fireEvent.click(item);

    await waitFor(() => {
      // openFolder updates working directory and settings
      expect(window.electron.setSetting).toHaveBeenCalled();
    });
  });

  it('uses standard Goose theme tokens for background, borders, and accents', () => {
    const { container } = render(
      <WorkspaceProvider>
        <EmptyEditorView />
      </WorkspaceProvider>
    );

    const scrollContainer = container.querySelector('.empty-editor-scroll-container');
    expect(scrollContainer?.classList.contains('bg-background-secondary')).toBe(true);

    const badge = container.querySelector('.empty-editor-badge');
    expect(badge?.classList.contains('bg-goose-teal/15')).toBe(true);
    expect(badge?.classList.contains('text-goose-teal')).toBe(true);
    expect(badge?.classList.contains('border-goose-teal/30')).toBe(true);

    const title = container.querySelector('.empty-editor-title');
    expect(title?.classList.contains('text-text-primary')).toBe(true);

    const desc = container.querySelector('.empty-editor-description');
    expect(desc?.classList.contains('text-text-secondary')).toBe(true);

    const shortcuts = container.querySelector('.empty-editor-shortcuts');
    expect(shortcuts?.classList.contains('border-border-primary/60')).toBe(true);
    expect(shortcuts?.classList.contains('text-text-muted')).toBe(true);
  });
});
