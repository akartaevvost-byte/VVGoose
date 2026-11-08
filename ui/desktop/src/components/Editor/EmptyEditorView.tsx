import React from 'react';
import { FolderOpen, Code, FileText, Clock } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Button } from '../ui/button';
import { cn } from '../../utils';

export interface EmptyEditorViewProps {
  className?: string;
  density?: 'spacious' | 'compact' | 'ultra-compact';
}

export const EmptyEditorView: React.FC<EmptyEditorViewProps> = ({ className, density }) => {
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
    <div
      className={cn(
        'empty-editor-scroll-container w-full h-full overflow-y-auto overflow-x-hidden bg-background-secondary select-none',
        density && `empty-editor-${density}`,
        className
      )}
      data-density={density}
    >
      <div className="empty-editor-inner min-h-full flex flex-col items-center justify-center p-6 my-auto text-center">
        {/* Крупный бейдж (скрывается в сверхкомпактном режиме) */}
        <div
          className="empty-editor-badge w-14 h-14 rounded-2xl bg-goose-teal/15 border border-goose-teal/30 flex items-center justify-center text-goose-teal mb-4 shadow-sm flex-shrink-0 transition-all duration-150"
          aria-hidden="true"
        >
          <Code className="w-7 h-7" aria-hidden="true" />
        </div>

        {/* Заголовок с опциональной инлайновой иконкой */}
        <div className="empty-editor-title-wrap mb-2">
          <Code className="empty-editor-title-inline-icon hidden" aria-hidden="true" />
          <h2 className="empty-editor-title text-base sm:text-lg font-semibold text-text-primary">
            Рабочее пространство Goose
          </h2>
        </div>

        {/* Поясняющий текст (скрывается в сверхкомпактном режиме) */}
        <p className="empty-editor-description text-xs text-text-secondary max-w-md leading-relaxed mb-6">
          {workspacePath
            ? 'Выберите файл в проводнике слева для просмотра и редактирования в Monaco Editor.'
            : 'Откройте локальный каталог с исходным кодом проекта или файл рабочего пространства, совместимый с Cursor и VS Code.'}
        </p>

        {/* Кнопки открытия проекта */}
        {!workspacePath && (
          <div className="empty-editor-actions flex flex-col gap-2 mb-6 w-72">
            <Button
              onClick={() => void openFolderDialog()}
              className="flex items-center justify-center gap-2 bg-goose-teal hover:bg-goose-teal/90 text-white font-medium text-xs py-2 rounded-lg cursor-pointer shadow-sm transition-all duration-150"
            >
              <FolderOpen className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>Открыть папку проекта...</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => void openWorkspaceFileDialog()}
              className="flex items-center justify-center gap-2 bg-background-tertiary hover:bg-background-tertiary/80 text-text-primary border-border-primary text-xs py-2 rounded-lg cursor-pointer transition-all duration-150"
            >
              <FileText className="w-4 h-4 text-text-secondary flex-shrink-0" aria-hidden="true" />
              <span>Открыть файл .code-workspace...</span>
            </Button>
          </div>
        )}

        {/* Список последних проектов */}
        {!workspacePath && recentWorkspaces.length > 0 && (
          <div className="empty-editor-recent w-72 text-left mb-6">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
              <Clock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
              <span>Недавние проекты</span>
            </div>
            <div className="empty-editor-recent-list flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
              {recentWorkspaces.slice(0, 5).map((ws, idx) => (
                <button
                  type="button"
                  key={ws.path}
                  onClick={() => void openRecentWorkspace(ws)}
                  className={cn(
                    'empty-editor-recent-item w-full flex items-center justify-between p-2 rounded-lg hover:bg-background-tertiary cursor-pointer transition-colors group text-left border-0 bg-transparent focus:outline-none focus-visible:ring-1 focus-visible:ring-goose-teal',
                    idx >= 3 && 'empty-editor-recent-item-extra'
                  )}
                  title={ws.path}
                >
                  <div className="truncate flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-primary group-hover:text-goose-teal transition-colors truncate">
                      {ws.name}
                    </div>
                    <div className="empty-editor-recent-path text-[10px] text-text-muted truncate">
                      {formatPath(ws.path)}
                    </div>
                  </div>
                  {ws.isWorkspaceFile && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-border-primary/50 text-text-secondary font-mono ml-2 flex-shrink-0">
                      workspace
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Блок горячих клавиш (скрывается в компактном режиме) */}
        <div className="empty-editor-shortcuts flex flex-col gap-2 pt-6 border-t border-border-primary/60 text-[11px] text-text-muted w-72">
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
    </div>
  );
};
