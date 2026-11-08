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

      ptyProcess.onData((data: string) => {
        onData(data);
      });

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        this.sessions.delete(id);
        onExit(exitCode);
      });

      this.sessions.set(id, {
        pty: ptyProcess,
        shell,
        cwd,
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
      try {
        session.pty.kill();
      } catch (err) {
        log.error(`Failed to kill terminal session ${id}:`, err);
      } finally {
        this.sessions.delete(id);
      }
      return true;
    }
    return false;
  }

  killAll(): void {
    for (const [id, session] of this.sessions.entries()) {
      try {
        session.pty.kill();
      } catch (err) {
        log.error(`Failed to kill terminal session ${id} during cleanup:`, err);
      }
    }
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
    await manager.createTerminal(
      options,
      (data) => {
        if (!webContents.isDestroyed()) {
          webContents.send(`terminal:data:${options.id}`, data);
        }
      },
      (exitCode) => {
        if (!webContents.isDestroyed()) {
          webContents.send(`terminal:exit:${options.id}`, exitCode);
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

  app.on('before-quit', () => {
    manager.killAll();
  });
}
