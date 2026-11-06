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
import type { WorkspaceFileNode, WorkspaceFolderInfo } from '../../types/fileSystem';
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
  isRoot?: boolean;
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
    result.push({ node, level, isRoot: false });
    if (node.isDirectory && expandedDirs.has(node.path)) {
      const children = dirChildren.get(node.path) || [];
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
  isRoot?: boolean;
  toggleDir: (node: WorkspaceFileNode) => void;
  selectedFile: string | null;
  onSelectFile: (filePath: string) => void;
  onContextMenu: (e: React.MouseEvent, node: WorkspaceFileNode, isRoot?: boolean) => void;
}

const FileTreeNodeItem: React.FC<FileTreeNodeItemProps> = ({
  node,
  level,
  isExpanded,
  isRoot = false,
  toggleDir,
  selectedFile,
  onSelectFile,
  onContextMenu,
}) => {
  const isSelected = selectedFile === node.path;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.isDirectory) {
      toggleDir(node);
    } else {
      onSelectFile(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node, isRoot);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.setData('goose/file-path', node.path);
  };

  const paddingLeft = `${level * 14 + (isRoot ? 4 : 8)}px`;

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
        isRoot && 'font-semibold text-text-primary hover:bg-background-tertiary',
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

      {isRoot ? (
        <Folder className="w-4 h-4 text-goose-teal flex-shrink-0" />
      ) : (
        getFileIcon(node.name, node.isDirectory, isExpanded)
      )}

      <span
        className={cn(
          'truncate flex-1',
          isRoot && 'text-xs font-semibold text-text-primary',
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
    workspaceFolders,
    workspaceName,
    workspaceKind,
    selectedFile,
    setSelectedFile,
    openFolderDialog,
    openWorkspaceFileDialog,
    refreshTrigger,
    refreshWorkspace,
    openFile,
    closeFile,
    removeWorkspaceFolder,
  } = useWorkspace();

  const effectiveFolders = useMemo<WorkspaceFolderInfo[]>(() => {
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders;
    }
    if (workspacePath) {
      const name = workspacePath.split(/[/\\]/).filter(Boolean).pop() || workspacePath;
      return [{ path: workspacePath, name }];
    }
    return [];
  }, [workspaceFolders, workspacePath]);

  const effectiveFoldersRef = useRef<WorkspaceFolderInfo[]>(effectiveFolders);
  effectiveFoldersRef.current = effectiveFolders;

  const isRootNode = useCallback(
    (node: WorkspaceFileNode): boolean => {
      if (node.isDirectory && node.relativePath === '') {
        return true;
      }
      return effectiveFolders.some((f) => f.path === node.path);
    },
    [effectiveFolders]
  );

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    effectiveFolders.forEach((f) => initial.add(f.path));
    return initial;
  });
  const expandedDirsRef = useRef<Set<string>>(expandedDirs);
  expandedDirsRef.current = expandedDirs;

  const [dirChildren, setDirChildren] = useState<Map<string, WorkspaceFileNode[]>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hideIgnored, setHideIgnored] = useState<boolean>(false);

  // Map to find which folder root and relative path a directory node belongs to
  const nodeLookupRef = useRef<Map<string, { folderRoot: string; relPath: string }>>(new Map());

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: WorkspaceFileNode;
    isRoot?: boolean;
  } | null>(null);

  // Action Dialog State
  const [actionModal, setActionModal] = useState<{
    type: 'create-file' | 'create-folder' | 'rename' | 'delete' | 'remove-folder';
    targetPath: string;
    targetNode?: WorkspaceFileNode;
    title: string;
    inputValue: string;
    confirmOverwrite?: boolean;
  } | null>(null);

  // Ensure all roots are expanded by default when workspace folders change
  useEffect(() => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      effectiveFolders.forEach((f) => {
        if (!prev.has(f.path)) {
          next.add(f.path);
        }
      });
      return next;
    });
  }, [effectiveFolders]);

  // Load directory contents
  const loadDirectory = useCallback(
    async (folderRoot: string, relPath = '', fullDirPath = folderRoot) => {
      if (!window.electron?.workspaceReadDirectory) {
        return;
      }

      setIsLoading(true);
      try {
        const nodes = await window.electron.workspaceReadDirectory(folderRoot, relPath);
        nodes.forEach((n) => {
          if (n.isDirectory) {
            nodeLookupRef.current.set(n.path, { folderRoot, relPath: n.relativePath });
          }
        });
        setDirChildren((prev) => {
          const next = new Map(prev);
          next.set(fullDirPath, nodes);
          return next;
        });
      } catch (err) {
        toastError({
          title: 'Ошибка чтения каталога',
          msg: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const rootsKey = effectiveFolders.map((folder) => folder.path).join('\n');
  const previousRootsKey = useRef(rootsKey);

  useEffect(() => {
    if (previousRootsKey.current === rootsKey) return;
    previousRootsKey.current = rootsKey;
    nodeLookupRef.current = new Map();
    setDirChildren(new Map());
    setExpandedDirs(new Set(effectiveFolders.map((folder) => folder.path)));
  }, [effectiveFolders, rootsKey]);

  // Refresh root folders and all currently expanded directories
  useEffect(() => {
    effectiveFolders.forEach((folder) => {
      void loadDirectory(folder.path, '', folder.path);
    });

    expandedDirsRef.current.forEach((dirPath) => {
      const lookup = nodeLookupRef.current.get(dirPath);
      if (lookup) {
        void loadDirectory(lookup.folderRoot, lookup.relPath, dirPath);
      }
    });
  }, [effectiveFolders, loadDirectory, refreshTrigger]);

  const toggleDir = useCallback(
    (node: WorkspaceFileNode) => {
      if (expandedDirsRef.current.has(node.path)) {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.delete(node.path);
          return next;
        });
      } else {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(node.path);
          return next;
        });

        // If it's a top-level root folder
        const rootFolder = effectiveFoldersRef.current.find((f) => f.path === node.path);
        if (rootFolder) {
          void loadDirectory(rootFolder.path, '', rootFolder.path);
        } else {
          const lookup = nodeLookupRef.current.get(node.path);
          if (lookup) {
            void loadDirectory(lookup.folderRoot, lookup.relPath, node.path);
          } else {
            const folder = effectiveFoldersRef.current.find(
              (f) => node.path.startsWith(f.path + '/') || node.path.startsWith(f.path + '\\')
            );
            if (folder) {
              void loadDirectory(folder.path, node.relativePath, node.path);
            }
          }
        }
      }
    },
    [loadDirectory]
  );

  const handleContextMenu = (e: React.MouseEvent, node: WorkspaceFileNode, isRoot?: boolean) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
      isRoot: Boolean(isRoot || isRootNode(node)),
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
    if (isRootNode(node)) {
      return;
    }
    setActionModal({
      type: 'rename',
      targetPath: node.path,
      targetNode: node,
      title: `Переименовать «${node.name}»`,
      inputValue: node.name,
    });
  };

  const handleDelete = (node: WorkspaceFileNode) => {
    if (isRootNode(node)) {
      if (effectiveFolders.length > 1) {
        setActionModal({
          type: 'remove-folder',
          targetPath: node.path,
          targetNode: node,
          title: `Убрать папку «${node.name}» из рабочей области?`,
          inputValue: '',
        });
      }
      return;
    }

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
        if (isRootNode(targetNode)) {
          return;
        }
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
      } else if (type === 'remove-folder') {
        removeWorkspaceFolder(targetPath);
      } else if (type === 'delete') {
        const isRootTarget = targetNode
          ? isRootNode(targetNode)
          : effectiveFolders.some((f) => f.path === targetPath);
        if (isRootTarget) {
          if (effectiveFolders.length > 1) {
            removeWorkspaceFolder(targetPath);
          }
          return;
        }

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

  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    for (const folder of effectiveFolders) {
      const rootNode: WorkspaceFileNode = {
        name: folder.name,
        path: folder.path,
        relativePath: '',
        isDirectory: true,
        isIgnored: false,
      };
      items.push({ node: rootNode, level: 0, isRoot: true });
      if (expandedDirs.has(folder.path)) {
        const children = dirChildren.get(folder.path) || [];
        items.push(...flattenVisibleTree(children, 1, expandedDirs, dirChildren, hideIgnored));
      }
    }
    return items;
  }, [effectiveFolders, expandedDirs, dirChildren, hideIgnored]);

  const workspaceTitle = useMemo(() => {
    if (workspaceKind === 'code-workspace' && workspaceName) return workspaceName;
    if (effectiveFolders.length === 0) return 'Рабочее пространство';
    if (effectiveFolders.length === 1) return effectiveFolders[0].name;
    if (workspaceKind === 'untitled') return `${effectiveFolders.length} папок`;
    return workspaceName || effectiveFolders[0].name;
  }, [effectiveFolders, workspaceKind, workspaceName]);

  const primaryRootPath = effectiveFolders[0]?.path || '';

  return (
    <div className="flex flex-col h-full overflow-hidden select-none relative">
      {/* Workspace Header */}
      <div className="no-drag flex items-center justify-between px-3 py-2 border-b border-border-primary bg-background-secondary/50">
        <div className="flex items-center gap-1.5 truncate">
          <Folder className="w-4 h-4 text-goose-teal flex-shrink-0" />
          <span
            className="text-xs font-semibold text-text-primary truncate"
            title={primaryRootPath}
          >
            {workspaceTitle}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {primaryRootPath && (
            <>
              <button
                type="button"
                onClick={() => handleCreateFile(primaryRootPath)}
                className="p-1 hover:bg-background-tertiary rounded text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                title="Создать файл в корне проекта"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleCreateFolder(primaryRootPath)}
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
        </div>
      </div>

      {/* File Tree List */}
      <div className="flex-1 overflow-y-auto px-1 py-1.5 min-h-0">
        {effectiveFolders.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-4 text-center h-full gap-3">
            <p className="text-xs text-text-muted">Папка проекта не открыта</p>
            <div className="flex flex-col gap-2 w-full max-w-[200px]">
              <button
                onClick={openFolderDialog}
                className="text-xs px-3 py-1.5 bg-goose-teal text-white rounded font-medium hover:opacity-90 transition-opacity"
              >
                Открыть папку...
              </button>
              <button
                onClick={openWorkspaceFileDialog}
                className="text-xs px-3 py-1.5 bg-background-tertiary hover:bg-border-primary border border-border-primary rounded text-text-primary transition-colors font-medium"
              >
                Открыть .code-workspace...
              </button>
            </div>
          </div>
        ) : flatItems.length === 0 ? (
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
              const isExpanded = expandedDirs.has(item.node.path);
              const children = dirChildren.get(item.node.path) || [];
              const isEmptyDir =
                item.node.isDirectory && isExpanded && children.length === 0 && !isLoading;

              return (
                <div key={item.node.path}>
                  <FileTreeNodeItem
                    node={item.node}
                    level={item.level}
                    isExpanded={isExpanded}
                    isRoot={item.isRoot}
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
          isRoot={Boolean(contextMenu.isRoot)}
          isMultiRoot={effectiveFolders.length > 1}
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
            {actionModal.type === 'remove-folder' ? (
              <p className="text-xs text-text-secondary mb-4">
                Папка будет убрана из рабочей области. Файлы на диске останутся без изменений.
              </p>
            ) : actionModal.type === 'delete' ? (
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
                {actionModal.type === 'remove-folder'
                  ? 'Убрать'
                  : actionModal.type === 'delete'
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
