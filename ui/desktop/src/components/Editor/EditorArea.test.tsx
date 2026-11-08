/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorArea, relativeToWorkspacePath } from './EditorArea';
import { WorkspaceProvider, useWorkspace } from '../../contexts/WorkspaceContext';

const TestWorkspaceSetup: React.FC<{ root: string; extraFolders?: string[] }> = ({
  root,
  extraFolders = [],
}) => {
  const { workspacePath, workspaceFolders, setWorkspacePath, addWorkspaceFolder } = useWorkspace();
  const queueRef = React.useRef<string[]>(extraFolders.slice());

  React.useEffect(() => {
    if (!workspacePath) {
      setWorkspacePath(root);
      return;
    }
    const next = queueRef.current[0];
    if (next && !workspaceFolders.some((f) => f.path === next)) {
      queueRef.current.shift();
      addWorkspaceFolder(next);
    }
  }, [workspacePath, workspaceFolders, setWorkspacePath, addWorkspaceFolder, root]);

  return null;
};

vi.mock('@monaco-editor/react', () => {
  const MockEditor = ({
    value,
    onChange,
    language,
    onMount,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    language?: string;
    onMount?: (editor: unknown, monaco: unknown) => void;
  }) => {
    React.useEffect(() => {
      if (onMount) {
        onMount(
          {
            addCommand: vi.fn(),
            onDidChangeCursorPosition: vi.fn(),
          },
          {
            editor: {
              defineTheme: vi.fn(),
              setTheme: vi.fn(),
            },
            KeyMod: { CtrlCmd: 2048 },
            KeyCode: { KeyS: 49 },
          }
        );
      }
    }, [onMount]);

    return (
      <div data-testid="monaco-editor" data-language={language}>
        <textarea
          data-testid="monaco-textarea"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
    );
  };

  const MockDiffEditor = ({
    original,
    modified,
    language,
    onMount,
  }: {
    original?: string;
    modified?: string;
    language?: string;
    onMount?: (editor: unknown, monaco: unknown) => void;
  }) => {
    React.useEffect(() => {
      if (onMount) {
        onMount(
          {
            getOriginalEditor: () => ({
              addCommand: vi.fn(),
            }),
            getModifiedEditor: () => ({
              addCommand: vi.fn(),
            }),
          },
          {
            editor: {
              defineTheme: vi.fn(),
              setTheme: vi.fn(),
            },
            KeyMod: { CtrlCmd: 2048 },
            KeyCode: { Enter: 3, Backspace: 1 },
          }
        );
      }
    }, [onMount]);

    return (
      <div data-testid="monaco-diff-editor" data-language={language}>
        <div data-testid="diff-original">{original}</div>
        <div data-testid="diff-modified">{modified}</div>
      </div>
    );
  };

  return {
    default: MockEditor,
    DiffEditor: MockDiffEditor,
    loader: { config: vi.fn(), init: vi.fn() },
  };
});

// Helper component to trigger openFile and proposeDiff
const TestFileOpener: React.FC<{
  filesToOpen?: Array<{ path: string }>;
  proposeDiffOnMount?: {
    id: string;
    filePath: string;
    fileName: string;
    originalContent: string;
    proposedContent: string;
  };
}> = ({ filesToOpen = [], proposeDiffOnMount }) => {
  const { openFile, proposeDiff } = useWorkspace();

  React.useEffect(() => {
    if (proposeDiffOnMount) {
      void proposeDiff(proposeDiffOnMount);
    }
  }, [proposeDiff, proposeDiffOnMount]);

  return (
    <div>
      {filesToOpen.map((f) => (
        <button
          key={f.path}
          onClick={() => void openFile(f.path)}
          data-testid={`open-btn-${f.path}`}
        >
          Open {f.path}
        </button>
      ))}
      <button
        data-testid="trigger-diff-btn"
        onClick={() => {
          void proposeDiff({
            id: 'diff-1',
            filePath: '/mock/workspace/src/main.rs',
            fileName: 'main.rs',
            originalContent: 'fn main() {\n    println!("old");\n}\n',
            proposedContent: 'fn main() {\n    println!("new");\n}\n',
          });
        }}
      >
        Trigger Diff
      </button>
    </div>
  );
};

describe('EditorArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Mock window.electron
    window.electron = {
      ...window.electron,
      workspaceReadFile: vi.fn().mockImplementation((path: string) => {
        if (path === '/mock/workspace/src/main.rs') {
          return Promise.resolve({
            found: true,
            filePath: path,
            content: 'fn main() {\n    println!("Hello, Goose!");\n}\n',
            error: null,
          });
        }
        if (path === '/mock/workspace/README.md') {
          return Promise.resolve({
            found: true,
            filePath: path,
            content: '# Project README\nDocumentation here.\n',
            error: null,
          });
        }
        if (path === '/mock/workspace/docs/guide.md') {
          return Promise.resolve({
            found: true,
            filePath: path,
            content: '# Guide\n\n```rust\nfn main() {}\n```\n',
            error: null,
          });
        }
        if (path === '/mock/frontend/src/App.tsx') {
          return Promise.resolve({
            found: true,
            filePath: path,
            content: 'export const App = () => <div>App</div>;\n',
            error: null,
          });
        }
        if (path === '/mock/backend/src/index.ts') {
          return Promise.resolve({
            found: true,
            filePath: path,
            content: 'console.log("backend");\n',
            error: null,
          });
        }
        return Promise.resolve({
          found: false,
          filePath: path,
          content: '',
          error: 'File not found',
        });
      }),
      workspaceCreateFile: vi.fn().mockResolvedValue({ success: true }),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as typeof window.electron;
  });

  it('renders EmptyEditorView when no files are open', () => {
    localStorage.setItem(
      'goose_recent_workspaces',
      JSON.stringify([
        { path: '/projects/alpha', name: 'alpha', isWorkspaceFile: false },
        { path: '/projects/beta.code-workspace', name: 'beta', isWorkspaceFile: true },
      ])
    );
    render(
      <WorkspaceProvider>
        <EditorArea />
      </WorkspaceProvider>
    );

    expect(screen.getByText('Рабочее пространство Goose')).toBeDefined();
    expect(screen.getByText('Открыть папку проекта...')).toBeDefined();
    expect(screen.getByText('Недавние проекты')).toBeDefined();
    expect(screen.getByText('alpha')).toBeDefined();
  });

  it('hides workspace open buttons in EmptyEditorView when a workspace is already open', async () => {
    localStorage.setItem(
      'goose_recent_workspaces',
      JSON.stringify([{ path: '/projects/alpha', name: 'alpha', isWorkspaceFile: false }])
    );
    render(
      <WorkspaceProvider>
        <TestWorkspaceSetup root="/mock/workspace" />
        <EditorArea />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Открыть папку проекта...')).toBeNull();
    });
    expect(screen.queryByText('Открыть файл .code-workspace...')).toBeNull();
    expect(screen.queryByText('Недавние проекты')).toBeNull();
    expect(screen.getByText('Рабочее пространство Goose')).toBeDefined();
  });

  it('opens files in tabs and displays Monaco editor content', async () => {
    render(
      <WorkspaceProvider>
        <TestFileOpener
          filesToOpen={[
            { path: '/mock/workspace/src/main.rs' },
            { path: '/mock/workspace/README.md' },
          ]}
        />
        <EditorArea />
      </WorkspaceProvider>
    );

    // Open first file
    fireEvent.click(screen.getByTestId('open-btn-/mock/workspace/src/main.rs'));

    await waitFor(() => {
      expect(screen.getByText('main.rs')).toBeDefined();
    });

    // Verify Monaco editor is rendered with rust content
    const editor = screen.getByTestId('monaco-editor');
    expect(editor.getAttribute('data-language')).toBe('rust');
    expect(screen.getByDisplayValue(/Hello, Goose!/)).toBeDefined();

    // Open second file
    fireEvent.click(screen.getByTestId('open-btn-/mock/workspace/README.md'));

    await waitFor(() => {
      expect(screen.getAllByText('README.md').length).toBeGreaterThanOrEqual(1);
    });

    // Now active file is README.md
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor').getAttribute('data-language')).toBe('markdown');
    });
    expect(screen.getByDisplayValue(/Project README/)).toBeDefined();

    // Clicking back on main.rs tab switches active file
    fireEvent.click(screen.getAllByText('main.rs')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor').getAttribute('data-language')).toBe('rust');
    });
  });

  it('tracks dirty state on edit and saves file on Cmd+S or Save click', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    render(
      <WorkspaceProvider>
        <TestFileOpener filesToOpen={[{ path: '/mock/workspace/src/main.rs' }]} />
        <EditorArea />
      </WorkspaceProvider>
    );

    fireEvent.click(screen.getByTestId('open-btn-/mock/workspace/src/main.rs'));

    await waitFor(() => {
      expect(screen.getByText('main.rs')).toBeDefined();
    });

    const textarea = screen.getByTestId('monaco-textarea');

    // Make an edit
    fireEvent.change(textarea, { target: { value: 'fn main() { /* edited */ }' } });

    // Should show dirty indicator badge
    await waitFor(() => {
      expect(screen.getByText('Не сохранено')).toBeDefined();
    });

    // Click "Сохранить" button in status bar
    const saveBtn = screen.getByRole('button', { name: /Сохранить/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(window.electron.workspaceCreateFile).toHaveBeenCalledWith(
        '/mock/workspace/src/main.rs',
        'fn main() { /* edited */ }',
        true
      );
    });

    // Dirty badge disappears after saving
    await waitFor(() => {
      expect(screen.queryByText('Не сохранено')).toBeNull();
    });
  });

  it('toggles between rendered preview and source for markdown files', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    render(
      <WorkspaceProvider>
        <TestFileOpener filesToOpen={[{ path: '/mock/workspace/README.md' }]} />
        <EditorArea />
      </WorkspaceProvider>
    );

    fireEvent.click(screen.getByTestId('open-btn-/mock/workspace/README.md'));

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor').getAttribute('data-language')).toBe('markdown');
    });

    // Source mode first, toggle offers preview
    const toggle = screen.getByTestId('markdown-preview-toggle');
    expect(toggle.textContent).toContain('Предпросмотр');

    fireEvent.click(toggle);

    // Monaco is replaced by the rendered markdown
    await waitFor(() => {
      expect(screen.queryByTestId('monaco-editor')).toBeNull();
    });
    expect(screen.getByTestId('markdown-preview')).toBeDefined();
    expect(screen.getByRole('heading', { level: 1, name: 'Project README' })).toBeDefined();
    expect(screen.getByText('Documentation here.')).toBeDefined();

    // Toggle offers going back to source
    expect(toggle.textContent).toContain('Код');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeDefined();
    });
    expect(screen.queryByTestId('markdown-preview')).toBeNull();
    expect(screen.getByDisplayValue(/Project README/)).toBeDefined();
  });

  it('renders code blocks in the terminal font inside a panel', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    render(
      <WorkspaceProvider>
        <TestFileOpener filesToOpen={[{ path: '/mock/workspace/docs/guide.md' }]} />
        <EditorArea />
      </WorkspaceProvider>
    );

    fireEvent.click(screen.getByTestId('open-btn-/mock/workspace/docs/guide.md'));

    const toggle = await waitFor(() => {
      const btn = screen.getByTestId('markdown-preview-toggle');
      expect(btn).toBeDefined();
      return btn;
    });
    fireEvent.click(toggle);

    const panel = await waitFor(() => {
      const el = screen.getByTestId('markdown-code-block');
      expect(el).toBeDefined();
      return el;
    });

    const code = panel.querySelector('code');
    expect(code).not.toBeNull();
    expect(code?.style.fontFamily).toContain('SF Mono');
    expect(code?.textContent).toContain('fn main() {}');
  });

  it('hides the markdown toggle for non-markdown files', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    render(
      <WorkspaceProvider>
        <TestFileOpener filesToOpen={[{ path: '/mock/workspace/src/main.rs' }]} />
        <EditorArea />
      </WorkspaceProvider>
    );

    fireEvent.click(screen.getByTestId('open-btn-/mock/workspace/src/main.rs'));

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor').getAttribute('data-language')).toBe('rust');
    });

    expect(screen.queryByTestId('markdown-preview-toggle')).toBeNull();
  });

  it('closes a tab when close button is clicked', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    render(
      <WorkspaceProvider>
        <TestFileOpener filesToOpen={[{ path: '/mock/workspace/src/main.rs' }]} />
        <EditorArea />
      </WorkspaceProvider>
    );

    fireEvent.click(screen.getByTestId('open-btn-/mock/workspace/src/main.rs'));

    await waitFor(() => {
      expect(screen.getByText('main.rs')).toBeDefined();
    });

    const closeBtn = screen.getByTitle('Закрыть вкладку');
    fireEvent.click(closeBtn);

    // Tab should be closed and EmptyEditorView displayed again
    await waitFor(() => {
      expect(screen.queryByText('main.rs')).toBeNull();
      expect(screen.getByText('Рабочее пространство Goose')).toBeDefined();
    });
  });

  it('displays inline diff banner and accepts proposed agent edits', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    render(
      <WorkspaceProvider>
        <TestFileOpener />
        <EditorArea />
      </WorkspaceProvider>
    );

    // Trigger proposed diff
    fireEvent.click(screen.getByTestId('trigger-diff-btn'));

    // Check inline diff banner is visible
    await waitFor(() => {
      expect(screen.getByTestId('inline-diff-banner')).toBeDefined();
      expect(screen.getByText('Правки агента Goose:')).toBeDefined();
    });

    // Diff editor is rendered with proposed contents
    expect(screen.getByTestId('monaco-diff-editor')).toBeDefined();
    expect(screen.getByTestId('diff-original').textContent).toContain('println!("old")');
    expect(screen.getByTestId('diff-modified').textContent).toContain('println!("new")');

    // Click "Принять (⌘↵)"
    const acceptBtn = screen.getByRole('button', { name: /Принять/ });
    fireEvent.click(acceptBtn);

    // Should save proposed content to disk and clear diff
    await waitFor(() => {
      expect(window.electron.workspaceCreateFile).toHaveBeenCalledWith(
        '/mock/workspace/src/main.rs',
        'fn main() {\n    println!("new");\n}\n',
        true
      );
      expect(screen.queryByTestId('inline-diff-banner')).toBeNull();
    });
  });

  it('discards proposed agent edits when "Отклонить" is clicked', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    render(
      <WorkspaceProvider>
        <TestFileOpener />
        <EditorArea />
      </WorkspaceProvider>
    );

    // Trigger proposed diff
    fireEvent.click(screen.getByTestId('trigger-diff-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('inline-diff-banner')).toBeDefined();
    });

    // Click "Отклонить (⌘⌫)"
    const rejectBtn = screen.getByRole('button', { name: /Отклонить/ });
    fireEvent.click(rejectBtn);

    // Diff banner dismissed, workspaceCreateFile was NOT called
    await waitFor(() => {
      expect(screen.queryByTestId('inline-diff-banner')).toBeNull();
      expect(window.electron.workspaceCreateFile).not.toHaveBeenCalled();
    });
  });

  it('rejects on Escape only while focus is inside the editor area', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    render(
      <WorkspaceProvider>
        <TestFileOpener />
        <EditorArea />
      </WorkspaceProvider>
    );

    fireEvent.click(screen.getByTestId('trigger-diff-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('inline-diff-banner')).toBeDefined();
    });

    // Focus is on <body> (e.g. a modal or chat input owns it): Escape must
    // not decide the agent's edit
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('inline-diff-banner')).toBeDefined();

    // Focus moves into the editor area: Escape now rejects
    screen.getByRole('button', { name: /Принять/ }).focus();
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('inline-diff-banner')).toBeNull();
    });
    expect(window.electron.workspaceCreateFile).not.toHaveBeenCalled();
  });

  it('closes the active tab on Cmd+W when focus is in the editor', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

    render(
      <WorkspaceProvider>
        <TestFileOpener filesToOpen={[{ path: '/mock/workspace/src/main.rs' }]} />
        <EditorArea />
      </WorkspaceProvider>
    );

    fireEvent.click(screen.getByTestId('open-btn-/mock/workspace/src/main.rs'));

    await waitFor(() => {
      expect(screen.getByText('main.rs')).toBeDefined();
    });

    const textarea = screen.getByTestId('monaco-textarea');
    textarea.focus();

    fireEvent.keyDown(window, { key: 'w', metaKey: true });

    await waitFor(() => {
      expect(screen.queryByText('main.rs')).toBeNull();
      expect(screen.getByText('Рабочее пространство Goose')).toBeDefined();
    });
  });

  it('displays multi-root folder prefix in status bar and full path in title tooltip', async () => {
    render(
      <WorkspaceProvider>
        <TestWorkspaceSetup root="/mock/backend" extraFolders={['/mock/frontend']} />
        <TestFileOpener
          filesToOpen={[
            { path: '/mock/frontend/src/App.tsx' },
            { path: '/mock/backend/src/index.ts' },
          ]}
        />
        <EditorArea />
      </WorkspaceProvider>
    );

    // Open file from the second workspace folder
    fireEvent.click(screen.getByTestId('open-btn-/mock/frontend/src/App.tsx'));

    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeDefined();
    });

    const statusSpan = screen.getByText('[frontend] src/App.tsx');
    expect(statusSpan.getAttribute('title')).toBe('/mock/frontend/src/App.tsx');

    // Open file from the first workspace folder
    fireEvent.click(screen.getByTestId('open-btn-/mock/backend/src/index.ts'));

    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeDefined();
    });

    const backendStatusSpan = screen.getByText('[backend] src/index.ts');
    expect(backendStatusSpan.getAttribute('title')).toBe('/mock/backend/src/index.ts');
  });
});

describe('relativeToWorkspacePath', () => {
  it('handles single-folder workspace relative to workspacePath', () => {
    expect(relativeToWorkspacePath('/mock/workspace/src/main.rs', '/mock/workspace')).toBe(
      'src/main.rs'
    );
    expect(relativeToWorkspacePath('/mock/workspace', '/mock/workspace')).toBe('');
    expect(relativeToWorkspacePath('/other/path/file.txt', '/mock/workspace')).toBe(
      '/other/path/file.txt'
    );
    expect(relativeToWorkspacePath('/mock/workspace/file.txt', '')).toBe(
      '/mock/workspace/file.txt'
    );
  });

  it('preserves single-folder behavior when workspaceFolders has 1 folder', () => {
    const singleFolder = [{ path: '/mock/workspace', name: 'workspace' }];
    expect(
      relativeToWorkspacePath('/mock/workspace/src/main.rs', '/mock/workspace', singleFolder)
    ).toBe('src/main.rs');
  });

  it('formats paths with [folder.name] for multi-root workspaces', () => {
    const folders = [
      { path: '/repo/backend', name: 'backend' },
      { path: '/repo/frontend', name: 'frontend' },
    ];

    expect(relativeToWorkspacePath('/repo/backend/src/index.ts', '/repo/backend', folders)).toBe(
      '[backend] src/index.ts'
    );
    expect(relativeToWorkspacePath('/repo/frontend/package.json', '/repo/backend', folders)).toBe(
      '[frontend] package.json'
    );
  });

  it('returns folder.name when path points directly to root of a multi-root folder', () => {
    const folders = [
      { path: '/repo/backend', name: 'backend' },
      { path: '/repo/frontend', name: 'frontend' },
    ];

    expect(relativeToWorkspacePath('/repo/backend', '/repo/backend', folders)).toBe('backend');
    expect(relativeToWorkspacePath('/repo/frontend/', '/repo/backend', folders)).toBe('frontend');
  });

  it('returns full filePath when file is outside any multi-root folder', () => {
    const folders = [
      { path: '/repo/backend', name: 'backend' },
      { path: '/repo/frontend', name: 'frontend' },
    ];

    expect(relativeToWorkspacePath('/outside/file.txt', '/repo/backend', folders)).toBe(
      '/outside/file.txt'
    );
  });

  it('respects nested folders by matching the most specific root first', () => {
    const folders = [
      { path: '/repo', name: 'root' },
      { path: '/repo/packages/core', name: 'core' },
    ];

    expect(relativeToWorkspacePath('/repo/packages/core/src/index.ts', '/repo', folders)).toBe(
      '[core] src/index.ts'
    );
    expect(relativeToWorkspacePath('/repo/README.md', '/repo', folders)).toBe('[root] README.md');
  });

  it('supports Windows backslash paths in multi-root workspaces', () => {
    const folders = [
      { path: 'C:\\work\\backend', name: 'backend' },
      { path: 'C:\\work\\frontend', name: 'frontend' },
    ];

    expect(
      relativeToWorkspacePath('C:\\work\\frontend\\src\\App.tsx', 'C:\\work\\backend', folders)
    ).toBe('[frontend] src\\App.tsx');
  });
});
