import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const RECENT_WORKSPACES_FILE = path.join(app.getPath('userData'), 'recent-workspaces.json');
const MAX_RECENT_WORKSPACES = 10;

export interface StoredRecentWorkspace {
  name: string;
  workspaceFilePath: string;
  lastOpened: number;
}

interface RecentWorkspacesFile {
  workspaces: StoredRecentWorkspace[];
}

function isWorkspaceFile(filePath: string): boolean {
  if (!filePath.endsWith('.code-workspace')) return false;
  try {
    const stats = fs.lstatSync(filePath);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

export function loadRecentWorkspaces(): StoredRecentWorkspace[] {
  try {
    if (!fs.existsSync(RECENT_WORKSPACES_FILE)) return [];
    const parsed = JSON.parse(
      fs.readFileSync(RECENT_WORKSPACES_FILE, 'utf8')
    ) as RecentWorkspacesFile;
    const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
    return workspaces.filter(
      (item) =>
        item &&
        typeof item.workspaceFilePath === 'string' &&
        typeof item.name === 'string' &&
        isWorkspaceFile(item.workspaceFilePath)
    );
  } catch (error) {
    console.error('Error loading recent workspaces:', error);
    return [];
  }
}

export function saveRecentWorkspaces(items: StoredRecentWorkspace[]): void {
  const valid = items
    .filter((item) => item.workspaceFilePath && isWorkspaceFile(item.workspaceFilePath))
    .slice(0, MAX_RECENT_WORKSPACES);
  try {
    fs.writeFileSync(RECENT_WORKSPACES_FILE, JSON.stringify({ workspaces: valid }, null, 2));
  } catch (error) {
    console.error('Error saving recent workspaces:', error);
  }
}
