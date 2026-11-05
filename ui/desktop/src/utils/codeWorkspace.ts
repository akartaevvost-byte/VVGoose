import { parse } from 'jsonc-parser';

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
    const parsed = parse(content) as CodeWorkspaceConfig;
    if (
      !parsed ||
      !parsed.folders ||
      !Array.isArray(parsed.folders) ||
      parsed.folders.length === 0
    ) {
      return null;
    }

    const firstFolder = parsed.folders[0].path;
    const normalizedWsPath = workspaceFilePath.replace(/\\/g, '/');
    const lastSlash = normalizedWsPath.lastIndexOf('/');
    const baseDir =
      lastSlash > 0 ? normalizedWsPath.substring(0, lastSlash) : lastSlash === 0 ? '/' : '.';

    let rootPath: string;
    if (firstFolder === '.' || firstFolder === './') {
      rootPath = baseDir;
    } else if (firstFolder.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(firstFolder)) {
      rootPath = firstFolder.replace(/\\/g, '/');
    } else {
      rootPath = `${baseDir}/${firstFolder}`.replace(/\/+/g, '/');
    }

    const fileName = normalizedWsPath.split('/').pop() || '';
    const name = parsed.folders[0].name || fileName.replace(/\.code-workspace$/, '');

    return { rootPath, name };
  } catch {
    return null;
  }
}
