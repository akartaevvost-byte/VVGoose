import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalProvider, useTerminal, DEFAULT_TERMINAL_HEIGHT } from './TerminalContext';

vi.mock('./WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspacePath: '/mock/workspace/path',
    workspaceFolders: [{ path: '/mock/workspace/path', name: 'path' }],
    setIsChatVisible: vi.fn(),
  }),
}));

describe('TerminalContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TerminalProvider>{children}</TerminalProvider>
  );

  beforeEach(() => {
    localStorage.clear();
    window.electron = {
      ...(window.electron || {}),
      terminalCreate: vi.fn().mockResolvedValue({ success: true }),
      terminalKill: vi.fn().mockResolvedValue(true),
      terminalData: vi.fn(),
      terminalResize: vi.fn(),
      onTerminalData: vi.fn(() => () => {}),
      onTerminalExit: vi.fn(() => () => {}),
    } as unknown as typeof window.electron;
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.activeTerminalId).toBeNull();
    expect(result.current.activeSession).toBeNull();
    expect(result.current.isTerminalVisible).toBe(false);
    expect(result.current.terminalHeight).toBe(DEFAULT_TERMINAL_HEIGHT);
    expect(result.current.isMaximized).toBe(false);
  });

  it('creates a new terminal session and sets it active', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    let id = '';
    act(() => {
      id = result.current.createTerminal();
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe(id);
    expect(result.current.sessions[0].title).toBe('Terminal 1');
    expect(result.current.sessions[0].cwd).toBe('/mock/workspace/path');
    expect(result.current.sessions[0].isRunning).toBe(true);
    expect(result.current.activeTerminalId).toBe(id);
    expect(result.current.isTerminalVisible).toBe(true);
    expect(window.electron.terminalCreate).toHaveBeenCalledWith({
      id,
      cwd: '/mock/workspace/path',
    });
  });

  it('creates multiple terminals and switches active tab', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    let id1 = '';
    let id2 = '';
    act(() => {
      id1 = result.current.createTerminal();
    });
    act(() => {
      id2 = result.current.createTerminal('/custom/dir');
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[1].cwd).toBe('/custom/dir');
    expect(result.current.activeTerminalId).toBe(id2);

    act(() => {
      result.current.setActiveTerminalId(id1);
    });

    expect(result.current.activeTerminalId).toBe(id1);
    expect(result.current.activeSession?.id).toBe(id1);
  });

  it('closes a terminal and updates active terminal correctly', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    let id1 = '';
    let id2 = '';
    act(() => {
      id1 = result.current.createTerminal();
      id2 = result.current.createTerminal();
    });

    expect(result.current.activeTerminalId).toBe(id2);

    act(() => {
      result.current.closeTerminal(id2);
    });

    expect(window.electron.terminalKill).toHaveBeenCalledWith(id2);
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeTerminalId).toBe(id1);
  });

  it('updates session exit code', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    let id = '';
    act(() => {
      id = result.current.createTerminal();
    });

    act(() => {
      result.current.updateSessionExitCode(id, 0);
    });

    expect(result.current.sessions[0].exitCode).toBe(0);
    expect(result.current.sessions[0].isRunning).toBe(false);
  });

  it('toggles visibility and maximize state', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    expect(result.current.isTerminalVisible).toBe(false);

    act(() => {
      result.current.toggleTerminal();
    });

    expect(result.current.isTerminalVisible).toBe(true);

    act(() => {
      result.current.toggleMaximize();
    });

    expect(result.current.isMaximized).toBe(true);

    act(() => {
      result.current.toggleMaximize();
    });

    expect(result.current.isMaximized).toBe(false);
  });

  it('resizes terminal height and persists to localStorage', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    act(() => {
      result.current.setTerminalHeight(350);
    });

    expect(result.current.terminalHeight).toBe(350);
    expect(localStorage.getItem('terminal_height')).toBe('350');
  });

  it('sends data to active terminal on runCommand', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    let id = '';
    act(() => {
      id = result.current.createTerminal();
    });

    act(() => {
      result.current.runCommand('ls -la');
    });

    expect(window.electron.terminalData).toHaveBeenCalledWith(id, 'ls -la\n');
  });

  it('dispatches goose:append-to-chat on sendToChat', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });
    const eventSpy = vi.fn();
    window.addEventListener('goose:append-to-chat', eventSpy);

    act(() => {
      result.current.sendToChat('error in test.ts');
    });

    expect(eventSpy).toHaveBeenCalled();
    const event = eventSpy.mock.calls[0][0] as CustomEvent;
    expect(event.detail.text).toContain('error in test.ts');

    window.removeEventListener('goose:append-to-chat', eventSpy);
  });
});
