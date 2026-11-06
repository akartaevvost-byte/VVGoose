import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings, Settings } from '../settings';
import {
  getLastOpenedWorkspaceDir,
  resolveInitialDir,
} from '../workspaceDirResolution';

const tempDirectories: string[] = [];

function makeTempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'goose-workspace-test-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    fs.rmSync(tempDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('workspaceDirResolution', () => {
  describe('getLastOpenedWorkspaceDir', () => {
    it('returns null if settings or lastOpenedWorkspace is missing', () => {
      expect(getLastOpenedWorkspaceDir(null)).toBeNull();
      expect(getLastOpenedWorkspaceDir(defaultSettings)).toBeNull();
    });

    it('returns the directory path if it exists on disk', () => {
      const tempDir = makeTempDirectory();
      const settings: Settings = {
        ...defaultSettings,
        lastOpenedWorkspace: {
          path: tempDir,
          type: 'folder',
          folders: [{ path: tempDir, name: path.basename(tempDir) }],
          name: path.basename(tempDir),
        },
      };

      expect(getLastOpenedWorkspaceDir(settings)).toBe(tempDir);
    });

    it('returns null if the saved directory does not exist on disk', () => {
      const nonexistentDir = path.join(os.tmpdir(), 'nonexistent-goose-dir-' + Date.now());
      const settings: Settings = {
        ...defaultSettings,
        lastOpenedWorkspace: {
          path: nonexistentDir,
          type: 'folder',
        },
      };

      expect(getLastOpenedWorkspaceDir(settings)).toBeNull();
    });

    it('returns null if the saved directory path is empty or whitespace', () => {
      const settings: Settings = {
        ...defaultSettings,
        lastOpenedWorkspace: {
          path: '   ',
          type: 'folder',
        },
      };

      expect(getLastOpenedWorkspaceDir(settings)).toBeNull();
    });
  });

  describe('resolveInitialDir', () => {
    it('prefers explicitDir above everything else', () => {
      const tempDir = makeTempDirectory();
      const explicitDir = '/explicit/cmd/dir';
      const settings: Settings = {
        ...defaultSettings,
        lastOpenedWorkspace: {
          path: tempDir,
          type: 'folder',
        },
      };

      const result = resolveInitialDir({
        explicitDir,
        settings,
        recentDirs: ['/recent/dir'],
        cwd: '/cwd/dir',
        isTTY: true,
      });

      expect(result).toBe('/explicit/cmd/dir');
    });

    it('prefers saved lastOpenedWorkspace over recentDirs and cwd when explicitDir is absent', () => {
      const tempDir = makeTempDirectory();
      const settings: Settings = {
        ...defaultSettings,
        lastOpenedWorkspace: {
          path: tempDir,
          type: 'folder',
        },
      };

      const result = resolveInitialDir({
        settings,
        recentDirs: ['/recent/dir'],
        cwd: '/cwd/dir',
        isTTY: true,
      });

      expect(result).toBe(tempDir);
    });

    it('falls back to recentDirs when saved workspace directory was deleted or moved', () => {
      const nonexistentDir = path.join(os.tmpdir(), 'nonexistent-goose-dir-' + Date.now());
      const settings: Settings = {
        ...defaultSettings,
        lastOpenedWorkspace: {
          path: nonexistentDir,
          type: 'folder',
        },
      };

      const result = resolveInitialDir({
        settings,
        recentDirs: ['/recent/dir'],
        cwd: '/cwd/dir',
        isTTY: true,
      });

      expect(result).toBe('/recent/dir');
    });

    it('falls back to cwd in TTY mode when both saved workspace and recentDirs are empty', () => {
      const settings: Settings = {
        ...defaultSettings,
        lastOpenedWorkspace: null,
      };

      const result = resolveInitialDir({
        settings,
        recentDirs: [],
        cwd: '/work/project',
        isTTY: true,
      });

      expect(result).toBe('/work/project');
    });

    it('returns undefined when no explicit dir, no saved workspace, no recent dirs, and not TTY', () => {
      const settings: Settings = {
        ...defaultSettings,
        lastOpenedWorkspace: null,
      };

      const result = resolveInitialDir({
        settings,
        recentDirs: [],
        cwd: '/work/project',
        isTTY: false,
      });

      expect(result).toBeUndefined();
    });

    it('supports code-workspace projects with multiple folders', () => {
      const tempDir1 = makeTempDirectory();
      const tempDir2 = makeTempDirectory();
      const wsFile = path.join(tempDir1, 'multi.code-workspace');

      const settings: Settings = {
        ...defaultSettings,
        lastOpenedWorkspace: {
          path: tempDir1,
          type: 'code-workspace',
          workspaceFilePath: wsFile,
          folders: [
            { path: tempDir1, name: 'Root1' },
            { path: tempDir2, name: 'Root2' },
          ],
          name: 'MultiRoot',
        },
      };

      const result = resolveInitialDir({
        settings,
        recentDirs: [],
        isTTY: false,
      });

      expect(result).toBe(tempDir1);
    });
  });
});
