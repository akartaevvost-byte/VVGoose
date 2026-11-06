import type { ParsedCodeWorkspace, WorkspaceFolderInfo } from './codeWorkspace';
import type { LastOpenedWorkspace } from './settings';

export type WorkspaceKind = 'folder' | 'code-workspace' | 'untitled';

export interface WindowWorkspace {
  kind: WorkspaceKind;
  path: string;
  name: string;
  folders: WorkspaceFolderInfo[];
  workspaceFilePath?: string;
}

export const WORKSPACE_STATE_KEY = 'goose_workspace_state';

export function folderName(folderPath: string): string {
  return folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
}

export function emptyWorkspace(): WindowWorkspace {
  return { kind: 'folder', path: '', name: '', folders: [] };
}

export function workspaceFromFolder(folderPath: string): WindowWorkspace {
  const path = folderPath.trim();
  const name = folderName(path);
  return {
    kind: 'folder',
    path,
    name,
    folders: [{ path, name }],
  };
}

export function workspaceFileDisplayName(workspaceFilePath: string, fallback: string): string {
  const fileName = workspaceFilePath.split(/[/\\]/).pop() || '';
  return fileName.replace(/\.code-workspace$/i, '') || fallback;
}

export function workspaceFromCodeWorkspace(
  parsed: ParsedCodeWorkspace,
  workspaceFilePath: string
): WindowWorkspace {
  return {
    kind: 'code-workspace',
    path: parsed.rootPath,
    name: workspaceFileDisplayName(workspaceFilePath, parsed.name),
    folders: parsed.folders,
    workspaceFilePath,
  };
}

export function withAddedFolder(current: WindowWorkspace, folderPath: string): WindowWorkspace {
  const path = folderPath.trim();
  if (!path || current.folders.some((folder) => folder.path === path)) {
    return current;
  }
  if (!current.path || current.folders.length === 0) {
    return workspaceFromFolder(path);
  }
  const folders = [...current.folders, { path, name: folderName(path) }];
  if (current.kind === 'code-workspace') {
    return { ...current, folders };
  }
  return {
    kind: 'untitled',
    path: current.path,
    name: current.name || folders[0].name,
    folders,
  };
}

export function withRemovedFolder(current: WindowWorkspace, folderPath: string): WindowWorkspace {
  const folders = current.folders.filter((folder) => folder.path !== folderPath);
  if (folders.length === 0) {
    return emptyWorkspace();
  }
  if (folders.length === 1 && current.kind !== 'code-workspace') {
    return workspaceFromFolder(folders[0].path);
  }
  const path = folders.some((folder) => folder.path === current.path)
    ? current.path
    : folders[0].path;
  return { ...current, path, folders };
}

export function sameWorkspace(left: WindowWorkspace, right: WindowWorkspace): boolean {
  if (
    left.kind !== right.kind ||
    left.path !== right.path ||
    left.name !== right.name ||
    left.workspaceFilePath !== right.workspaceFilePath ||
    left.folders.length !== right.folders.length
  ) {
    return false;
  }
  return left.folders.every(
    (folder, index) =>
      folder.path === right.folders[index]?.path && folder.name === right.folders[index]?.name
  );
}

export function toLastOpened(workspace: WindowWorkspace): LastOpenedWorkspace {
  return {
    path: workspace.path,
    type:
      workspace.kind === 'code-workspace'
        ? 'code-workspace'
        : workspace.kind === 'untitled'
          ? 'untitled'
          : 'folder',
    folders: workspace.folders,
    workspaceFilePath: workspace.workspaceFilePath,
    name: workspace.name,
  };
}

function isFolderInfo(value: unknown): value is WorkspaceFolderInfo {
  if (!value || typeof value !== 'object') return false;
  const folder = value as WorkspaceFolderInfo;
  return typeof folder.path === 'string' && folder.path.trim().length > 0;
}

export function workspaceFromSaved(
  saved: LastOpenedWorkspace | null | undefined
): WindowWorkspace | null {
  const path = saved?.path?.trim();
  if (!saved || !path) return null;
  const folders = (saved.folders || []).filter(isFolderInfo);
  const resolvedFolders =
    folders.length > 0 ? folders : [{ path, name: saved.name || folderName(path) }];
  const kind: WorkspaceKind =
    saved.type === 'code-workspace'
      ? 'code-workspace'
      : saved.type === 'untitled' || resolvedFolders.length > 1
        ? 'untitled'
        : 'folder';
  return {
    kind,
    path: resolvedFolders[0]?.path || path,
    name: saved.name || folderName(path),
    folders: resolvedFolders,
    workspaceFilePath: saved.workspaceFilePath,
  };
}

export function readCachedWorkspace(
  readItem: (key: string) => string | null = (key) => localStorage.getItem(key),
  pathKey = 'goose_workspace_path'
): WindowWorkspace | null {
  try {
    const raw = readItem(WORKSPACE_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WindowWorkspace>;
      const saved = workspaceFromSaved(
        parsed?.path
          ? {
              path: parsed.path,
              type:
                parsed.kind === 'code-workspace'
                  ? 'code-workspace'
                  : parsed.kind === 'untitled'
                    ? 'untitled'
                    : 'folder',
              folders: Array.isArray(parsed.folders) ? parsed.folders.filter(isFolderInfo) : [],
              workspaceFilePath: parsed.workspaceFilePath,
              name: typeof parsed.name === 'string' ? parsed.name : undefined,
            }
          : null
      );
      if (saved?.path) return saved;
    }
  } catch {
    // Ignore malformed cache and fall through to the single stored path.
  }

  try {
    const rawFolders = readItem('goose_workspace_folders');
    const path = readItem(pathKey)?.trim() || '';
    if (rawFolders) {
      const parsed = JSON.parse(rawFolders) as unknown;
      if (Array.isArray(parsed)) {
        const folders = parsed.filter(isFolderInfo);
        if (folders.length === 1) return workspaceFromFolder(folders[0].path);
        if (folders.length > 1) {
          const primary = folders.some((folder) => folder.path === path) ? path : folders[0].path;
          const primaryFolder = folders.find((folder) => folder.path === primary) || folders[0];
          return {
            kind: 'untitled',
            path: primary,
            name: primaryFolder.name,
            folders,
          };
        }
      }
    }
    if (path) return workspaceFromFolder(path);
  } catch {
    // Ignore storage errors.
  }
  return null;
}

export function resolveInitialWorkspace(input: {
  requestDir?: string | null;
  cached?: WindowWorkspace | null;
  workingDir?: string | null;
}): WindowWorkspace {
  const requestDir = input.requestDir?.trim();
  if (requestDir) return workspaceFromFolder(requestDir);
  if (input.cached?.path) return input.cached;
  const workingDir = input.workingDir?.trim();
  if (workingDir) return workspaceFromFolder(workingDir);
  return emptyWorkspace();
}

export function normalizeDir(folderPath: string): string {
  return folderPath.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

export function directoryIsInsideWorkspace(folders: Array<{ path: string }>, dir: string): boolean {
  const target = normalizeDir(dir);
  if (!target) return false;
  return folders.some((folder) => {
    const root = normalizeDir(folder.path);
    return Boolean(root) && (target === root || target.startsWith(`${root}/`));
  });
}

export function isPathInside(parent: string, candidate: string): boolean {
  const root = normalizeDir(parent);
  const target = normalizeDir(candidate);
  if (!root || !target) return false;
  return target === root || target.startsWith(`${root}/`);
}
