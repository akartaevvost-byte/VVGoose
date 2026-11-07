/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import { AppLayout } from './AppLayout';
import { ChatProvider } from '../../contexts/ChatContext';
import type { LiveVoiceController } from '../../liveVoice/useLiveVoice';

// Mock child components that have external dependencies
vi.mock('../ChatSessionsContainer', () => ({
  default: () => <div data-testid="chat-sessions-container">ChatSessionsContainer</div>,
}));

vi.mock('../Editor/EditorArea', () => ({
  EditorArea: () => <div data-testid="editor-area">EditorArea</div>,
}));

vi.mock('../FileExplorer/FileExplorer', () => ({
  FileExplorer: () => <div data-testid="file-explorer">FileExplorer</div>,
}));

vi.mock('./NavigationPanel', () => ({
  Navigation: () => <div data-testid="navigation-panel">Navigation</div>,
}));

describe('AppLayout 3-panel layout', () => {
  const mockLiveVoice: LiveVoiceController = {
    activeSessionId: null,
    liveVoiceSessionId: null,
    phase: 'idle',
    muted: false,
    start: vi.fn(),
    stop: vi.fn(),
    toggleMute: vi.fn(),
  };

  const mockChat = {
    sessionId: 'test-session',
    name: 'Test Chat',
    messages: [],
    recipe: null,
    recipeParameterValues: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    (window as unknown as { electron: Record<string, unknown> }).electron = {
      platform: 'darwin',
      getIsFullScreen: vi.fn().mockResolvedValue(false),
      on: vi.fn(),
      off: vi.fn(),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
    };
  });

  const renderWithProviders = (initialRoute = '/pair') => {
    return render(
      <IntlProvider locale="en" defaultLocale="en" messages={{}}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <ChatProvider chat={mockChat} setChat={vi.fn()} contextKey="test">
            <AppLayout activeSessions={[]} liveVoice={mockLiveVoice} />
          </ChatProvider>
        </MemoryRouter>
      </IntlProvider>
    );
  };

  it('renders chat on left, editor in center, and file explorer on right in pair route', () => {
    renderWithProviders('/pair');

    // All three panels must be rendered
    expect(screen.getByTestId('chat-sessions-container')).toBeDefined();
    expect(screen.getByTestId('editor-area')).toBeDefined();
    expect(screen.getByTestId('file-explorer')).toBeDefined();

    // Verify toggle buttons in header
    expect(screen.getByTitle('Toggle editor')).toBeDefined();
    expect(screen.getByTitle('Toggle File Explorer (⌘⇧E)')).toBeDefined();
  });

  it('toggles file explorer visibility using the header button', () => {
    renderWithProviders('/pair');

    expect(screen.getByTestId('file-explorer')).toBeDefined();

    const explorerToggle = screen.getByTitle('Toggle File Explorer (⌘⇧E)');
    fireEvent.click(explorerToggle);

    expect(screen.queryByTestId('file-explorer')).toBeNull();

    fireEvent.click(explorerToggle);
    expect(screen.getByTestId('file-explorer')).toBeDefined();
  });

  it('toggles editor visibility using the header button', () => {
    renderWithProviders('/pair');

    expect(screen.getByTestId('editor-area')).toBeDefined();

    const editorToggle = screen.getByTitle('Toggle editor');
    fireEvent.click(editorToggle);

    expect(screen.queryByTestId('editor-area')).toBeNull();

    fireEvent.click(editorToggle);
    expect(screen.getByTestId('editor-area')).toBeDefined();
  });

  it('keeps the file explorer pinned to the right edge when the editor is hidden', () => {
    renderWithProviders('/pair');

    const explorerWrapper = () =>
      screen.getByTestId('file-explorer').parentElement?.parentElement as HTMLElement;
    expect(explorerWrapper()?.className).toContain('ml-auto');

    fireEvent.click(screen.getByTitle('Toggle editor'));

    expect(screen.queryByTestId('editor-area')).toBeNull();
    // The explorer must stay anchored to the right window edge: it keeps its
    // fixed width instead of stretching towards the chat panel.
    const wrapper = explorerWrapper();
    expect(wrapper.className).toContain('ml-auto');
    expect(wrapper.style.width).not.toBe('100%');
  });

  it('toggles file explorer visibility using Cmd+Shift+E / Ctrl+Shift+E shortcut', () => {
    renderWithProviders('/pair');

    expect(screen.getByTestId('file-explorer')).toBeDefined();

    // Press Cmd+Shift+E (macOS)
    fireEvent.keyDown(window, { key: 'e', metaKey: true, shiftKey: true });
    expect(screen.queryByTestId('file-explorer')).toBeNull();

    // Press again to show
    fireEvent.keyDown(window, { key: 'E', metaKey: true, shiftKey: true });
    expect(screen.getByTestId('file-explorer')).toBeDefined();

    // Press Ctrl+Shift+E (Windows / Linux)
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true, shiftKey: true });
    expect(screen.queryByTestId('file-explorer')).toBeNull();

    fireEvent.keyDown(window, { key: 'E', ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId('file-explorer')).toBeDefined();
  });

  it('does not toggle file explorer shortcut when focus is in input or textarea', () => {
    renderWithProviders('/pair');

    expect(screen.getByTestId('file-explorer')).toBeDefined();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: 'e', metaKey: true, shiftKey: true });
    expect(screen.getByTestId('file-explorer')).toBeDefined();

    document.body.removeChild(input);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    fireEvent.keyDown(textarea, { key: 'e', metaKey: true, shiftKey: true });
    expect(screen.getByTestId('file-explorer')).toBeDefined();

    document.body.removeChild(textarea);
  });

  it('prevents default event behavior when toggle file explorer shortcut is pressed', () => {
    renderWithProviders('/pair');

    const event = new KeyboardEvent('keydown', {
      key: 'e',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('displays Ctrl+Shift+E shortcut in tooltip on non-macOS platforms', () => {
    (window as unknown as { electron: Record<string, unknown> }).electron = {
      platform: 'win32',
      getIsFullScreen: vi.fn().mockResolvedValue(false),
      on: vi.fn(),
      off: vi.fn(),
      workspaceStartWatching: vi.fn().mockResolvedValue(undefined),
      workspaceStopWatching: vi.fn().mockResolvedValue(undefined),
    };

    renderWithProviders('/pair');
    expect(screen.getByTitle('Toggle File Explorer (Ctrl+Shift+E)')).toBeDefined();
  });

  it('renders 3-panel workspace on root route ("Новый чат")', () => {
    renderWithProviders('/');

    expect(screen.getByTestId('editor-area')).toBeDefined();
    expect(screen.getByTestId('file-explorer')).toBeDefined();
    expect(screen.getByTitle('Toggle editor')).toBeDefined();
    expect(screen.getByTitle('Toggle File Explorer (⌘⇧E)')).toBeDefined();
  });

  it('toggles chat panel visibility using the message button in header', () => {
    renderWithProviders('/pair');

    const chatToggle = screen.getByTitle('Toggle chat (⌘J)');
    expect(chatToggle).toBeDefined();

    // Chat sessions container should be visible in main left panel initially
    const chatContainer = screen.getByTestId('chat-sessions-container');
    expect(chatContainer.parentElement?.parentElement?.style.display).not.toBe('none');

    // Click chat toggle to hide
    fireEvent.click(chatToggle);

    // Chat sessions container is preserved in hidden container to keep SSE alive
    const chatContainerHidden = screen.getByTestId('chat-sessions-container');
    expect(chatContainerHidden.parentElement?.className).toContain('hidden');

    // Click chat toggle again to restore
    fireEvent.click(chatToggle);
    const chatContainerRestored = screen.getByTestId('chat-sessions-container');
    expect(chatContainerRestored.parentElement?.parentElement?.style.display).not.toBe('none');
  });

  it('toggles chat visibility using Cmd+J shortcut', () => {
    renderWithProviders('/pair');

    // Press Cmd+J (macOS)
    fireEvent.keyDown(window, { key: 'j', metaKey: true });

    const chatContainerHidden = screen.getByTestId('chat-sessions-container');
    expect(chatContainerHidden.parentElement?.className).toContain('hidden');

    // Press again to show
    fireEvent.keyDown(window, { key: 'J', metaKey: true });
    const chatContainerRestored = screen.getByTestId('chat-sessions-container');
    expect(chatContainerRestored.parentElement?.parentElement?.style.display).not.toBe('none');
  });
});
