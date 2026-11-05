import React, { useEffect, useRef, useContext } from 'react';
import {
  MessageSquarePlus,
  Copy,
  FilePlus,
  FolderPlus,
  Edit2,
  Trash2,
  Code,
  FolderMinus,
} from 'lucide-react';
import type { WorkspaceFileNode } from '../../types/fileSystem';
import { AppEvents } from '../../constants/events';
import { WorkspaceContext } from '../../contexts/WorkspaceContext';

interface FileContextMenuProps {
  x: number;
  y: number;
  node: WorkspaceFileNode;
  isRoot?: boolean;
  isMultiRoot?: boolean;
  onClose: () => void;
  onCreateFile: (targetDir: string) => void;
  onCreateFolder: (targetDir: string) => void;
  onRename: (node: WorkspaceFileNode) => void;
  onDelete: (node: WorkspaceFileNode) => void;
  onRemoveFromWorkspace?: (node: WorkspaceFileNode) => void;
  onOpenFile?: (path: string) => void;
}

export const FileContextMenu: React.FC<FileContextMenuProps> = ({
  x,
  y,
  node,
  isRoot,
  isMultiRoot,
  onClose,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  onRemoveFromWorkspace,
  onOpenFile,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position so it doesn't overflow the viewport
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 260);

  const handleAddToChat = () => {
    window.dispatchEvent(
      new CustomEvent(AppEvents.ATTACH_FILE_TO_CHAT, {
        detail: { path: node.path, name: node.name },
      })
    );
    onClose();
  };

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(node.path);
    } catch {
      // Ignore clipboard error
    }
    onClose();
  };

  const handleCopyRelativePath = async () => {
    try {
      await navigator.clipboard.writeText(node.relativePath);
    } catch {
      // Ignore clipboard error
    }
    onClose();
  };

  const targetDir = node.isDirectory
    ? node.path
    : node.path.substring(0, Math.max(node.path.lastIndexOf('/'), node.path.lastIndexOf('\\'))) ||
      '.';

  const workspace = useContext(WorkspaceContext);
  const isNodeRoot = Boolean(isRoot ?? (node.isDirectory && node.relativePath === ''));
  const canRemoveFromWorkspace = Boolean(
    isMultiRoot ?? ((workspace?.workspaceFolders?.length ?? 0) > 1)
  );

  const handleOpenInEditor = () => {
    if (onOpenFile) {
      onOpenFile(node.path);
    } else if (workspace?.openFile) {
      void workspace.openFile(node.path);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      className="fixed z-50 w-56 bg-background-secondary border border-border-primary rounded-lg shadow-xl py-1 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {!node.isDirectory && (
        <button
          onClick={handleOpenInEditor}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-background-tertiary text-text-primary text-left transition-colors"
        >
          <Code className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="flex-1 truncate">Открыть в редакторе</span>
        </button>
      )}

      <button
        onClick={handleAddToChat}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-background-tertiary text-text-primary text-left transition-colors"
      >
        <MessageSquarePlus className="w-3.5 h-3.5 text-goose-teal flex-shrink-0" />
        <span className="flex-1 truncate">Добавить в контекст диалога</span>
      </button>

      <div className="h-px bg-border-primary my-1" />

      <button
        onClick={handleCopyPath}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-background-tertiary text-text-primary text-left transition-colors"
      >
        <div className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
          <span>Копировать путь</span>
        </div>
      </button>

      <button
        onClick={handleCopyRelativePath}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-background-tertiary text-text-primary text-left transition-colors"
      >
        <div className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
          <span>Копировать относительный путь</span>
        </div>
      </button>

      <div className="h-px bg-border-primary my-1" />

      <button
        onClick={() => {
          onClose();
          onCreateFile(targetDir);
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-background-tertiary text-text-primary text-left transition-colors"
      >
        <FilePlus className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
        <span>Создать файл</span>
      </button>

      <button
        onClick={() => {
          onClose();
          onCreateFolder(targetDir);
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-background-tertiary text-text-primary text-left transition-colors"
      >
        <FolderPlus className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
        <span>Создать папку</span>
      </button>

      {isNodeRoot ? (
        canRemoveFromWorkspace && (
          <>
            <div className="h-px bg-border-primary my-1" />
            <button
              onClick={() => {
                onClose();
                if (onRemoveFromWorkspace) {
                  onRemoveFromWorkspace(node);
                } else {
                  onDelete(node);
                }
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 text-left transition-colors"
            >
              <FolderMinus className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>Убрать папку из рабочей области</span>
            </button>
          </>
        )
      ) : (
        <>
          <div className="h-px bg-border-primary my-1" />

          <button
            onClick={() => {
              onClose();
              onRename(node);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-background-tertiary text-text-primary text-left transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
            <span>Переименовать...</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onDelete(node);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/10 text-red-400 hover:text-red-300 text-left transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <span>Удалить</span>
          </button>
        </>
      )}
    </div>
  );
};
