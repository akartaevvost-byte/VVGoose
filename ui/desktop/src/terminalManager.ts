import * as pty from 'node-pty';
import { ipcMain, app, nativeTheme } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import log from './utils/logger';
import { getLoginShellPath } from './loginShellPath';
import type { TerminalCreateOptions } from './types/terminal';

interface PtySession {
  pty: pty.IPty;
  shell: string;
  cwd: string;
  disposables: Array<() => void>;
  exitPromise: Promise<number>;
  resolveExit: (code: number) => void;
  isKilled: boolean;
}

export class TerminalManager {
  private sessions = new Map<string, PtySession>();

  getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'powershell.exe';
    }
    return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  }

  getDefaultArgs(): string[] {
    if (process.platform === 'win32') {
      return [];
    }
    return ['-l'];
  }

  async resolveEnvironment(theme?: 'light' | 'dark'): Promise<Record<string, string>> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') {
        env[key] = value;
      }
    }

    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';

    const isDark =
      theme !== undefined
        ? theme === 'dark'
        : nativeTheme && 'shouldUseDarkColors' in nativeTheme
          ? nativeTheme.shouldUseDarkColors
          : false;
    env.COLORFGBG = isDark ? '15;0' : '0;15';

    try {
      const loginShellPath = await getLoginShellPath(log);
      if (loginShellPath && env.PATH) {
        const separator = process.platform === 'win32' ? ';' : ':';
        const combined = Array.from(
          new Set([...env.PATH.split(separator), ...loginShellPath.split(separator)])
        )
          .filter(Boolean)
          .join(separator);
        env.PATH = combined;
      } else if (loginShellPath) {
        env.PATH = loginShellPath;
      }
    } catch (err) {
      log.warn('Failed to resolve login shell PATH for terminal:', err);
    }

    return env;
  }

  async createTerminal(
    options: TerminalCreateOptions,
    onData: (data: string) => void,
    onExit: (exitCode: number) => void
  ): Promise<void> {
    const { id, cols = 80, rows = 24 } = options;

    if (this.sessions.has(id)) {
      this.kill(id);
    }

    const shell = options.shell || this.getDefaultShell();
    const args = this.getDefaultArgs();

    let cwd = options.cwd;
    if (!cwd || !fs.existsSync(cwd)) {
      cwd = os.homedir();
    }

    const env = await this.resolveEnvironment(options.theme);

    try {
      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: Math.max(cols, 10),
        rows: Math.max(rows, 5),
        cwd,
        env,
      });

      let resolveExit!: (code: number) => void;
      const exitPromise = new Promise<number>((resolve) => {
        resolveExit = resolve;
      });

      const disposables: Array<() => void> = [];

      const dataDisposable = ptyProcess.onData((data: string) => {
        try {
          onData(data);
        } catch (err) {
          log.warn(`Error handling data for terminal ${id}:`, err);
        }
      });
      if (dataDisposable && typeof dataDisposable.dispose === 'function') {
        disposables.push(() => {
          try {
            dataDisposable.dispose();
          } catch {
            // Ignore disposal errors
          }
        });
      }

      const exitDisposable = ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        try {
          resolveExit(exitCode);
          this.sessions.delete(id);
          onExit(exitCode);
        } catch (err) {
          log.warn(`Error handling exit for terminal ${id}:`, err);
        } finally {
          for (const dispose of disposables) {
            try {
              dispose();
            } catch {
              // Ignore disposal errors
            }
          }
        }
      });
      if (exitDisposable && typeof exitDisposable.dispose === 'function') {
        disposables.push(() => {
          try {
            exitDisposable.dispose();
          } catch {
            // Ignore disposal errors
          }
        });
      }

      this.sessions.set(id, {
        pty: ptyProcess,
        shell,
        cwd,
        disposables,
        exitPromise,
        resolveExit,
        isKilled: false,
      });
    } catch (error) {
      log.error(`Failed to spawn terminal process for session ${id}:`, error);
      throw error;
    }
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session) {
      try {
        session.pty.write(data);
      } catch (err) {
        log.error(`Failed to write to terminal session ${id}:`, err);
      }
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (session && cols > 0 && rows > 0) {
      try {
        session.pty.resize(Math.max(cols, 10), Math.max(rows, 5));
      } catch (err) {
        log.error(`Failed to resize terminal session ${id}:`, err);
      }
    }
  }

  kill(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.isKilled = true;
      try {
        session.pty.kill();
      } catch (err) {
        log.error(`Failed to kill terminal session ${id}:`, err);
      } finally {
        this.sessions.delete(id);
        for (const dispose of session.disposables) {
          try {
            dispose();
          } catch {
            // Ignore
          }
        }
      }
      return true;
    }
    return false;
  }

  async killAsync(id: string, timeoutMs: number = 300): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    session.isKilled = true;
    try {
      session.pty.kill();
    } catch (err) {
      log.warn(`Failed initial kill for terminal session ${id}:`, err);
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), Math.min(timeoutMs, 150));
    });

    const exited = await Promise.race([session.exitPromise.then(() => true), timeoutPromise]);
    if (timer) clearTimeout(timer);

    if (!exited && process.platform !== 'win32') {
      try {
        session.pty.kill('SIGKILL');
      } catch {
        // Ignore if already dead
      }

      let killTimer: ReturnType<typeof setTimeout> | null = null;
      const killTimeoutPromise = new Promise<boolean>((resolve) => {
        killTimer = setTimeout(() => resolve(false), timeoutMs);
      });
      await Promise.race([session.exitPromise.then(() => true), killTimeoutPromise]);
      if (killTimer) clearTimeout(killTimer);
    }

    this.sessions.delete(id);
    for (const dispose of session.disposables) {
      try {
        dispose();
      } catch {
        // Ignore
      }
    }
  }

  killAll(): void {
    for (const [id, session] of this.sessions.entries()) {
      session.isKilled = true;
      try {
        if (process.platform !== 'win32') {
          session.pty.kill('SIGKILL');
        } else {
          session.pty.kill();
        }
      } catch (err) {
        log.error(`Failed to kill terminal session ${id} during cleanup:`, err);
      }
      for (const dispose of session.disposables) {
        try {
          dispose();
        } catch {
          // Ignore
        }
      }
    }
    this.sessions.clear();
  }

  async killAllAsync(timeoutMs: number = 500): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    if (sessionIds.length === 0) return;

    log.info(`Tearing down ${sessionIds.length} active terminal session(s)...`);
    await Promise.allSettled(sessionIds.map((id) => this.killAsync(id, timeoutMs)));
    this.sessions.clear();
  }

  hasSession(id: string): boolean {
    return this.sessions.has(id);
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}

export const terminalManager = new TerminalManager();

let handlersRegistered = false;

export function registerTerminalIpcHandlers(manager: TerminalManager = terminalManager): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle('terminal:create', async (event, options: TerminalCreateOptions) => {
    const webContents = event.sender;
    const sessionId = options.id;

    const onWebContentsDestroyed = () => {
      manager.kill(sessionId);
    };
    webContents.once('destroyed', onWebContentsDestroyed);

    await manager.createTerminal(
      options,
      (data) => {
        try {
          if (!webContents.isDestroyed()) {
            webContents.send(`terminal:data:${sessionId}`, data);
          }
        } catch {
          // Ignore send errors if webContents is in teardown
        }
      },
      (exitCode) => {
        webContents.removeListener('destroyed', onWebContentsDestroyed);
        try {
          if (!webContents.isDestroyed()) {
            webContents.send(`terminal:exit:${sessionId}`, exitCode);
          }
        } catch {
          // Ignore send errors if webContents is in teardown
        }
      }
    );
    return { success: true };
  });

  ipcMain.on('terminal:data', (_event, id: string, data: string) => {
    manager.write(id, data);
  });

  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    manager.resize(id, cols, rows);
  });

  ipcMain.handle('terminal:kill', (_event, id: string) => {
    return manager.kill(id);
  });

  let isQuitting = false;
  app.on('before-quit', (event) => {
    if (isQuitting) return;
    if (manager.getSessionCount() > 0) {
      event.preventDefault();
      isQuitting = true;
      manager
        .killAllAsync(500)
        .catch((err) => {
          log.error('Error during terminal manager killAllAsync:', err);
        })
        .finally(() => {
          app.quit();
        });
    }
  });
}
