export type GitFileStatus = 'modified' | 'untracked' | 'added' | 'deleted' | 'ignored';

export interface WorkspaceFileNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size?: number;
  modifiedTime?: number;
  gitStatus?: GitFileStatus;
  isIgnored?: boolean;
  children?: WorkspaceFileNode[];
}

export interface WorkspaceFileTreeOptions {
  includeIgnored?: boolean;
}

export interface WorkspaceOperationResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface WorkspaceFileContentResult {
  content: string;
  filePath: string;
  error: string | null;
  found: boolean;
}

export interface OpenFileTab {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
}
