import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { EditorTabs } from './EditorTabs';
import { EmptyEditorView } from './EmptyEditorView';
import { getLanguageFromFilename } from './languageDetector';
import { Save } from 'lucide-react';
import { cn } from '../../utils';

export const EditorArea: React.FC<{ className?: string }> = ({ className }) => {
  const { activeFile, saveActiveFile, updateFileContent, openFiles, workspacePath } =
    useWorkspace();

  const [cursorPosition, setCursorPosition] = useState<{ line: number; col: number }>({
    line: 1,
    col: 1,
  });

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Global keydown handler for Cmd+S / Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveActiveFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveActiveFile]);

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

  const relativePath = activeFile
    ? workspacePath && activeFile.path.startsWith(workspacePath)
      ? activeFile.path.slice(workspacePath.length).replace(/^[/\\]/, '')
      : activeFile.path
    : '';

  const language = activeFile ? getLanguageFromFilename(activeFile.name) : 'plaintext';

  return (
    <div
      className={cn(
        'flex flex-col h-full w-full bg-background-secondary border border-border-primary rounded-xl overflow-hidden select-none',
        className
      )}
    >
      {/* Tab bar */}
      <EditorTabs />

      {/* Editor Content */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-[#1c1d22]">
        {activeFile ? (
          <Editor
            key={activeFile.path}
            height="100%"
            language={language}
            value={activeFile.content}
            theme="goose-dark"
            onMount={handleEditorMount}
            onChange={(value) => updateFileContent(activeFile.path, value || '')}
            options={{
              fontSize: 13,
              lineNumbers: 'on',
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'off',
              fontFamily:
                'ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              smoothScrolling: true,
              padding: { top: 8, bottom: 8 },
            }}
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
            {activeFile.isDirty && (
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Не сохранено</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {activeFile.isDirty && (
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

