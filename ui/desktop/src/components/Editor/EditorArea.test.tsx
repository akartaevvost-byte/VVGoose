/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorArea } from './EditorArea';
import { WorkspaceProvider, useWorkspace } from '../../contexts/WorkspaceContext';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, language, onMount }: any) => {
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
  },
  DiffEditor: ({ original, modified, language, onMount }: any) => {
    React.useEffect(() => {
      if (onMount) {
        onMount(
          {
            getModifiedEditor: () => ({
              addCommand: vi.fn(),
            }),
          },
          {
            editor: {
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
  },
}));

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
    } as any;
  });

  it('renders EmptyEditorView when no files are open', () => {
    render(
      <WorkspaceProvider>
        <EditorArea />
      </WorkspaceProvider>
    );

    expect(screen.getByText('Рабочее пространство Goose')).toBeDefined();
    expect(screen.getByText('Открыть папку проекта...')).toBeDefined();
  });

  it('opens files in tabs and displays Monaco editor content', async () => {
    localStorage.setItem('goose_workspace_path', '/mock/workspace');

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
        'fn main() { /* edited */ }'
      );
    });

    // Dirty badge disappears after saving
    await waitFor(() => {
      expect(screen.queryByText('Не сохранено')).toBeNull();
    });
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
        'fn main() {\n    println!("new");\n}\n'
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
});
