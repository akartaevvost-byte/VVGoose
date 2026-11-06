import fsSync from 'node:fs';
import path from 'node:path';
import type { Settings } from './settings';
import { loadRecentDirs } from './recentDirs';

export function getLastOpenedWorkspaceDir(settings?: Settings | null): string | null {
  try {
    const lastWorkspace = settings?.lastOpenedWorkspace;
    if (lastWorkspace?.path && typeof lastWorkspace.path === 'string') {
      const trimmed = lastWorkspace.path.trim();
      if (trimmed && fsSync.existsSync(trimmed)) {
        return trimmed;
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

export interface ResolveInitialDirOptions {
  explicitDir?: string | null;
  settings?: Settings | null;
  recentDirs?: string[];
  cwd?: string;
  isTTY?: boolean;
}

export function resolveInitialDir(options: ResolveInitialDirOptions = {}): string | undefined {
  const { explicitDir, settings, recentDirs, cwd, isTTY } = options;

  if (explicitDir?.trim()) {
    return explicitDir.trim();
  }

  const savedWorkspaceDir = getLastOpenedWorkspaceDir(settings);
  if (savedWorkspaceDir) {
    return savedWorkspaceDir;
  }

  const resolvedRecentDirs = recentDirs ?? loadRecentDirs();
  if (resolvedRecentDirs.length > 0 && resolvedRecentDirs[0]?.trim()) {
    return resolvedRecentDirs[0].trim();
  }

  const checkTTY = isTTY !== undefined ? isTTY : process.stdin.isTTY;
  if (checkTTY) {
    try {
      const currentCwd = cwd ?? process.cwd();
      if (path.parse(currentCwd).root !== currentCwd) {
        return currentCwd;
      }
    } catch {
      // cwd unavailable
    }
  }

  return undefined;
}
