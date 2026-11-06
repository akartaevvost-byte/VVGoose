export function workspaceRecentMenuLabel(name: string): string {
  const trimmed = name.trim();
  return `${trimmed || 'Workspace'} (Workspace)`;
}
