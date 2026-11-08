import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalTabs } from './TerminalTabs';
import { useTerminal } from '../../contexts/TerminalContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';

vi.mock('../../contexts/TerminalContext', () => ({
  useTerminal: vi.fn(),
}));

vi.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspace: vi.fn(),
}));

describe('TerminalTabs', () => {
  const mockCreateTerminal = vi.fn();
  const mockCloseTerminal = vi.fn();
  const mockSetActiveTerminalId = vi.fn();
  const mockToggleMaximize = vi.fn();
  const mockClearActiveTerminal = vi.fn();
  const mockSendToChat = vi.fn();
  const mockSetIsTerminalVisible = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWorkspace).mockReturnValue({
      workspaceFolders: [{ path: '/test/workspace', name: 'workspace' }],
    } as ReturnType<typeof useWorkspace>);
    vi.mocked(useTerminal).mockReturnValue({
      sessions: [
        {
          id: 'term-1',
          title: 'Terminal 1',
          cwd: '/test/workspace',
          exitCode: null,
          isRunning: true,
          createdAt: 1000,
        },
        {
          id: 'term-2',
          title: 'Terminal 2',
          cwd: '/test/workspace',
          exitCode: 0,
          isRunning: false,
          createdAt: 2000,
        },
      ],
      activeTerminalId: 'term-1',
      activeSession: null,
      isTerminalVisible: true,
      terminalHeight: 260,
      setTerminalHeight: vi.fn(),
      runCommand: vi.fn(),
      registerClearHandler: vi.fn(),
      updateSessionExitCode: vi.fn(),
      setActiveTerminalId: mockSetActiveTerminalId,
      createTerminal: mockCreateTerminal,
      closeTerminal: mockCloseTerminal,
      isMaximized: false,
      toggleMaximize: mockToggleMaximize,
      clearActiveTerminal: mockClearActiveTerminal,
      sendToChat: mockSendToChat,
      setIsTerminalVisible: mockSetIsTerminalVisible,
      toggleTerminal: vi.fn(),
    });
  });

  it('renders terminal tabs with titles and exit status badge', () => {
    render(<TerminalTabs />);

    expect(screen.getByText('Terminal 1')).toBeDefined();
    expect(screen.getByText('Terminal 2')).toBeDefined();
    expect(screen.getByText('0')).toBeDefined();
  });

  it('switches active tab when clicked', () => {
    render(<TerminalTabs />);

    fireEvent.click(screen.getByText('Terminal 2'));
    expect(mockSetActiveTerminalId).toHaveBeenCalledWith('term-2');
  });

  it('closes a terminal tab when close button is clicked', () => {
    render(<TerminalTabs />);

    const closeButtons = screen.getAllByTitle('Close Terminal');
    expect(closeButtons).toHaveLength(2);

    fireEvent.click(closeButtons[0]);
    expect(mockCloseTerminal).toHaveBeenCalledWith('term-1');
  });

  it('calls createTerminal when New Terminal button is clicked', () => {
    render(<TerminalTabs />);

    const newBtn = screen.getByTitle('New Terminal');
    fireEvent.click(newBtn);
    expect(mockCreateTerminal).toHaveBeenCalled();
  });

  it('triggers sendToChat when Ask Goose button is clicked', () => {
    render(<TerminalTabs />);

    const askGooseBtn = screen.getByTitle('Debug with Goose (Send output to Chat)');
    fireEvent.click(askGooseBtn);
    expect(mockSendToChat).toHaveBeenCalled();
  });

  it('triggers clearActiveTerminal when Clear button is clicked', () => {
    render(<TerminalTabs />);

    const clearBtn = screen.getByTitle('Clear Buffer');
    fireEvent.click(clearBtn);
    expect(mockClearActiveTerminal).toHaveBeenCalled();
  });

  it('toggles maximize when Maximize button is clicked', () => {
    render(<TerminalTabs />);

    const maxBtn = screen.getByTitle('Maximize Panel');
    fireEvent.click(maxBtn);
    expect(mockToggleMaximize).toHaveBeenCalled();
  });

  it('closes panel when chevron close button is clicked', () => {
    render(<TerminalTabs />);

    const closePanelBtn = screen.getByTitle('Close Terminal Panel');
    fireEvent.click(closePanelBtn);
    expect(mockSetIsTerminalVisible).toHaveBeenCalledWith(false);
  });
});
