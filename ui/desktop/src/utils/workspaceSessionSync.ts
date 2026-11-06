type WorkspaceSessionSync = (dir: string) => Promise<void>;

let syncActiveSession: WorkspaceSessionSync | null = null;

export function registerWorkspaceSessionSync(sync: WorkspaceSessionSync | null): () => void {
  syncActiveSession = sync;
  return () => {
    if (syncActiveSession === sync) {
      syncActiveSession = null;
    }
  };
}

export async function syncActiveSessionWorkingDir(dir: string): Promise<void> {
  if (!dir || !syncActiveSession) return;
  await syncActiveSession(dir);
}
