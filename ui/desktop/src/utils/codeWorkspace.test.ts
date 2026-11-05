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

  it('parses JSONC with single-line, block comments and trailing commas', () => {
    const jsonc = `
      {
        // This is a comment about folders
        "folders": [
          /* Multi-line
             comment */
          {
            "path": "src",
            "name": "App Source",
          }, // trailing comma
        ],
        "settings": {
          "editor.tabSize": 2,
        },
      }
    `;

    const result = parseCodeWorkspace(jsonc, '/Users/developer/project/workspace.code-workspace');
    expect(result).not.toBeNull();
    expect(result?.rootPath).toBe('/Users/developer/project/src');
    expect(result?.name).toBe('App Source');
  });

  it('handles Windows backslash file paths properly', () => {
    const json = JSON.stringify({
      folders: [{ path: 'backend' }],
    });

    const result = parseCodeWorkspace(json, 'C:\\Users\\developer\\project\\app.code-workspace');
    expect(result).not.toBeNull();
    expect(result?.rootPath).toBe('C:/Users/developer/project/backend');
  });

  it('parses multiple folders in a multi-root workspace', () => {
    const json = JSON.stringify({
      folders: [
        { path: 'services/auth', name: 'Auth Service' },
        { path: 'services/billing', name: 'Billing Service' },
        { path: '/external/shared-lib' },
      ],
    });

    const result = parseCodeWorkspace(json, '/Users/developer/mono/repo.code-workspace');
    expect(result).not.toBeNull();
    expect(result?.folders.length).toBe(3);
    expect(result?.folders[0]).toEqual({
      path: '/Users/developer/mono/services/auth',
      name: 'Auth Service',
    });
    expect(result?.folders[1]).toEqual({
      path: '/Users/developer/mono/services/billing',
      name: 'Billing Service',
    });
    expect(result?.folders[2]).toEqual({
      path: '/external/shared-lib',
      name: 'shared-lib',
    });
  });
});
