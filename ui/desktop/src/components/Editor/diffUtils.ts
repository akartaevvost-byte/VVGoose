export interface DiffStats {
  added: number;
  deleted: number;
}

export function computeDiffStats(original: string, modified: string): DiffStats {
  if (original === modified) {
    return { added: 0, deleted: 0 };
  }

  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  let added = 0;
  let deleted = 0;

  const origCounts = new Map<string, number>();
  for (const line of origLines) {
    origCounts.set(line, (origCounts.get(line) || 0) + 1);
  }

  const modCounts = new Map<string, number>();
  for (const line of modLines) {
    modCounts.set(line, (modCounts.get(line) || 0) + 1);
  }

  for (const [line, count] of modCounts) {
    const origCount = origCounts.get(line) || 0;
    if (count > origCount) {
      added += count - origCount;
    }
  }

  for (const [line, count] of origCounts) {
    const modCount = modCounts.get(line) || 0;
    if (count > modCount) {
      deleted += count - modCount;
    }
  }

  return { added, deleted };
}

