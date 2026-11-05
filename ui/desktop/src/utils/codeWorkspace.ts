export interface CodeWorkspaceFolder {
  path: string;
  name?: string;
}

export interface CodeWorkspaceConfig {
  folders: CodeWorkspaceFolder[];
  settings?: Record<string, unknown>;
}

export function parseCodeWorkspace(
  content: string,
  workspaceFilePath: string
): { rootPath: string; name: string } | null {
  try {
    const parsed = JSON.parse(content) as CodeWorkspaceConfig;
    if (!parsed.folders || !Array.isArray(parsed.folders) || parsed.folders.length === 0) {
      return null;
    }

    const firstFolder = parsed.folders[0].path;
    const baseDir = workspaceFilePath.substring(0, workspaceFilePath.lastIndexOf('/')) || '.';

    let rootPath: string;
    if (firstFolder === '.' || firstFolder === './') {
      rootPath = baseDir;
    } else if (firstFolder.startsWith('/')) {
      rootPath = firstFolder;
    } else {
      rootPath = `${baseDir}/${firstFolder}`.replace(/\/+/g, '/');
    }

    const fileName = workspaceFilePath.split(/[/\\]/).pop() || '';
    const name = parsed.folders[0].name || fileName.replace(/\.code-workspace$/, '');

    return { rootPath, name };
  } catch {
    return null;
  }
}

