import React from 'react';
import { FolderOpen, Code, FileText, Clock } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Button } from '../ui/button';

export const EmptyEditorView: React.FC = () => {
  const {
    workspacePath,
    openFolderDialog,
    openWorkspaceFileDialog,
    recentWorkspaces,
    openRecentWorkspace,
  } = useWorkspace();

  const isMac = (window?.electron?.platform || 'darwin') === 'darwin';
  const modKey = isMac ? '⌘' : 'Ctrl';

  const formatPath = (path: string) => {
    return path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+)/, '~');
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-background-secondary select-none overflow-y-auto">
      <div className="w-14 h-14 rounded-2xl bg-goose-teal/15 border border-goose-teal/30 flex items-center justify-center text-goose-teal mb-4 shadow-sm flex-shrink-0">
        <Code className="w-7 h-7" />
      </div>

      <h2 className="text-lg font-semibold text-text-primary mb-2">Рабочее пространство Goose</h2>

      <p className="text-xs text-text-secondary max-w-md leading-relaxed mb-6">
        {workspacePath
          ? 'Выберите файл в проводнике слева для просмотра и редактирования в Monaco Editor.'
          : 'Откройте локальный каталог с исходным кодом проекта или файл рабочего пространства, совместимый с Cursor и VS Code.'}
      </p>

      {/* Workspace Action Buttons - only when no workspace is open yet.
          Once a folder/workspace is open, new files are opened from the
          file explorer instead of these dialogs. */}
      {!workspacePath && (
        <div className="flex flex-col gap-2 mb-6 w-72">
          <Button
            onClick={() => void openFolderDialog()}
            className="flex items-center justify-center gap-2 bg-goose-teal hover:bg-goose-teal/90 text-white font-medium text-xs py-2 rounded-lg cursor-pointer shadow-sm"
          >
            <FolderOpen className="w-4 h-4" />
            <span>Открыть папку проекта...</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => void openWorkspaceFileDialog()}
            className="flex items-center justify-center gap-2 bg-background-tertiary hover:bg-background-tertiary/80 text-text-primary border-border-primary text-xs py-2 rounded-lg cursor-pointer"
          >
            <FileText className="w-4 h-4 text-text-secondary" />
            <span>Открыть файл .code-workspace...</span>
          </Button>
        </div>
      )}

      {/* Recent Workspaces List - startup proposal only; hidden once a
          workspace is open (switching projects then happens from the Hub) */}
      {!workspacePath && recentWorkspaces.length > 0 && (
        <div className="w-72 text-left mb-6">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
            <Clock className="w-3 h-3" />
            <span>Недавние проекты</span>
          </div>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
            {recentWorkspaces.slice(0, 5).map((ws) => (
              <div
                key={ws.path}
                onClick={() => void openRecentWorkspace(ws)}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-background-tertiary cursor-pointer transition-colors group"
                title={ws.path}
              >
                <div className="truncate flex-1">
                  <div className="text-xs font-medium text-text-primary group-hover:text-goose-teal transition-colors truncate">
                    {ws.name}
                  </div>
                  <div className="text-[10px] text-text-muted truncate">{formatPath(ws.path)}</div>
                </div>
                {ws.isWorkspaceFile && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-border-primary/50 text-text-secondary font-mono ml-2 flex-shrink-0">
                    workspace
                  </span>
                )}
              </div>
            ))}
          </div>
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
          <span>Принять правки агента</span>
          <kbd className="px-1.5 py-0.5 rounded bg-background-tertiary border border-border-primary font-mono text-[10px] text-text-secondary">
            {modKey} + ↵
          </kbd>
        </div>
        <div className="flex items-center justify-between">
          <span>Отклонить правки агента</span>
          <kbd className="px-1.5 py-0.5 rounded bg-background-tertiary border border-border-primary font-mono text-[10px] text-text-secondary">
            {modKey} + ⌫
          </kbd>
        </div>
      </div>
    </div>
  );
};
