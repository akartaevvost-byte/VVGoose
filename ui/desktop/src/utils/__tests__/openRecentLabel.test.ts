import { describe, expect, it } from 'vitest';
import { workspaceRecentMenuLabel } from '../openRecentLabel';

describe('workspaceRecentMenuLabel', () => {
  it('marks a workspace so it is distinct from a directory path', () => {
    expect(workspaceRecentMenuLabel('качество')).toBe('качество (Workspace)');
  });
});
