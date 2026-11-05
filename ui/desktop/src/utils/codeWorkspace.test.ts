import { describe, expect, it } from 'vitest';
import { parseCodeWorkspace } from './codeWorkspace';

describe('parseCodeWorkspace', () => {
  it('parses dot folder path relative to workspace file directory', () => {
    const json = JSON.stringify({
      folders: [{ path: '.' }],
      settings: {},
    });

    const result = parseCodeWorkspace(json, '/Users/developer/projects/app.code-workspace');
    expect(result).not.toBeNull();
    expect(result?.rootPath).toBe('/Users/developer/projects');
    expect(result?.name).toBe('app');
  });

  it('parses relative subfolder paths', () => {
    const json = JSON.stringify({
      folders: [{ path: 'frontend', name: 'Web Client' }],
    });

    const result = parseCodeWorkspace(json, '/Users/developer/workspace.code-workspace');
    expect(result).not.toBeNull();
    expect(result?.rootPath).toBe('/Users/developer/frontend');
    expect(result?.name).toBe('Web Client');
  });

  it('parses absolute folder paths', () => {
    const json = JSON.stringify({
      folders: [{ path: '/var/www/site' }],
    });

    const result = parseCodeWorkspace(json, '/Users/developer/site.code-workspace');
    expect(result).not.toBeNull();
    expect(result?.rootPath).toBe('/var/www/site');
  });

  it('returns null for invalid JSON or empty folders', () => {
    expect(parseCodeWorkspace('not json', '/path/test.code-workspace')).toBeNull();
    expect(
      parseCodeWorkspace(JSON.stringify({ folders: [] }), '/path/test.code-workspace')
    ).toBeNull();
  });
});
