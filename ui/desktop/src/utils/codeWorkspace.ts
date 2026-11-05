import { parse } from 'jsonc-parser';

export interface CodeWorkspaceFolder {
  path: string;
  name?: string;
}

export interface CodeWorkspaceConfig {
  folders: CodeWorkspaceFolder[];
  settings?: Record<string, unknown>;
}

export interface WorkspaceFolderInfo {
  path: string;
  name: string;
}

export interface ParsedCodeWorkspace {
  rootPath: string;
  name: string;
  folders: WorkspaceFolderInfo[];
}

export function parseCodeWorkspace(
  content: string,
  workspaceFilePath: string
): ParsedCodeWorkspace | null {
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

    const normalizedWsPath = workspaceFilePath.replace(/\\/g, '/');
    const lastSlash = normalizedWsPath.lastIndexOf('/');
    const baseDir =
      lastSlash > 0 ? normalizedWsPath.substring(0, lastSlash) : lastSlash === 0 ? '/' : '.';

    const folders: WorkspaceFolderInfo[] = [];

    for (const folder of parsed.folders) {
      if (!folder || typeof folder.path !== 'string') continue;
      const folderPath = folder.path.trim();
      let resolvedPath: string;
      if (folderPath === '.' || folderPath === './') {
        resolvedPath = baseDir;
      } else if (folderPath.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(folderPath)) {
        resolvedPath = folderPath.replace(/\\/g, '/');
      } else {
        resolvedPath = `${baseDir}/${folderPath}`.replace(/\/+/g, '/');
      }

      const folderName =
        folder.name || resolvedPath.split('/').filter(Boolean).pop() || resolvedPath;

      folders.push({
        path: resolvedPath,
        name: folderName,
      });
    }

    if (folders.length === 0) return null;

    const fileName = normalizedWsPath.split('/').pop() || '';
    const name = parsed.folders[0]?.name || fileName.replace(/\.code-workspace$/, '') || folders[0].name;

    return {
      rootPath: folders[0].path,
      name,
      folders,
    };
  } catch {
    return null;
  }
}
