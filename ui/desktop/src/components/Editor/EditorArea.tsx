import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { DiffEditor, OnMount, DiffOnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { EditorTabs } from './EditorTabs';
import { EmptyEditorView } from './EmptyEditorView';
import { getLanguageFromFilename } from './languageDetector';
import { Save, Check, X, GitCompare } from 'lucide-react';
import { cn } from '../../utils';

const DIFF_EDITOR_OPTIONS = {
  renderSideBySide: false, // Inline unified diff
  readOnly: true,
  fontSize: 13,
  lineNumbers: 'on' as const,
  minimap: { enabled: true },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  smoothScrolling: true,
  padding: { top: 8, bottom: 8 },
};

const EDITOR_OPTIONS = {
  fontSize: 13,
  lineNumbers: 'on' as const,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'off' as const,
  folding: true,
  foldingHighlight: true,
  showFoldingControls: 'always' as const,
  fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  smoothScrolling: true,
  padding: { top: 8, bottom: 8 },
};

export const EditorArea: React.FC<{ className?: string }> = ({ className }) => {
  const {
    activeFile,
    saveActiveFile,
    updateFileContent,
    openFiles,
    workspacePath,
    pendingDiff,
    acceptPendingDiff,
    rejectPendingDiff,
  } = useWorkspace();

  const [cursorPosition, setCursorPosition] = useState<{ line: number; col: number }>({
    line: 1,
    col: 1,
  });

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Global keydown handler for Cmd+S, Cmd+Enter, and Cmd+Backspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveActiveFile();
      } else if (pendingDiff && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void acceptPendingDiff();
      } else if (
        pendingDiff &&
        (((e.metaKey || e.ctrlKey) && (e.key === 'Backspace' || e.key === 'Delete')) ||
          e.key === 'Escape')
      ) {
        e.preventDefault();
        rejectPendingDiff();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveActiveFile, pendingDiff, acceptPendingDiff, rejectPendingDiff]);

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      // Define custom Goose dark theme
      monaco.editor.defineTheme('goose-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#1c1d22',
          'editor.foreground': '#f0f2f5',
          'editor.lineHighlightBackground': '#24262c55',
          'editor.selectionBackground': '#383c4488',
          'editorCursor.foreground': '#13bbaf',
          'editorLineNumber.foreground': '#5c6370',
          'editorLineNumber.activeForeground': '#a3a8b2',
          'diffEditor.insertedTextBackground': '#13bbaf25',
          'diffEditor.removedTextBackground': '#eb575725',
        },
      });
      monaco.editor.setTheme('goose-dark');

      // Add Monaco Cmd+S / Ctrl+S command
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void saveActiveFile();
      });

      // Track cursor position
      editor.onDidChangeCursorPosition((e) => {
        setCursorPosition({
          line: e.position.lineNumber,
          col: e.position.column,
        });
      });
    },
    [saveActiveFile]
  );

  const handleDiffEditorMount: DiffOnMount = useCallback(
    (diffEditor, monaco) => {
      monaco.editor.setTheme('goose-dark');

      const originalEditor = diffEditor.getOriginalEditor?.();
      const modifiedEditor = diffEditor.getModifiedEditor?.();

      const acceptCmd = () => {
        void acceptPendingDiff();
      };
      const rejectCmd = () => {
        rejectPendingDiff();
      };

      modifiedEditor?.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, acceptCmd);
      modifiedEditor?.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backspace, rejectCmd);
      originalEditor?.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, acceptCmd);
      originalEditor?.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backspace, rejectCmd);
    },
    [acceptPendingDiff, rejectPendingDiff]
  );

  const relativePath = activeFile
    ? workspacePath && activeFile.path.startsWith(workspacePath)
      ? activeFile.path.slice(workspacePath.length).replace(/^[/\\]/, '')
      : activeFile.path
    : '';

  const language = activeFile ? getLanguageFromFilename(activeFile.name) : 'plaintext';

  const isCurrentFileDiff =
    pendingDiff && (!activeFile || pendingDiff.filePath === activeFile.path);

  return (
    <div
      className={cn(
        'flex flex-col h-full w-full bg-background-secondary border border-border-primary rounded-xl overflow-hidden select-none',
        className
      )}
    >
      {/* Tab bar */}
      <EditorTabs />

      {/* Inline Diff Action Bar */}
      {isCurrentFileDiff && pendingDiff && (
        <div
          data-testid="inline-diff-banner"
          className="flex items-center justify-between px-3 py-1.5 bg-background-tertiary border-b border-border-primary select-none animate-in fade-in duration-150"
        >
          <div className="flex items-center gap-2 text-xs">
            <GitCompare className="w-4 h-4 text-goose-teal flex-shrink-0" />
            <span className="font-semibold text-text-primary">Правки агента Goose:</span>
            <span className="font-mono text-emerald-400 font-bold">
              +{pendingDiff.diffStats?.added ?? 0}
            </span>
            <span className="font-mono text-red-400 font-bold">
              -{pendingDiff.diffStats?.deleted ?? 0} строк
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void acceptPendingDiff()}
              className="flex items-center gap-1.5 px-3 py-1 bg-goose-teal hover:bg-goose-teal/90 text-white text-xs font-semibold rounded-md shadow-sm transition-all cursor-pointer"
              title="Принять изменения (Cmd+Enter / Ctrl+Enter)"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Принять (⌘↵)</span>
            </button>
            <button
              type="button"
              onClick={rejectPendingDiff}
              className="flex items-center gap-1.5 px-3 py-1 bg-background-secondary hover:bg-red-500/20 text-text-secondary hover:text-red-400 border border-border-primary hover:border-red-500/50 text-xs rounded-md transition-all cursor-pointer"
              title="Отклонить изменения (Cmd+Backspace / Ctrl+Backspace)"
            >
              <X className="w-3.5 h-3.5" />
              <span>Отклонить (⌘⌫)</span>
            </button>
          </div>
        </div>
      )}

      {/* Editor or Diff Content */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-[#1c1d22]">
        {isCurrentFileDiff && pendingDiff ? (
          <DiffEditor
            key={`diff-${pendingDiff.id}`}
            height="100%"
            language={getLanguageFromFilename(pendingDiff.fileName)}
            original={pendingDiff.originalContent}
            modified={pendingDiff.proposedContent}
            theme="goose-dark"
            onMount={handleDiffEditorMount}
            options={DIFF_EDITOR_OPTIONS}
          />
        ) : activeFile ? (
          <Editor
            key={activeFile.path}
            height="100%"
            language={language}
            value={activeFile.content}
            theme="goose-dark"
            onMount={handleEditorMount}
            onChange={(value) => updateFileContent(activeFile.path, value || '')}
            options={EDITOR_OPTIONS}
          />
        ) : openFiles.length === 0 ? (
          <EmptyEditorView />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-text-muted">
            Выберите открытую вкладку выше
          </div>
        )}
      </div>

      {/* Status Bar */}
      {activeFile && (
        <div className="flex items-center justify-between h-6 px-3 bg-background-secondary border-t border-border-primary text-[11px] text-text-muted select-none">
          <div className="flex items-center gap-3 truncate">
            <span className="truncate max-w-[300px]" title={activeFile.path}>
              {relativePath}
            </span>
            {isCurrentFileDiff ? (
              <span className="flex items-center gap-1 text-goose-teal font-medium">
                <GitCompare className="w-3 h-3" />
                <span>Сравнение изменений агента</span>
              </span>
            ) : activeFile.isDirty ? (
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Не сохранено</span>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {!isCurrentFileDiff && activeFile.isDirty && (
              <button
                type="button"
                onClick={() => void saveActiveFile()}
                className="flex items-center gap-1 text-goose-teal hover:text-goose-teal/80 transition-colors cursor-pointer"
                title="Сохранить файл (⌘S)"
              >
                <Save className="w-3 h-3" />
                <span>Сохранить</span>
              </button>
            )}
            <span>
              Строка {cursorPosition.line}, Колонка {cursorPosition.col}
            </span>
            <span className="uppercase">{language}</span>
            <span>UTF-8</span>
          </div>
        </div>
      )}
    </div>
  );
};
