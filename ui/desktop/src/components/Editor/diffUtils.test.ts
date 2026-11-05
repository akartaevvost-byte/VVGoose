import { describe, expect, it } from 'vitest';
import { computeDiffStats } from './diffUtils';

describe('computeDiffStats', () => {
  it('returns zeros for identical strings', () => {
    const stats = computeDiffStats('hello\nworld', 'hello\nworld');
    expect(stats).toEqual({ added: 0, deleted: 0 });
  });

  it('calculates added lines correctly', () => {
    const orig = 'line1\nline2';
    const mod = 'line1\nline2\nline3\nline4';
    const stats = computeDiffStats(orig, mod);
    expect(stats.added).toBe(2);
    expect(stats.deleted).toBe(0);
  });

  it('calculates deleted lines correctly', () => {
    const orig = 'line1\nline2\nline3';
    const mod = 'line1';
    const stats = computeDiffStats(orig, mod);
    expect(stats.added).toBe(0);
    expect(stats.deleted).toBe(2);
  });

  it('calculates both added and deleted lines when modified', () => {
    const orig = 'const a = 1;\nconsole.log(a);';
    const mod = 'const a = 2;\nconst b = 3;\nconsole.log(a, b);';
    const stats = computeDiffStats(orig, mod);
    expect(stats.added).toBe(3);
    expect(stats.deleted).toBe(2);
  });
});

