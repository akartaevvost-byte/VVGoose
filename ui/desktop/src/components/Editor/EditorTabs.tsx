import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { getFileIcon } from '../FileExplorer/fileIcons';
import { cn } from '../../utils';

export const EditorTabs: React.FC = () => {
  const { openFiles, activeFilePath, setActiveFilePath, setSelectedFile, closeFile } =
    useWorkspace();
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  if (openFiles.length === 0) {
    return null;
  }

  const handleTabClick = (filePath: string) => {
    setActiveFilePath(filePath);
    setSelectedFile(filePath);
  };

  const handleTabAuxClick = (e: React.MouseEvent, filePath: string) => {
    // Middle click to close tab
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      closeFile(filePath);
    }
  };

  return (
    <div
      ref={tabsContainerRef}
      className="no-drag flex items-center h-9 bg-background-secondary/80 border-b border-border-primary px-1 overflow-x-auto no-scrollbar select-none"
    >
      {openFiles.map((tab) => {
        const isActive = tab.path === activeFilePath;
        return (
          <div
            key={tab.path}
            onClick={() => handleTabClick(tab.path)}
            onAuxClick={(e) => handleTabAuxClick(e, tab.path)}
            title={tab.path}
            className={cn(
              'no-drag group relative flex items-center gap-2 h-7 px-3 text-xs rounded-md cursor-pointer transition-colors max-w-[200px]',
              isActive
                ? 'bg-background-tertiary text-text-primary font-medium shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/50'
            )}
          >
            {/* File Icon */}
            <span className="flex-shrink-0 pointer-events-none">{getFileIcon(tab.name)}</span>

            {/* File Name */}
            <span className="truncate flex-1 pointer-events-none">{tab.name}</span>

            {/* Dirty or Close Indicator */}
            <div className="flex items-center justify-center w-5 h-5 ml-1">
              {tab.isDirty ? (
                <span
                  className="w-2 h-2 rounded-full bg-goose-teal group-hover:hidden transition-all"
                  title="Несохранённые изменения"
                />
              ) : null}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  closeFile(tab.path);
                }}
                className={cn(
                  'no-drag flex items-center justify-center w-5 h-5 rounded hover:bg-background-primary/80 text-text-muted hover:text-text-primary transition-all cursor-pointer z-10',
                  tab.isDirty
                    ? 'hidden group-hover:flex'
                    : isActive
                      ? 'flex opacity-75 hover:opacity-100'
                      : 'hidden group-hover:flex opacity-60 hover:opacity-100'
                )}
                title="Закрыть вкладку"
                aria-label={`Закрыть ${tab.name}`}
              >
                <X className="w-3.5 h-3.5 pointer-events-none" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
