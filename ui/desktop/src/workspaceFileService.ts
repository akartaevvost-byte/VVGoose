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
  WorkspaceOperationResult,
} from './types/fileSystem';

const execFileAsync = promisify(execFile);

/**
 * Validates that a target path resides within the specified workspace root.
 * Throws an Error if a path traversal attempt is detected.
 */
export function assertWithinWorkspace(
  filePath: string,
  workspaceRoot: string | string[]
): string {
  const resolved = path.resolve(expandTilde(filePath));
  const roots = (Array.isArray(workspaceRoot) ? workspaceRoot : [workspaceRoot])
    .filter(Boolean)
    .map((r) => path.resolve(expandTilde(r)));

  if (roots.length === 0) {
    return resolved;
  }

  const isWithin = roots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep)
  );

  if (!isWithin) {
    throw new Error(`Access denied: ${resolved} is outside workspace ${roots.join(', ')}`);
  }
  return resolved;
}

interface GitStatusCacheEntry {
  timestamp: number;
  statuses: Record<string, GitFileStatus>;
}

const gitStatusCache = new Map<string, GitStatusCacheEntry>();
const GIT_STATUS_CACHE_TTL_MS = 2000;

export function invalidateGitStatusCache(workspacePath?: string | string[]): void {
  if (workspacePath) {
    const roots = Array.isArray(workspacePath) ? workspacePath : [workspacePath];
    for (const r of roots) {
      if (r) gitStatusCache.delete(path.resolve(expandTilde(r)));
    }
  } else {
    gitStatusCache.clear();
  }
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const length = Math.min(buffer.length, 8000);
  for (let i = 0; i < length; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
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
      ['status', '--porcelain=v1', '-unormal', '--ignored=traditional'],
      {
        cwd: expandedPath,
        encoding: 'utf8',
        maxBuffer: 25 * 1024 * 1024,
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
  } catch (error) {
    console.error('Failed to get git statuses:', error);
    // If Git is not installed or the directory is not a Git repo, return empty map
    return {};
  }
}

/**
 * Reads a single directory level in the workspace with metadata and Git statuses
 */
export async function readWorkspaceDirectory(
  workspaceRoot: string,
  relativeDir = ''
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
      if (!gitStatus) {
        const segments = posixRelativePath.split('/');
        let cur = '';
        for (let i = 0; i < segments.length - 1; i++) {
          cur = cur ? `${cur}/${segments[i]}` : segments[i];
          if (gitStatuses[cur] === 'ignored') {
            gitStatus = 'ignored';
            break;
          }
        }
      }

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
  workspaceRoot?: string | string[]
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
        isBinary: false,
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
        isBinary: false,
      };
    }

    const buffer = await fs.readFile(expandedPath);
    if (isBinaryBuffer(buffer)) {
      return {
        content: '',
        filePath: expandedPath,
        error: 'Binary file cannot be opened in text editor',
        found: true,
        isBinary: true,
      };
    }

    const fileContent = buffer.toString('utf8');
    return {
      content: fileContent,
      filePath: expandedPath,
      error: null,
      found: true,
      isBinary: false,
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
      isBinary: false,
    };
  }
}

/**
 * Creates a new file at the specified path. Refuses to touch an existing file
 * unless `overwrite` is set, so "create" can never silently truncate content.
 */
export async function createWorkspaceFile(
  filePath: string,
  content = '',
  workspaceRoot?: string | string[],
  overwrite = false
): Promise<WorkspaceOperationResult> {
  try {
    let expandedPath = expandTilde(filePath);
    if (workspaceRoot) {
      expandedPath = assertWithinWorkspace(expandedPath, workspaceRoot);
    } else {
      expandedPath = path.resolve(expandedPath);
    }

    if (!overwrite) {
      try {
        await fs.access(expandedPath);
        return {
          success: false,
          error: `File already exists: ${expandedPath}`,
        };
      } catch {
        // Nothing exists at the path yet
      }
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
  workspaceRoot?: string | string[]
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
  workspaceRoot?: string | string[]
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
  workspaceRoot?: string | string[]
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
      watchers: FSWatcher[];
      debounceTimer: ReturnType<typeof setTimeout> | null;
      workspacePaths: string[];
    }
  >();

  /**
   * Returns current active workspace path for a window
   */
  getWorkspacePath(windowId: number): string | undefined {
    return this.watchers.get(windowId)?.workspacePaths[0];
  }

  /**
   * Returns all active workspace paths for a window
   */
  getWorkspacePaths(windowId: number): string[] {
    return this.watchers.get(windowId)?.workspacePaths ?? [];
  }

  /**
   * Starts watching a workspace directory or multiple directories for changes
   */
  startWatching(
    windowId: number,
    workspacePathOrPaths: string | string[],
    onChange: (changedPath: string) => void
  ): void {
    this.stopWatching(windowId);

    const rawList = Array.isArray(workspacePathOrPaths)
      ? workspacePathOrPaths
      : [workspacePathOrPaths];
    const expandedPaths = rawList
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .map((p) => path.resolve(expandTilde(p)));

    if (expandedPaths.length === 0) return;

    const fsWatchers: FSWatcher[] = [];

    for (const expandedPath of expandedPaths) {
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

        fsWatchers.push(watcher);
      } catch (error) {
        console.error(`Failed to start workspace watcher for ${expandedPath}:`, error);
      }
    }

    this.watchers.set(windowId, {
      watchers: fsWatchers,
      debounceTimer: null,
      workspacePaths: expandedPaths,
    });
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
      for (const w of entry.watchers) {
        try {
          w.close();
        } catch {
          // Ignore close errors
        }
      }
      this.watchers.delete(windowId);
    }
  }
}

export const workspaceWatcherManager = new WorkspaceWatcherManager();
