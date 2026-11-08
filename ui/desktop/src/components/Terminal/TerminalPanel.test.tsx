import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalPanel } from './TerminalPanel';
import { useTerminal } from '../../contexts/TerminalContext';

vi.mock('../../contexts/TerminalContext', () => ({
  useTerminal: vi.fn(),
}));

vi.mock('./TerminalTabs', () => ({
  TerminalTabs: () => <div data-testid="terminal-tabs" />,
}));

vi.mock('./TerminalInstance', () => ({
  TerminalInstance: ({ id, active }: { id: string; active: boolean }) => (
    <div data-testid={`terminal-instance-${id}`} data-active={active} />
  ),
}));

describe('TerminalPanel', () => {
  const mockCreateTerminal = vi.fn();
  const mockUpdateSessionExitCode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when there are no terminal sessions', () => {
    vi.mocked(useTerminal).mockReturnValue({
      sessions: [],
      activeTerminalId: null,
      activeSession: null,
      isTerminalVisible: true,
      terminalHeight: 260,
      isMaximized: false,
      closeTerminal: vi.fn(),
      setActiveTerminalId: vi.fn(),
      setIsTerminalVisible: vi.fn(),
      setTerminalHeight: vi.fn(),
      toggleTerminal: vi.fn(),
      toggleMaximize: vi.fn(),
      clearActiveTerminal: vi.fn(),
      sendToChat: vi.fn(),
      runCommand: vi.fn(),
      registerClearHandler: vi.fn(),
      createTerminal: mockCreateTerminal,
      updateSessionExitCode: mockUpdateSessionExitCode,
    });

    render(<TerminalPanel />);

    expect(screen.getByTestId('terminal-tabs')).toBeDefined();
    expect(screen.getByText('No active terminal sessions')).toBeDefined();

    const newBtn = screen.getByRole('button', { name: /New Terminal/i });
    fireEvent.click(newBtn);
    expect(mockCreateTerminal).toHaveBeenCalled();
  });

  it('renders terminal instances when sessions exist', () => {
    vi.mocked(useTerminal).mockReturnValue({
      sessions: [
        {
          id: 'session-1',
          title: 'Terminal 1',
          isRunning: true,
          createdAt: 1000,
        },
        {
          id: 'session-2',
          title: 'Terminal 2',
          isRunning: true,
          createdAt: 2000,
        },
      ],
      activeTerminalId: 'session-1',
      activeSession: null,
      isTerminalVisible: true,
      terminalHeight: 260,
      isMaximized: false,
      closeTerminal: vi.fn(),
      setActiveTerminalId: vi.fn(),
      setIsTerminalVisible: vi.fn(),
      setTerminalHeight: vi.fn(),
      toggleTerminal: vi.fn(),
      toggleMaximize: vi.fn(),
      clearActiveTerminal: vi.fn(),
      sendToChat: vi.fn(),
      runCommand: vi.fn(),
      registerClearHandler: vi.fn(),
      createTerminal: mockCreateTerminal,
      updateSessionExitCode: mockUpdateSessionExitCode,
    });

    render(<TerminalPanel />);

    expect(screen.getByTestId('terminal-tabs')).toBeDefined();
    const inst1 = screen.getByTestId('terminal-instance-session-1');
    const inst2 = screen.getByTestId('terminal-instance-session-2');

    expect(inst1).toBeDefined();
    expect(inst1.getAttribute('data-active')).toBe('true');
    expect(inst2).toBeDefined();
    expect(inst2.getAttribute('data-active')).toBe('false');
  });
});
