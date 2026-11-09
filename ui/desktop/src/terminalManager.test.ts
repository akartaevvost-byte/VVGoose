import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerminalManager } from './terminalManager';
import * as pty from 'node-pty';

vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}));

vi.mock('./loginShellPath', () => ({
  getLoginShellPath: vi.fn().mockResolvedValue('/usr/local/bin:/usr/bin:/bin'),
}));

describe('TerminalManager', () => {
  let manager: TerminalManager;
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new TerminalManager();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
  });

  it('determines the default shell per platform', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    process.env.SHELL = '/bin/zsh';
    expect(manager.getDefaultShell()).toBe('/bin/zsh');

    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.SHELL = '/bin/bash';
    expect(manager.getDefaultShell()).toBe('/bin/bash');

    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.COMSPEC = 'powershell.exe';
    expect(manager.getDefaultShell()).toBe('powershell.exe');
  });

  it('resolves environment variables with terminal capabilities and COLORFGBG', async () => {
    const defaultEnv = await manager.resolveEnvironment();
    expect(defaultEnv.TERM).toBe('xterm-256color');
    expect(defaultEnv.COLORTERM).toBe('truecolor');
    expect(defaultEnv.PATH).toBeDefined();

    const lightEnv = await manager.resolveEnvironment('light');
    expect(lightEnv.COLORFGBG).toBe('0;15');

    const darkEnv = await manager.resolveEnvironment('dark');
    expect(darkEnv.COLORFGBG).toBe('15;0');
  });

  it('spawns a PTY process and stores session', async () => {
    const mockPty = {
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    };
    vi.mocked(pty.spawn).mockReturnValue(mockPty as unknown as pty.IPty);

    const onData = vi.fn();
    const onExit = vi.fn();

    await manager.createTerminal(
      {
        id: 'term-1',
        cwd: process.cwd(),
        cols: 100,
        rows: 30,
      },
      onData,
      onExit
    );

    expect(pty.spawn).toHaveBeenCalled();
    expect(manager.hasSession('term-1')).toBe(true);
    expect(manager.getSessionCount()).toBe(1);

    // Test writing
    manager.write('term-1', 'echo hello\n');
    expect(mockPty.write).toHaveBeenCalledWith('echo hello\n');

    // Test resizing
    manager.resize('term-1', 120, 40);
    expect(mockPty.resize).toHaveBeenCalledWith(120, 40);

    // Test killing
    const killed = manager.kill('term-1');
    expect(killed).toBe(true);
    expect(mockPty.kill).toHaveBeenCalled();
    expect(manager.hasSession('term-1')).toBe(false);
  });

  it('kills all active sessions on killAll', async () => {
    const mockPty1 = { onData: vi.fn(), onExit: vi.fn(), kill: vi.fn() };
    const mockPty2 = { onData: vi.fn(), onExit: vi.fn(), kill: vi.fn() };

    vi.mocked(pty.spawn)
      .mockReturnValueOnce(mockPty1 as unknown as pty.IPty)
      .mockReturnValueOnce(mockPty2 as unknown as pty.IPty);

    await manager.createTerminal({ id: 'term-1' }, vi.fn(), vi.fn());
    await manager.createTerminal({ id: 'term-2' }, vi.fn(), vi.fn());

    expect(manager.getSessionCount()).toBe(2);

    manager.killAll();

    expect(mockPty1.kill).toHaveBeenCalled();
    expect(mockPty2.kill).toHaveBeenCalled();
    expect(manager.getSessionCount()).toBe(0);
  });

  it('gracefully awaits process exit on killAllAsync', async () => {
    let exitCb1: ((e: { exitCode: number }) => void) | undefined;
    let exitCb2: ((e: { exitCode: number }) => void) | undefined;

    const mockPty1 = {
      onData: vi.fn(),
      onExit: vi.fn((cb) => {
        exitCb1 = cb;
        return { dispose: vi.fn() };
      }),
      kill: vi.fn(() => {
        // Simulate asynchronous process death after kill
        setTimeout(() => exitCb1?.({ exitCode: 0 }), 10);
      }),
    };
    const mockPty2 = {
      onData: vi.fn(),
      onExit: vi.fn((cb) => {
        exitCb2 = cb;
        return { dispose: vi.fn() };
      }),
      kill: vi.fn(() => {
        setTimeout(() => exitCb2?.({ exitCode: 0 }), 10);
      }),
    };

    vi.mocked(pty.spawn)
      .mockReturnValueOnce(mockPty1 as unknown as pty.IPty)
      .mockReturnValueOnce(mockPty2 as unknown as pty.IPty);

    await manager.createTerminal({ id: 'term-1' }, vi.fn(), vi.fn());
    await manager.createTerminal({ id: 'term-2' }, vi.fn(), vi.fn());

    expect(manager.getSessionCount()).toBe(2);

    await manager.killAllAsync(100);

    expect(mockPty1.kill).toHaveBeenCalled();
    expect(mockPty2.kill).toHaveBeenCalled();
    expect(manager.getSessionCount()).toBe(0);
  });

  it('disposes listeners when pty exits', async () => {
    const disposeData = vi.fn();
    const disposeExit = vi.fn();
    let exitCallback: ((e: { exitCode: number }) => void) | undefined;

    const mockPty = {
      onData: vi.fn().mockReturnValue({ dispose: disposeData }),
      onExit: vi.fn((cb) => {
        exitCallback = cb;
        return { dispose: disposeExit };
      }),
      kill: vi.fn(),
    };

    vi.mocked(pty.spawn).mockReturnValue(mockPty as unknown as pty.IPty);

    const onExit = vi.fn();
    await manager.createTerminal({ id: 'term-exit' }, vi.fn(), onExit);

    expect(manager.hasSession('term-exit')).toBe(true);

    // Trigger exit
    exitCallback?.({ exitCode: 130 });

    expect(onExit).toHaveBeenCalledWith(130);
    expect(disposeData).toHaveBeenCalled();
    expect(disposeExit).toHaveBeenCalled();
    expect(manager.hasSession('term-exit')).toBe(false);
  });
});
