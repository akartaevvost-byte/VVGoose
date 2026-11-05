import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Folder,
  ChevronRight,
  ChevronDown,
  RotateCw,
  FilePlus,
  FolderPlus,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import type { WorkspaceFileNode } from '../../types/fileSystem';
import { FileContextMenu } from './FileContextMenu';
import { getFileIcon } from './fileIcons';
import { cn } from '../../utils';
import { toastError } from '../../toasts';

function joinPaths(parent: string, child: string): string {
  const sep = parent.includes('\\') ? '\\' : '/';
  const cleanParent = parent.endsWith('/') || parent.endsWith('\\') ? parent.slice(0, -1) : parent;
  const cleanChild = child.startsWith('/') || child.startsWith('\\') ? child.slice(1) : child;
  return `${cleanParent}${sep}${cleanChild}`;
}

function getParentDirPath(p: string): string {
  const lastIndex = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return lastIndex > 0 ? p.substring(0, lastIndex) : lastIndex === 0 ? '/' : '.';
}

interface FlatItem {
  node: WorkspaceFileNode;
  level: number;
}

function flattenVisibleTree(
  nodes: WorkspaceFileNode[],
  level: number,
  expandedDirs: Set<string>,
  dirChildren: Map<string, WorkspaceFileNode[]>,
  hideIgnored: boolean
): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of nodes) {
    if (hideIgnored && node.isIgnored) continue;
    result.push({ node, level });
    if (node.isDirectory && expandedDirs.has(node.relativePath)) {
      const children = dirChildren.get(node.relativePath) || [];
      if (children.length > 0) {
        result.push(
          ...flattenVisibleTree(children, level + 1, expandedDirs, dirChildren, hideIgnored)
        );
      }
    }
  }
  return result;
}

interface FileTreeNodeItemProps {
  node: WorkspaceFileNode;
  level: number;
  isExpanded: boolean;
  toggleDir: (relPath: string) => void;
  selectedFile: string | null;
  onSelectFile: (filePath: string) => void;
  onContextMenu: (e: React.MouseEvent, node: WorkspaceFileNode) => void;
}

const FileTreeNodeItem: React.FC<FileTreeNodeItemProps> = ({
  node,
  level,
  isExpanded,
  toggleDir,
  selectedFile,
  onSelectFile,
  onContextMenu,
}) => {
  const isSelected = selectedFile === node.path;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.isDirectory) {
      toggleDir(node.relativePath);
    } else {
      onSelectFile(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.setData('goose/file-path', node.path);
  };

  const paddingLeft = `${level * 14 + 8}px`;

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      draggable={true}
      onDragStart={handleDragStart}
      style={{ paddingLeft }}
      className={cn(
        'flex items-center gap-1.5 py-1 pr-2 text-xs cursor-pointer select-none rounded hover:bg-background-tertiary/70 transition-colors',
        isSelected && 'bg-background-tertiary text-text-primary font-medium',
        node.isIgnored && 'text-text-muted/60 opacity-60'
      )}
      title={node.path}
    >
      {node.isDirectory ? (
        <span className="w-3.5 h-3.5 flex items-center justify-center text-text-secondary">
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
      ) : (
        <span className="w-3.5 h-3.5" />
      )}

      {getFileIcon(node.name, node.isDirectory, isExpanded)}

      <span
        className={cn(
          'truncate flex-1',
          node.gitStatus === 'modified' && 'text-amber-300',
          node.gitStatus === 'untracked' && 'text-emerald-400'
        )}
      >
        {node.name}
      </span>

      {node.gitStatus === 'modified' && (
        <span className="text-[10px] font-bold text-amber-300 ml-1">M</span>
      )}
      {node.gitStatus === 'untracked' && (
        <span className="text-[10px] font-bold text-emerald-400 ml-1">U</span>
      )}
    </div>
  );
};

export const FileExplorer: React.FC = () => {
  const {
    workspacePath,
    selectedFile,
    setSelectedFile,
    openFolderDialog,
    refreshTrigger,
    refreshWorkspace,
    openFile,
    closeFile,
  } = useWorkspace();

  const [rootNodes, setRootNodes] = useState<WorkspaceFileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const expandedDirsRef = useRef<Set<string>>(expandedDirs);
  expandedDirsRef.current = expandedDirs;

  const [dirChildren, setDirChildren] = useState<Map<string, WorkspaceFileNode[]>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hideIgnored, setHideIgnored] = useState<boolean>(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: WorkspaceFileNode;
  } | null>(null);

  // Action Dialog State
  const [actionModal, setActionModal] = useState<{
    type: 'create-file' | 'create-folder' | 'rename' | 'delete';
    targetPath: string;
    targetNode?: WorkspaceFileNode;
    title: string;
    inputValue: string;
    confirmOverwrite?: boolean;
  } | null>(null);

  // Load directory contents
  const loadDirectory = useCallback(
    async (relPath = '') => {
      if (!workspacePath || !window.electron?.workspaceReadDirectory) {
        setRootNodes([]);
        return;
      }

      setIsLoading(true);
      try {
        const nodes = await window.electron.workspaceReadDirectory(workspacePath, relPath);
        if (!relPath) {
          setRootNodes(nodes);
        } else {
          setDirChildren((prev) => {
            const next = new Map(prev);
            next.set(relPath, nodes);
            return next;
          });
        }
      } catch (err) {
        toastError({
          title: 'Ошибка чтения каталога',
          msg: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [workspacePath]
  );

  // Single effect: refresh root and all currently expanded directories on workspace or refresh trigger
  useEffect(() => {
    loadDirectory('');
    expandedDirsRef.current.forEach((dir) => {
      loadDirectory(dir);
    });
  }, [loadDirectory, refreshTrigger]);

  const toggleDir = useCallback(
    (relPath: string) => {
      // State updaters must stay pure (StrictMode runs them twice), so the
      // directory is loaded outside the updater
      if (expandedDirsRef.current.has(relPath)) {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.delete(relPath);
          return next;
        });
      } else {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(relPath);
          return next;
        });
        loadDirectory(relPath);
      }
    },
    [loadDirectory]
  );

  const handleContextMenu = (e: React.MouseEvent, node: WorkspaceFileNode) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
    });
  };

  const handleCreateFile = (targetDir: string) => {
    setActionModal({
      type: 'create-file',
      targetPath: targetDir,
      title: 'Создать новый файл',
      inputValue: '',
    });
  };

  const handleCreateFolder = (targetDir: string) => {
    setActionModal({
      type: 'create-folder',
      targetPath: targetDir,
      title: 'Создать новую папку',
      inputValue: '',
    });
  };

  const handleRename = (node: WorkspaceFileNode) => {
    setActionModal({
      type: 'rename',
      targetPath: node.path,
      targetNode: node,
      title: `Переименовать «${node.name}»`,
      inputValue: node.name,
    });
  };

  const handleDelete = (node: WorkspaceFileNode) => {
    setActionModal({
      type: 'delete',
      targetPath: node.path,
      targetNode: node,
      title: `Удалить «${node.name}»?`,
      inputValue: '',
    });
  };

  const handleSelectFile = useCallback(
    (filePath: string) => {
      setSelectedFile(filePath);
      void openFile(filePath);
    },
    [setSelectedFile, openFile]
  );

  const handleConfirmAction = async () => {
    if (!actionModal) return;
    const { type, targetPath, targetNode, inputValue, confirmOverwrite } = actionModal;
    let keepModalOpen = false;

    try {
      if (type === 'create-file' && inputValue.trim()) {
        const fullPath = joinPaths(targetPath, inputValue.trim());
        if (!confirmOverwrite) {
          const existing = await window.electron.workspaceReadFile(fullPath);
          if (existing?.found) {
            setActionModal((prev) => (prev ? { ...prev, confirmOverwrite: true } : null));
            keepModalOpen = true;
            return;
          }
        }
        const res = await window.electron.workspaceCreateFile(
          fullPath,
          '',
          Boolean(confirmOverwrite)
        );
        if (res && !res.success) {
          toastError({
            title: 'Не удалось создать файл',
            msg: res.error || 'Ошибка записи на диск',
          });
        } else {
          void openFile(fullPath);
        }
      } else if (type === 'create-folder' && inputValue.trim()) {
        const fullPath = joinPaths(targetPath, inputValue.trim());
        const res = await window.electron.workspaceCreateDirectory(fullPath);
        if (res && !res.success) {
          toastError({
            title: 'Не удалось создать папку',
            msg: res.error || 'Ошибка создания папки',
          });
        }
      } else if (type === 'rename' && targetNode && inputValue.trim()) {
        const parentDir = getParentDirPath(targetPath);
        const newPath = joinPaths(parentDir, inputValue.trim());
        const res = await window.electron.workspaceRenamePath(targetPath, newPath);
        if (res && !res.success) {
          toastError({
            title: 'Не удалось переименовать',
            msg: res.error || 'Ошибка переименования',
          });
        } else {
          closeFile(targetPath);
          void openFile(newPath);
        }
      } else if (type === 'delete') {
        const res = await window.electron.workspaceDeletePath(targetPath);
        if (res && !res.success) {
          toastError({
            title: 'Не удалось удалить элемент',
            msg: res.error || 'Ошибка удаления',
          });
        } else {
          closeFile(targetPath);
        }
      }
      refreshWorkspace();
    } catch (err) {
      toastError({
        title: 'Ошибка операции с файлом',
        msg: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (!keepModalOpen) {
        setActionModal(null);
      }
    }
  };

  const flatItems = useMemo(
    () => flattenVisibleTree(rootNodes, 0, expandedDirs, dirChildren, hideIgnored),
    [rootNodes, expandedDirs, dirChildren, hideIgnored]
  );

  const workspaceName = workspacePath ? workspacePath.split(/[/\\]/).filter(Boolean).pop() : null;

  return (
    <div className="flex flex-col h-full overflow-hidden select-none relative">
      {/* Workspace Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary bg-background-secondary/50">
        <div className="flex items-center gap-1.5 truncate">
          <Folder className="w-4 h-4 text-goose-teal flex-shrink-0" />
          <span className="text-xs font-semibold text-text-primary truncate" title={workspacePath}>
            {workspaceName || 'Рабочее пространство'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {workspacePath && (
            <>
              <button
                type="button"
                onClick={() => handleCreateFile(workspacePath)}
                className="p-1 hover:bg-background-tertiary rounded text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                title="Создать файл в корне проекта"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleCreateFolder(workspacePath)}
                className="p-1 hover:bg-background-tertiary rounded text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                title="Создать папку в корне проекта"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setHideIgnored((v) => !v)}
                className="p-1 hover:bg-background-tertiary rounded text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                title={hideIgnored ? 'Показать файлы из .gitignore' : 'Скрыть файлы из .gitignore'}
              >
                {hideIgnored ? (
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          )}
          <button
            onClick={() => refreshWorkspace()}
            className="p-1 hover:bg-background-tertiary rounded text-text-secondary hover:text-text-primary transition-colors"
            title="Обновить дерево файлов"
          >
            <RotateCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>
          <button
            onClick={openFolderDialog}
            className="text-[11px] px-2 py-0.5 bg-background-tertiary hover:bg-border-primary border border-border-primary rounded text-text-primary transition-colors"
          >
            Папка...
          </button>
        </div>
      </div>

      {/* File Tree List */}
      <div className="flex-1 overflow-y-auto px-1 py-1.5 min-h-0">
        {!workspacePath ? (
          <div className="flex flex-col items-center justify-center p-4 text-center h-full">
            <p className="text-xs text-text-muted mb-2.5">Папка проекта не открыта</p>
            <button
              onClick={openFolderDialog}
              className="text-xs px-3 py-1.5 bg-goose-teal text-white rounded font-medium hover:opacity-90 transition-opacity"
            >
              Открыть папку...
            </button>
          </div>
        ) : rootNodes.length === 0 ? (
          <div className="p-3 text-xs text-text-muted text-center italic">
            {isLoading ? 'Загрузка файлов…' : 'В каталоге нет файлов'}
          </div>
        ) : (
          <Virtuoso
            style={{ height: '100%' }}
            totalCount={flatItems.length}
            initialItemCount={flatItems.length}
            itemContent={(index) => {
              const item = flatItems[index];
              if (!item) return null;
              const isExpanded = expandedDirs.has(item.node.relativePath);
              const children = dirChildren.get(item.node.relativePath) || [];
              const isEmptyDir = item.node.isDirectory && isExpanded && children.length === 0;

              return (
                <div key={item.node.path}>
                  <FileTreeNodeItem
                    node={item.node}
                    level={item.level}
                    isExpanded={isExpanded}
                    toggleDir={toggleDir}
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                    onContextMenu={handleContextMenu}
                  />
                  {isEmptyDir && (
                    <div
                      style={{ paddingLeft: `${(item.level + 1) * 14 + 18}px` }}
                      className="py-1 text-[11px] text-text-muted italic"
                    >
                      Пусто
                    </div>
                  )}
                </div>
              );
            }}
          />
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={() => setContextMenu(null)}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}

      {/* Action Dialog Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background-secondary border border-border-primary rounded-xl p-4 w-80 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-semibold text-text-primary mb-3">{actionModal.title}</h3>
            {actionModal.type === 'delete' ? (
              <p className="text-xs text-text-secondary mb-4">
                Это действие безвозвратно удалит выбранный элемент с диска.
              </p>
            ) : actionModal.confirmOverwrite ? (
              <p className="text-xs text-amber-400 mb-4">
                Файл «{actionModal.inputValue.trim()}» уже существует. Его текущее содержимое будет
                удалено безвозвратно. Перезаписать?
              </p>
            ) : (
              <input
                type="text"
                value={actionModal.inputValue}
                onChange={(e) =>
                  setActionModal((prev) => (prev ? { ...prev, inputValue: e.target.value } : null))
                }
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleConfirmAction();
                  if (e.key === 'Escape') setActionModal(null);
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-background-primary border border-border-primary rounded-md text-text-primary outline-none focus:border-goose-teal mb-4"
                placeholder="Введите имя..."
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActionModal(null)}
                className="px-3 py-1 text-xs border border-border-primary rounded-md text-text-secondary hover:bg-background-tertiary transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => void handleConfirmAction()}
                className={cn(
                  'px-3 py-1 text-xs rounded-md font-medium text-white transition-opacity',
                  actionModal.type === 'delete' || actionModal.confirmOverwrite
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-goose-teal hover:opacity-90'
                )}
              >
                {actionModal.type === 'delete'
                  ? 'Удалить'
                  : actionModal.confirmOverwrite
                    ? 'Перезаписать'
                    : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
