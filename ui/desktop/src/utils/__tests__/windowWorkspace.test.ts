import { describe, expect, it } from 'vitest';
import {
  directoryIsInsideWorkspace,
  resolveInitialWorkspace,
  withAddedFolder,
  withRemovedFolder,
  workspaceFromCodeWorkspace,
  workspaceFromFolder,
} from '../windowWorkspace';

describe('windowWorkspace', () => {
  it('prefers the directory the window was opened with', () => {
    const workspace = resolveInitialWorkspace({
      requestDir: '/projects/VVGoose',
      cached: workspaceFromFolder('/old/качество'),
      workingDir: '/tmp',
    });

    expect(workspace).toEqual(workspaceFromFolder('/projects/VVGoose'));
  });

  it('uses the saved workspace only when the window was not opened with a directory', () => {
    const cached = workspaceFromFolder('/old/качество');
    expect(resolveInitialWorkspace({ cached, workingDir: '/tmp' })).toEqual(cached);
    expect(resolveInitialWorkspace({ workingDir: '/tmp' })).toEqual(workspaceFromFolder('/tmp'));
  });

  it('names a code workspace after its file and keeps every folder', () => {
    const workspace = workspaceFromCodeWorkspace(
      {
        rootPath: '/projects/app',
        name: 'App',
        folders: [
          { path: '/projects/app', name: 'App' },
          { path: '/projects/core', name: 'Core' },
        ],
      },
      '/projects/качество.code-workspace'
    );

    expect(workspace.kind).toBe('code-workspace');
    expect(workspace.name).toBe('качество');
    expect(workspace.folders).toHaveLength(2);
  });

  it('adds a folder without dropping the ones already open', () => {
    const next = withAddedFolder(workspaceFromFolder('/projects/VVGoose'), '/projects/качество');

    expect(next.kind).toBe('untitled');
    expect(next.folders.map((folder) => folder.path)).toEqual([
      '/projects/VVGoose',
      '/projects/качество',
    ]);
  });

  it('removing the extra folder returns to a single folder workspace', () => {
    const added = withAddedFolder(workspaceFromFolder('/projects/VVGoose'), '/projects/качество');
    expect(withRemovedFolder(added, '/projects/качество')).toEqual(
      workspaceFromFolder('/projects/VVGoose')
    );
  });

  it('treats a chat directory inside an open root as part of the current workspace', () => {
    const folders = [{ path: '/projects/VVGoose' }, { path: '/projects/качество' }];

    expect(directoryIsInsideWorkspace(folders, '/projects/VVGoose')).toBe(true);
    expect(directoryIsInsideWorkspace(folders, '/projects/VVGoose/crates')).toBe(true);
    expect(directoryIsInsideWorkspace(folders, '/projects/other')).toBe(false);
  });
});
