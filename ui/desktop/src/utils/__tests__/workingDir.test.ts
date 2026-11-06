import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getEffectiveWorkingDir,
  getInitialWorkingDir,
  resolveWorkingDir,
  setCurrentWindowWorkspacePath,
} from '../workingDir';

describe('getInitialWorkingDir', () => {
  const appConfigGetMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    setCurrentWindowWorkspacePath('');
    appConfigGetMock.mockReset();
    (globalThis as Record<string, unknown>).window = {
      appConfig: { get: appConfigGetMock },
    } as unknown as typeof globalThis;
  });

  it('prefers the live window workspace over the directory the window was opened with', () => {
    appConfigGetMock.mockImplementation((key: string) => {
      if (key === 'REQUEST_DIR') return '/command/line/dir';
      return undefined;
    });
    setCurrentWindowWorkspacePath('/projects/VVGoose');
    expect(getInitialWorkingDir()).toBe('/projects/VVGoose');
  });

  it('prefers REQUEST_DIR if present', () => {
    appConfigGetMock.mockImplementation((key: string) => {
      if (key === 'REQUEST_DIR') return '/command/line/dir';
      if (key === 'GOOSE_WORKING_DIR') return '/app/config/dir';
      return undefined;
    });
    localStorage.setItem('goose_workspace_path', '/saved/workspace');
    expect(getInitialWorkingDir()).toBe('/command/line/dir');
  });

  it('falls back to localStorage goose_workspace_path if REQUEST_DIR is absent', () => {
    appConfigGetMock.mockImplementation((key: string) => {
      if (key === 'GOOSE_WORKING_DIR') return '/app/config/dir';
      return undefined;
    });
    localStorage.setItem('goose_workspace_path', '/saved/workspace');
    expect(getInitialWorkingDir()).toBe('/saved/workspace');
  });

  it('falls back to GOOSE_WORKING_DIR if localStorage is empty', () => {
    appConfigGetMock.mockImplementation((key: string) => {
      if (key === 'GOOSE_WORKING_DIR') return '/app/config/dir';
      return undefined;
    });
    expect(getInitialWorkingDir()).toBe('/app/config/dir');
  });
});

describe('resolveWorkingDir', () => {
  it('uses the configured external backend directory when present', () => {
    expect(resolveWorkingDir(' /home/goose ', 'C:\\Users\\goose', 'C:\\Users\\goose')).toBe(
      '/home/goose'
    );
    expect(resolveWorkingDir(' ', 'C:\\work', 'C:\\Users\\goose')).toBe('C:\\work');
    expect(resolveWorkingDir(undefined, undefined, 'C:\\Users\\goose')).toBe('C:\\Users\\goose');
  });
});

describe('getEffectiveWorkingDir', () => {
  const getSettingMock = vi.fn();
  const appConfigGetMock = vi.fn();

  const mockWindow = (externalBackend: boolean, boundUrl: string, source = 'settings') => {
    appConfigGetMock.mockImplementation((key: string) => {
      if (key === 'GOOSE_EXTERNAL_BACKEND') return externalBackend;
      if (key === 'GOOSE_EXTERNAL_BACKEND_URL') return boundUrl;
      if (key === 'GOOSE_EXTERNAL_BACKEND_SOURCE') return source;
      if (key === 'GOOSE_WORKING_DIR') return '/Users/johannes/home/workspace';
      return undefined;
    });
  };

  beforeEach(() => {
    setCurrentWindowWorkspacePath('');
    getSettingMock.mockReset();
    appConfigGetMock.mockReset();
    (globalThis as Record<string, unknown>).window = {
      appConfig: { get: appConfigGetMock },
      electron: { getSetting: getSettingMock },
    } as unknown as typeof globalThis;
  });

  it('prefers the configured remote directory when bound to the matching external backend', async () => {
    mockWindow(true, 'http://remote:3000/');
    getSettingMock.mockResolvedValue({
      enabled: true,
      url: 'http://remote:3000',
      workingDir: ' /home/goose/workspace ',
    });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/home/goose/workspace');
    await expect(getEffectiveWorkingDir('/home/goose/previous-project')).resolves.toBe(
      '/home/goose/workspace'
    );
  });

  it('honors the configured remote directory for env-mode backends regardless of enabled/url', async () => {
    mockWindow(true, 'http://env-backend:3000', 'env');
    getSettingMock.mockResolvedValue({
      enabled: false,
      url: 'http://unrelated:4000',
      workingDir: '/home/goose/workspace',
    });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/home/goose/workspace');
  });

  it('falls back to the remembered directory for env-mode backends without a configured dir', async () => {
    mockWindow(true, 'http://env-backend:3000', 'env');
    getSettingMock.mockResolvedValue({ enabled: false, workingDir: '   ' });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });

  it('ignores the remote directory when the window is bound to the local backend', async () => {
    mockWindow(false, '');
    getSettingMock.mockResolvedValue({ enabled: true, workingDir: '/home/goose/workspace' });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
    await expect(getEffectiveWorkingDir('/projects/website')).resolves.toBe('/projects/website');
  });

  it('falls back to the remembered directory when the bound backend no longer matches settings', async () => {
    mockWindow(true, 'http://server-a:3000');
    getSettingMock.mockResolvedValue({
      enabled: true,
      url: 'http://server-b:3000',
      workingDir: '/home/goose/workspace',
    });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });

  it('falls back to the remembered directory when the external backend is disabled', async () => {
    mockWindow(true, 'http://remote:3000');
    getSettingMock.mockResolvedValue({ enabled: false, workingDir: '/home/goose/workspace' });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });

  it('falls back to the remembered directory when the remote directory is blank', async () => {
    mockWindow(true, 'http://remote:3000');
    getSettingMock.mockResolvedValue({ enabled: true, workingDir: '   ' });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });

  it('falls back to the remembered directory when the setting cannot be read', async () => {
    mockWindow(true, 'http://remote:3000');
    getSettingMock.mockRejectedValue(new Error('settings unavailable'));
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });

  it('uses lastOpenedWorkspace from electron settings when initial working dir is empty', async () => {
    mockWindow(false, '');
    appConfigGetMock.mockImplementation((key: string) => {
      if (key === 'GOOSE_WORKING_DIR') return '';
      return undefined;
    });
    localStorage.clear();
    getSettingMock.mockImplementation(async (key: string) => {
      if (key === 'lastOpenedWorkspace') {
        return { path: '/saved/from/electron/settings', type: 'folder' };
      }
      return null;
    });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/saved/from/electron/settings');
  });
});
