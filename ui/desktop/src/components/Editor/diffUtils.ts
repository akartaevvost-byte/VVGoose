export interface DiffStats {
  added: number;
  deleted: number;
}

/**
 * Computes line-based diff statistics (added and deleted line counts)
 * using the Longest Common Subsequence (LCS) algorithm with common prefix/suffix optimization.
 */
export function computeDiffStats(original: string, modified: string): DiffStats {
  if (original === modified) {
    return { added: 0, deleted: 0 };
  }
  if (!original) {
    return { added: modified.split('\n').length, deleted: 0 };
  }
  if (!modified) {
    return { added: 0, deleted: original.split('\n').length };
  }

  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const n = origLines.length;
  const m = modLines.length;

  // Trim common prefix
  let start = 0;
  while (start < n && start < m && origLines[start] === modLines[start]) {
    start++;
  }

  // Trim common suffix
  let origEnd = n - 1;
  let modEnd = m - 1;
  while (origEnd >= start && modEnd >= start && origLines[origEnd] === modLines[modEnd]) {
    origEnd--;
    modEnd--;
  }

  const trimmedN = origEnd - start + 1;
  const trimmedM = modEnd - start + 1;

  if (trimmedN <= 0) {
    return { added: Math.max(0, trimmedM), deleted: 0 };
  }
  if (trimmedM <= 0) {
    return { added: 0, deleted: Math.max(0, trimmedN) };
  }

  // Compute LCS on trimmed slices using space-optimized DP table
  const dp = new Array(trimmedM + 1).fill(0);
  for (let i = 0; i < trimmedN; i++) {
    let prev = 0;
    const origLine = origLines[start + i];
    for (let j = 0; j < trimmedM; j++) {
      const temp = dp[j + 1];
      if (origLine === modLines[start + j]) {
        dp[j + 1] = prev + 1;
      } else {
        dp[j + 1] = Math.max(dp[j + 1], dp[j]);
      }
      prev = temp;
    }
  }

  const lcsLength = dp[trimmedM];
  return {
    added: trimmedM - lcsLength,
    deleted: trimmedN - lcsLength,
  };
}
