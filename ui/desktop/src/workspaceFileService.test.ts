import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  readWorkspaceDirectory,
  readWorkspaceFile,
  createWorkspaceFile,
  createWorkspaceDirectory,
  renameWorkspacePath,
  deleteWorkspacePath,
  workspaceWatcherManager,
  assertWithinWorkspace,
  getWorkspaceGitStatuses,
} from './workspaceFileService';

describe('workspaceFileService', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'goose-ws-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('directory operations', () => {
    it('creates directories and lists contents with directories first', async () => {
      // Create subdirectories and files
      await createWorkspaceDirectory(path.join(tempDir, 'subfolder'));
      await createWorkspaceDirectory(path.join(tempDir, 'another_folder'));
      await createWorkspaceFile(path.join(tempDir, 'file_b.txt'), 'Hello B');
      await createWorkspaceFile(path.join(tempDir, 'file_a.txt'), 'Hello A');
      // Create an internal .git directory which should be ignored
      await createWorkspaceDirectory(path.join(tempDir, '.git'));
      await createWorkspaceFile(path.join(tempDir, '.git', 'HEAD'), 'ref: refs/heads/main');

      const nodes = await readWorkspaceDirectory(tempDir);

      // Verify .git is excluded
      expect(nodes.some((n) => n.name === '.git')).toBe(false);

      // Verify directories come first
      expect(nodes.length).toBe(4);
      expect(nodes[0].isDirectory).toBe(true);
      expect(nodes[1].isDirectory).toBe(true);
      expect(nodes[2].isDirectory).toBe(false);
      expect(nodes[3].isDirectory).toBe(false);

      // Verify alphabetical order
      expect(nodes[0].name).toBe('another_folder');
      expect(nodes[1].name).toBe('subfolder');
      expect(nodes[2].name).toBe('file_a.txt');
      expect(nodes[3].name).toBe('file_b.txt');
    });

    it('reads files inside a subdirectory', async () => {
      const nestedDir = path.join(tempDir, 'nested');
      await createWorkspaceFile(path.join(nestedDir, 'child.rs'), 'fn main() {}');

      const nodes = await readWorkspaceDirectory(tempDir, 'nested');
      expect(nodes.length).toBe(1);
      expect(nodes[0].name).toBe('child.rs');
      expect(nodes[0].relativePath).toBe('nested/child.rs');
      expect(nodes[0].isDirectory).toBe(false);
    });
  });

  describe('file reading and writing', () => {
    it('creates and reads file content correctly', async () => {
      const filePath = path.join(tempDir, 'test.md');
      const createResult = await createWorkspaceFile(filePath, '# Test Header\nSome content');
      expect(createResult.success).toBe(true);

      const readResult = await readWorkspaceFile(filePath);
      expect(readResult.found).toBe(true);
      expect(readResult.error).toBeNull();
      expect(readResult.content).toBe('# Test Header\nSome content');
    });

    it('refuses to overwrite an existing file without the overwrite flag', async () => {
      const filePath = path.join(tempDir, 'existing.rs');
      await createWorkspaceFile(filePath, 'five hundred lines of code');

      const result = await createWorkspaceFile(filePath, '');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
      const readResult = await readWorkspaceFile(filePath);
      expect(readResult.content).toBe('five hundred lines of code');
    });

    it('overwrites an existing file when overwrite is set', async () => {
      const filePath = path.join(tempDir, 'existing.rs');
      await createWorkspaceFile(filePath, 'old content');

      const result = await createWorkspaceFile(filePath, 'new content', undefined, true);

      expect(result.success).toBe(true);
      const readResult = await readWorkspaceFile(filePath);
      expect(readResult.content).toBe('new content');
    });

    it('creates parent directories on demand', async () => {
      const filePath = path.join(tempDir, 'deeply', 'nested', 'dir', 'file.txt');
      const createResult = await createWorkspaceFile(filePath, 'nested content');
      expect(createResult.success).toBe(true);

      const readResult = await readWorkspaceFile(filePath);
      expect(readResult.content).toBe('nested content');
    });

    it('handles non-existent files gracefully', async () => {
      const missingPath = path.join(tempDir, 'does-not-exist.txt');
      const readResult = await readWorkspaceFile(missingPath);
      expect(readResult.found).toBe(false);
      expect(readResult.content).toBe('');
    });

    it('rejects reading directories as files', async () => {
      const dirPath = path.join(tempDir, 'not-a-file');
      await createWorkspaceDirectory(dirPath);

      const readResult = await readWorkspaceFile(dirPath);
      expect(readResult.found).toBe(false);
      expect(readResult.error).toContain('not a regular file');
    });
  });

  describe('file rename and deletion', () => {
    it('renames a file successfully', async () => {
      const oldPath = path.join(tempDir, 'old_name.txt');
      const newPath = path.join(tempDir, 'new_name.txt');

      await createWorkspaceFile(oldPath, 'Content to rename');
      const renameResult = await renameWorkspacePath(oldPath, newPath);
      expect(renameResult.success).toBe(true);

      const oldCheck = await readWorkspaceFile(oldPath);
      expect(oldCheck.found).toBe(false);

      const newCheck = await readWorkspaceFile(newPath);
      expect(newCheck.found).toBe(true);
      expect(newCheck.content).toBe('Content to rename');
    });

    it('deletes a file successfully', async () => {
      const filePath = path.join(tempDir, 'delete_me.txt');
      await createWorkspaceFile(filePath, 'To be deleted');

      const deleteResult = await deleteWorkspacePath(filePath);
      expect(deleteResult.success).toBe(true);

      const check = await readWorkspaceFile(filePath);
      expect(check.found).toBe(false);
    });

    it('deletes a directory recursively', async () => {
      const dirPath = path.join(tempDir, 'delete_dir');
      await createWorkspaceFile(path.join(dirPath, 'inner.txt'), 'Inner');

      const deleteResult = await deleteWorkspacePath(dirPath);
      expect(deleteResult.success).toBe(true);

      const nodes = await readWorkspaceDirectory(tempDir);
      expect(nodes.some((n) => n.name === 'delete_dir')).toBe(false);
    });
  });

  describe('workspace watcher manager', () => {
    it('starts and stops watching without throwing', () => {
      const windowId = 999;
      expect(() => {
        workspaceWatcherManager.startWatching(windowId, tempDir, () => {});
        expect(workspaceWatcherManager.getWorkspacePath(windowId)).toBe(path.resolve(tempDir));
        workspaceWatcherManager.stopWatching(windowId);
        expect(workspaceWatcherManager.getWorkspacePath(windowId)).toBeUndefined();
      }).not.toThrow();
    });
  });

  describe('security and path traversal validation', () => {
    it('assertWithinWorkspace allows valid subpaths and exact workspace path', () => {
      const validSubpath = path.join(tempDir, 'sub', 'file.txt');
      expect(assertWithinWorkspace(validSubpath, tempDir)).toBe(validSubpath);
      expect(assertWithinWorkspace(tempDir, tempDir)).toBe(tempDir);
    });

    it('assertWithinWorkspace denies traversal attempts outside workspace', () => {
      const outsidePath = path.join(tempDir, '..', 'evil.txt');
      expect(() => assertWithinWorkspace(outsidePath, tempDir)).toThrow(/Access denied/);
    });

    it('rejects read/write operations outside workspace when workspaceRoot is specified', async () => {
      const outsideFile = path.resolve(tempDir, '../outside.txt');
      const readResult = await readWorkspaceFile(outsideFile, tempDir);
      expect(readResult.found).toBe(false);
      expect(readResult.error).toContain('Access denied');

      const createResult = await createWorkspaceFile(outsideFile, 'hacked', tempDir);
      expect(createResult.success).toBe(false);
      expect(createResult.error).toContain('Access denied');

      const deleteResult = await deleteWorkspacePath(outsideFile, tempDir);
      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toContain('Access denied');
    });
  });

  describe('git status caching', () => {
    it('returns cached results within TTL', async () => {
      const status1 = await getWorkspaceGitStatuses(tempDir);
      const status2 = await getWorkspaceGitStatuses(tempDir);
      expect(status1).toEqual(status2);
    });
  });
});
