import React from 'react';
import { FolderOpen, Code } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Button } from '../ui/button';

export const EmptyEditorView: React.FC = () => {
  const { workspacePath, openFolderDialog } = useWorkspace();
  const isMac = (window?.electron?.platform || 'darwin') === 'darwin';
  const modKey = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-background-secondary select-none">
      <div className="w-14 h-14 rounded-2xl bg-goose-teal/15 border border-goose-teal/30 flex items-center justify-center text-goose-teal mb-4 shadow-sm">
        <Code className="w-7 h-7" />
      </div>

      <h2 className="text-lg font-semibold text-text-primary mb-2">Рабочее пространство Goose</h2>

      <p className="text-xs text-text-secondary max-w-md leading-relaxed mb-6">
        {workspacePath
          ? 'Выберите файл в проводнике слева для просмотра и редактирования в Monaco Editor.'
          : 'Откройте локальный каталог с исходным кодом проекта для начала полноценной работы.'}
      </p>

      {!workspacePath && (
        <div className="flex flex-col gap-2 mb-8 w-64">
          <Button
            onClick={() => void openFolderDialog()}
            className="flex items-center justify-center gap-2 bg-goose-teal hover:bg-goose-teal/90 text-white font-medium text-xs py-2 rounded-lg"
          >
            <FolderOpen className="w-4 h-4" />
            <span>Открыть папку проекта...</span>
          </Button>
        </div>
      )}

      {/* Keyboard Shortcuts Hint */}
      <div className="flex flex-col gap-2 pt-6 border-t border-border-primary/60 text-[11px] text-text-muted w-72">
        <div className="flex items-center justify-between">
          <span>Сохранить файл</span>
          <kbd className="px-1.5 py-0.5 rounded bg-background-tertiary border border-border-primary font-mono text-[10px] text-text-secondary">
            {modKey} + S
          </kbd>
        </div>
        <div className="flex items-center justify-between">
          <span>Боковая панель</span>
          <kbd className="px-1.5 py-0.5 rounded bg-background-tertiary border border-border-primary font-mono text-[10px] text-text-secondary">
            {modKey} + B
          </kbd>
        </div>
        <div className="flex items-center justify-between">
          <span>Контекст в диалог</span>
          <span className="text-[10px] text-text-secondary">Drag & Drop в чат</span>
        </div>
      </div>
    </div>
  );
};
