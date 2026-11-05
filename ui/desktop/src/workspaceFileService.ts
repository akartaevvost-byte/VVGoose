import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expandTilde } from './utils/pathUtils';
import type {
  GitFileStatus,
  WorkspaceFileContentResult,
  WorkspaceFileNode,
  WorkspaceFileTreeOptions,
  WorkspaceOperationResult,
} from './types/fileSystem';

const execFileAsync = promisify(execFile);

/**
 * Validates that a target path resides within the specified workspace root.
 * Throws an Error if a path traversal attempt is detected.
 */
export function assertWithinWorkspace(filePath: string, workspaceRoot: string): string {
  const resolved = path.resolve(expandTilde(filePath));
  const root = path.resolve(expandTilde(workspaceRoot));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Access denied: ${resolved} is outside workspace ${root}`);
  }
  return resolved;
}

interface GitStatusCacheEntry {
  timestamp: number;
  statuses: Record<string, GitFileStatus>;
}

const gitStatusCache = new Map<string, GitStatusCacheEntry>();
const GIT_STATUS_CACHE_TTL_MS = 2000;

export function invalidateGitStatusCache(workspacePath?: string): void {
  if (workspacePath) {
    gitStatusCache.delete(path.resolve(expandTilde(workspacePath)));
  } else {
    gitStatusCache.clear();
  }
}

/**
 * Executes Git in the workspace directory to get file statuses with a short TTL cache
 */
export async function getWorkspaceGitStatuses(
  workspacePath: string,
  bypassCache = false
): Promise<Record<string, GitFileStatus>> {
  const expandedPath = path.resolve(expandTilde(workspacePath));
  const now = Date.now();
  const cached = gitStatusCache.get(expandedPath);
  if (!bypassCache && cached && now - cached.timestamp < GIT_STATUS_CACHE_TTL_MS) {
    return cached.statuses;
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain=v1', '-u', '--ignored=matching'],
      {
        cwd: expandedPath,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    const statusMap: Record<string, GitFileStatus> = {};
    const lines = stdout.split('\n');

    for (const line of lines) {
      if (!line || line.length < 4) continue;

      const code = line.slice(0, 2);
      let rawFilePath = line.slice(3).trim();

      // Handle renamed files "orig -> dest"
      if (rawFilePath.includes(' -> ')) {
        const parts = rawFilePath.split(' -> ');
        rawFilePath = parts[1] ?? rawFilePath;
      }

      // Unquote if Git wrapped the path in quotes
      if (rawFilePath.startsWith('"') && rawFilePath.endsWith('"')) {
        rawFilePath = rawFilePath.slice(1, -1);
      }

      // Normalize path to forward slashes, strip trailing slashes for directory matching
      const normalizedPath = rawFilePath.replace(/\\/g, '/').replace(/\/+$/, '');

      let status: GitFileStatus;
      if (code === '??') {
        status = 'untracked';
      } else if (code === '!!') {
        status = 'ignored';
      } else if (code.includes('A')) {
        status = 'added';
      } else if (code.includes('D')) {
        status = 'deleted';
      } else if (code.includes('M')) {
        status = 'modified';
      } else {
        status = 'modified';
      }

      statusMap[normalizedPath] = status;
    }

    gitStatusCache.set(expandedPath, { timestamp: Date.now(), statuses: statusMap });
    return statusMap;
  } catch {
    // If Git is not installed or the directory is not a Git repo, return empty map
    return {};
  }
}

/**
 * Reads a single directory level in the workspace with metadata and Git statuses
 */
export async function readWorkspaceDirectory(
  workspaceRoot: string,
  relativeDir = '',
  options?: WorkspaceFileTreeOptions
): Promise<WorkspaceFileNode[]> {
  const expandedRoot = path.resolve(expandTilde(workspaceRoot));
  const targetDir = path.resolve(expandedRoot, relativeDir);
  assertWithinWorkspace(targetDir, expandedRoot);

  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const gitStatuses = await getWorkspaceGitStatuses(expandedRoot);

    const nodes: WorkspaceFileNode[] = [];

    for (const entry of entries) {
      // Do not list the internal .git folder
      if (entry.name === '.git') {
        continue;
      }

      const absolutePath = path.join(targetDir, entry.name);
      const posixRelativePath = path.posix
        .join(relativeDir.replace(/\\/g, '/'), entry.name)
        .replace(/^\/+/, '');

      const isDirectory = entry.isDirectory();

      // Check Git status for this file/directory
      let gitStatus = gitStatuses[posixRelativePath];
      if (!gitStatus && isDirectory) {
        // Check if any tracked/modified files exist under this directory
        const prefix = `${posixRelativePath}/`;
        const hasModified = Object.keys(gitStatuses).some(
          (k) => k.startsWith(prefix) && gitStatuses[k] !== 'ignored'
        );
        if (hasModified) {
          gitStatus = 'modified';
        }
      }

      const isIgnored = gitStatus === 'ignored';

      // Skip ignored files if option is not set
      if (isIgnored && options?.includeIgnored === false) {
        continue;
      }

      let size: number | undefined;
      let modifiedTime: number | undefined;

      try {
        const stats = await fs.stat(absolutePath);
        size = stats.size;
        modifiedTime = stats.mtimeMs;
      } catch {
        // Ignore stat errors for special files/broken symlinks
      }

      nodes.push({
        name: entry.name,
        path: absolutePath,
        relativePath: posixRelativePath,
        isDirectory,
        size,
        modifiedTime,
        gitStatus,
        isIgnored,
      });
    }

    // Sort: directories first, then alphabetical by name
    return nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  } catch (error) {
    console.error('Failed to read workspace directory:', error);
    return [];
  }
}

/**
 * Safely reads the text content of a workspace file
 */
export async function readWorkspaceFile(
  filePath: string,
  workspaceRoot?: string
): Promise<WorkspaceFileContentResult> {
  let expandedPath = expandTilde(filePath);
  try {
    if (workspaceRoot) {
      expandedPath = assertWithinWorkspace(expandedPath, workspaceRoot);
    } else {
      expandedPath = path.resolve(expandedPath);
    }

    const stats = await fs.stat(expandedPath);
    if (!stats.isFile()) {
      return {
        content: '',
        filePath: expandedPath,
        error: 'Path is not a regular file',
        found: false,
      };
    }

    // Avoid reading files larger than 10MB into memory
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (stats.size > MAX_FILE_SIZE) {
      return {
        content: '',
        filePath: expandedPath,
        error: 'File exceeds maximum supported size (10MB)',
        found: true,
      };
    }

    const fileContent = await fs.readFile(expandedPath, 'utf8');
    return {
      content: fileContent,
      filePath: expandedPath,
      error: null,
      found: true,
    };
  } catch (error) {
    const isEnoent =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT';

    return {
      content: '',
      filePath: expandedPath,
      error: isEnoent ? null : error instanceof Error ? error.message : 'Failed to read file',
      found: false,
    };
  }
}

/**
 * Creates a new file at the specified path
 */
export async function createWorkspaceFile(
  filePath: string,
  content = '',
  workspaceRoot?: string
): Promise<WorkspaceOperationResult> {
  try {
    let expandedPath = expandTilde(filePath);
    if (workspaceRoot) {
      expandedPath = assertWithinWorkspace(expandedPath, workspaceRoot);
    } else {
      expandedPath = path.resolve(expandedPath);
    }

    const parentDir = path.dirname(expandedPath);
    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(expandedPath, content, { encoding: 'utf8' });
    invalidateGitStatusCache(workspaceRoot);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create file',
    };
  }
}

/**
 * Creates a new directory at the specified path
 */
export async function createWorkspaceDirectory(
  dirPath: string,
  workspaceRoot?: string
): Promise<WorkspaceOperationResult> {
  try {
    let expandedPath = expandTilde(dirPath);
    if (workspaceRoot) {
      expandedPath = assertWithinWorkspace(expandedPath, workspaceRoot);
    } else {
      expandedPath = path.resolve(expandedPath);
    }

    await fs.mkdir(expandedPath, { recursive: true });
    invalidateGitStatusCache(workspaceRoot);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create directory',
    };
  }
}

/**
 * Renames or moves a file or directory
 */
export async function renameWorkspacePath(
  oldPath: string,
  newPath: string,
  workspaceRoot?: string
): Promise<WorkspaceOperationResult> {
  try {
    let expandedOld = expandTilde(oldPath);
    let expandedNew = expandTilde(newPath);
    if (workspaceRoot) {
      expandedOld = assertWithinWorkspace(expandedOld, workspaceRoot);
      expandedNew = assertWithinWorkspace(expandedNew, workspaceRoot);
    } else {
      expandedOld = path.resolve(expandedOld);
      expandedNew = path.resolve(expandedNew);
    }

    await fs.rename(expandedOld, expandedNew);
    invalidateGitStatusCache(workspaceRoot);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rename path',
    };
  }
}

/**
 * Deletes a file or directory
 */
export async function deleteWorkspacePath(
  targetPath: string,
  workspaceRoot?: string
): Promise<WorkspaceOperationResult> {
  try {
    let expandedPath = expandTilde(targetPath);
    if (workspaceRoot) {
      expandedPath = assertWithinWorkspace(expandedPath, workspaceRoot);
    } else {
      expandedPath = path.resolve(expandedPath);
    }

    await fs.rm(expandedPath, { recursive: true, force: true });
    invalidateGitStatusCache(workspaceRoot);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete path',
    };
  }
}

/**
 * Manages real-time filesystem watchers for open workspace windows
 */
export class WorkspaceWatcherManager {
  private readonly watchers = new Map<
    number,
    {
      watcher: FSWatcher;
      debounceTimer: ReturnType<typeof setTimeout> | null;
      workspacePath: string;
    }
  >();

  /**
   * Returns current active workspace path for a window
   */
  getWorkspacePath(windowId: number): string | undefined {
    return this.watchers.get(windowId)?.workspacePath;
  }

  /**
   * Starts watching a workspace directory for changes
   */
  startWatching(
    windowId: number,
    workspacePath: string,
    onChange: (changedPath: string) => void
  ): void {
    this.stopWatching(windowId);

    const expandedPath = path.resolve(expandTilde(workspacePath));

    try {
      const watcher = watch(expandedPath, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;

        const normalized = filename.replace(/\\/g, '/');
        // Ignore internal changes in .git, node_modules, and target to prevent event storms
        if (
          normalized.startsWith('.git/') ||
          normalized.startsWith('node_modules/') ||
          normalized.startsWith('target/') ||
          normalized === '.git' ||
          normalized === 'node_modules' ||
          normalized === 'target'
        ) {
          return;
        }

        const entry = this.watchers.get(windowId);
        if (!entry) return;

        if (entry.debounceTimer) {
          clearTimeout(entry.debounceTimer);
        }

        entry.debounceTimer = setTimeout(() => {
          invalidateGitStatusCache(expandedPath);
          onChange(expandedPath);
        }, 300);
      });

      this.watchers.set(windowId, {
        watcher,
        debounceTimer: null,
        workspacePath: expandedPath,
      });
    } catch (error) {
      console.error(`Failed to start workspace watcher for ${workspacePath}:`, error);
    }
  }

  /**
   * Stops watching for a window
   */
  stopWatching(windowId: number): void {
    const entry = this.watchers.get(windowId);
    if (entry) {
      if (entry.debounceTimer) {
        clearTimeout(entry.debounceTimer);
      }
      try {
        entry.watcher.close();
      } catch {
        // Ignore close errors
      }
      this.watchers.delete(windowId);
    }
  }
}

export const workspaceWatcherManager = new WorkspaceWatcherManager();
