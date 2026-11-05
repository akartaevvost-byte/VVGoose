import React, { useState, useEffect, useCallback } from 'react';
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
import { useWorkspace } from '../../contexts/WorkspaceContext';
import type { WorkspaceFileNode } from '../../types/fileSystem';
import { FileContextMenu } from './FileContextMenu';
import { getFileIcon } from './fileIcons';
import { cn } from '../../utils';

interface FileTreeNodeProps {
  node: WorkspaceFileNode;
  level: number;
  expandedDirs: Set<string>;
  toggleDir: (relPath: string) => void;
  dirChildren: Map<string, WorkspaceFileNode[]>;
  selectedFile: string | null;
  onSelectFile: (filePath: string) => void;
  onContextMenu: (e: React.MouseEvent, node: WorkspaceFileNode) => void;
  hideIgnored?: boolean;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  level,
  expandedDirs,
  toggleDir,
  dirChildren,
  selectedFile,
  onSelectFile,
  onContextMenu,
  hideIgnored = false,
}) => {
  if (hideIgnored && node.isIgnored) {
    return null;
  }

  const isExpanded = expandedDirs.has(node.relativePath);
  const children = dirChildren.get(node.relativePath) || [];
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
    <div>
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
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
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

      {node.isDirectory && isExpanded && (
        <div>
          {children.length === 0 ? (
            <div
              style={{ paddingLeft: `${(level + 1) * 14 + 18}px` }}
              className="py-1 text-[11px] text-text-muted italic"
            >
              Пусто
            </div>
          ) : (
            children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                level={level + 1}
                expandedDirs={expandedDirs}
                toggleDir={toggleDir}
                dirChildren={dirChildren}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                onContextMenu={onContextMenu}
                hideIgnored={hideIgnored}
              />
            ))
          )}
        </div>
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
        console.error('Failed to load directory:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [workspacePath]
  );

  // Refresh root when workspacePath or refreshTrigger changes
  useEffect(() => {
    loadDirectory('');
  }, [loadDirectory, refreshTrigger]);

  // Re-fetch all currently expanded directories on refreshTrigger
  useEffect(() => {
    if (expandedDirs.size === 0) return;
    expandedDirs.forEach((dir) => {
      loadDirectory(dir);
    });
  }, [refreshTrigger, loadDirectory, expandedDirs]);

  const toggleDir = useCallback(
    async (relPath: string) => {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(relPath)) {
          next.delete(relPath);
        } else {
          next.add(relPath);
          loadDirectory(relPath);
        }
        return next;
      });
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
    const { type, targetPath, targetNode, inputValue } = actionModal;

    try {
      if (type === 'create-file' && inputValue.trim()) {
        const fullPath = `${targetPath}/${inputValue.trim()}`;
        await window.electron.workspaceCreateFile(fullPath);
        void openFile(fullPath);
      } else if (type === 'create-folder' && inputValue.trim()) {
        const fullPath = `${targetPath}/${inputValue.trim()}`;
        await window.electron.workspaceCreateDirectory(fullPath);
      } else if (type === 'rename' && targetNode && inputValue.trim()) {
        const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
        const newPath = `${parentDir}/${inputValue.trim()}`;
        await window.electron.workspaceRenamePath(targetPath, newPath);
        closeFile(targetPath);
        void openFile(newPath);
      } else if (type === 'delete') {
        await window.electron.workspaceDeletePath(targetPath);
        closeFile(targetPath);
      }
      refreshWorkspace();
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActionModal(null);
    }
  };

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
      <div className="flex-1 overflow-y-auto px-1 py-1.5">
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
          rootNodes.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              level={0}
              expandedDirs={expandedDirs}
              toggleDir={toggleDir}
              dirChildren={dirChildren}
              selectedFile={selectedFile}
              onSelectFile={handleSelectFile}
              onContextMenu={handleContextMenu}
              hideIgnored={hideIgnored}
            />
          ))
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
            ) : (
              <input
                type="text"
                value={actionModal.inputValue}
                onChange={(e) =>
                  setActionModal((prev) => (prev ? { ...prev, inputValue: e.target.value } : null))
                }
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmAction();
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
                onClick={handleConfirmAction}
                className={cn(
                  'px-3 py-1 text-xs rounded-md font-medium text-white transition-opacity',
                  actionModal.type === 'delete'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-goose-teal hover:opacity-90'
                )}
              >
                {actionModal.type === 'delete' ? 'Удалить' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
