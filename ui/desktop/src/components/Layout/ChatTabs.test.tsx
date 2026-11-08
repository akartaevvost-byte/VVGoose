/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppEvents } from '../../constants/events';
import { ChatTabs, ChatTabStatusIndicator } from './ChatTabs';
import { ChatState } from '../../types/chatState';

const mockCreateSession = vi.fn(async (dir?: string, _opts?: unknown) => ({
  id: 'new-session-123',
  name: 'New Chat',
  working_dir: dir || '/default/working/dir',
}));

vi.mock('../../sessions', () => ({
  createSession: (dir?: string, opts?: unknown) => mockCreateSession(dir, opts),
  getSessionDisplayName: vi.fn((session: { name?: string }) => session.name || 'Чат'),
}));

vi.mock('../../utils/workingDir', () => ({
  getEffectiveWorkingDir: vi.fn(async (inherited?: string) => inherited || '/default/working/dir'),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const router = vi.hoisted(() => ({
  pathname: '/pair',
  searchParams: new URLSearchParams('resumeSessionId=chat-1'),
  navigate: vi.fn(),
}));

vi.mock('react-router', () => ({
  useNavigate: () => router.navigate,
  useLocation: () => ({ pathname: router.pathname }),
  useSearchParams: () => [router.searchParams, vi.fn()],
}));

const sessionSnapshots = vi.hoisted(
  () =>
    new Map<
      string,
      {
        session?: { name?: string; user_set_name?: boolean; working_dir?: string };
        chatState?: ChatState;
        isProcessing?: boolean;
        isWaitingForInput?: boolean;
        hasPendingUserInput?: boolean;
        hasError?: boolean;
        sessionLoadError?: string;
        unreadCompleted?: boolean;
        status?: string;
      }
    >()
);

vi.mock('../../acp/chatSessionStore', () => ({
  acpChatSessionStore: {
    getSnapshot: vi.fn(
      (sessionId: string) =>
        sessionSnapshots.get(sessionId) ?? {
          session: { name: sessionId, user_set_name: true, working_dir: '/default/working/dir' },
        }
    ),
  },
  acpChatSessionActions: {
    markSessionRead: vi.fn(),
    setUnreadCompleted: vi.fn(),
  },
  setActiveSessionId: vi.fn(),
  getActiveSessionId: vi.fn(() => null),
  useAcpChatSessionSnapshot: (sessionId: string) =>
    sessionSnapshots.get(sessionId) ?? {
      session: { name: sessionId, user_set_name: true },
    },
}));

function mockStripSize(size: { client: number; scroll: number }) {
  let scrollLeft = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(size.client);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(size.scroll);
  vi.spyOn(HTMLElement.prototype, 'scrollLeft', 'get').mockImplementation(() => scrollLeft);
  vi.spyOn(HTMLElement.prototype, 'scrollLeft', 'set').mockImplementation(((value: number) => {
    scrollLeft = value;
  }) as (value: number) => void);
  return () => scrollLeft;
}

describe('ChatTabs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionSnapshots.clear();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    (window as unknown as { electron: Record<string, unknown> }).electron = {
      platform: 'darwin',
    };
    router.pathname = '/pair';
    router.searchParams = new URLSearchParams('resumeSessionId=chat-1');
    router.navigate.mockReset();
  });

  it('shows open chats and scrolls them with the same side buttons as the editor', () => {
    const readScrollLeft = mockStripSize({ client: 100, scroll: 500 });
    const view = render(<ChatTabs sessionIds={['chat-1', 'chat-2', 'chat-3', 'chat-4']} />);

    expect(screen.getByText('chat-1')).toBeTruthy();
    expect(screen.getByText('chat-2')).toBeTruthy();
    const scroller = screen.getByTestId('chat-tabs-scroller');
    expect(scroller.className).toContain('overflow-x-hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Следующие чаты' }));
    expect(readScrollLeft()).toBe(120);
    view.rerender(<ChatTabs sessionIds={['chat-1', 'chat-2', 'chat-3', 'chat-4']} />);
    expect(readScrollLeft()).toBe(120);
    expect(screen.getByRole('button', { name: 'Предыдущие чаты' })).toHaveProperty(
      'disabled',
      false
    );
  });

  it('closes a background chat tab without deleting it', () => {
    mockStripSize({ client: 400, scroll: 200 });
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    render(<ChatTabs sessionIds={['chat-1', 'chat-2']} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть чат' })[1]);

    const event = dispatch.mock.calls
      .map(([value]) => value)
      .find((value) => value instanceof CustomEvent && value.type === AppEvents.CHAT_TAB_CLOSED);
    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent).detail).toEqual({ sessionId: 'chat-2' });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('leaves the closed current chat only after another chat is shown', () => {
    mockStripSize({ client: 400, scroll: 200 });
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const view = render(<ChatTabs sessionIds={['chat-1', 'chat-2']} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть чат' })[0]);
    expect(router.navigate).toHaveBeenCalledWith('/pair?resumeSessionId=chat-2');
    expect(
      dispatch.mock.calls.some(
        ([value]) => value instanceof CustomEvent && value.type === AppEvents.CHAT_TAB_CLOSED
      )
    ).toBe(false);

    router.searchParams = new URLSearchParams('resumeSessionId=chat-2');
    view.rerender(<ChatTabs sessionIds={['chat-1', 'chat-2']} />);

    const event = dispatch.mock.calls
      .map(([value]) => value)
      .find((value) => value instanceof CustomEvent && value.type === AppEvents.CHAT_TAB_CLOSED);
    expect((event as CustomEvent).detail).toEqual({ sessionId: 'chat-1' });
  });

  it('renders the "+" button with correct accessibility label and macOS tooltip', () => {
    (window as unknown as { electron: Record<string, unknown> }).electron = {
      platform: 'darwin',
    };
    render(<ChatTabs sessionIds={['chat-1']} />);
    const addButton = screen.getByRole('button', { name: 'Новый чат' });
    expect(addButton).toBeTruthy();
    expect(addButton.getAttribute('title')).toBe('Новый чат (⌘T)');
  });

  it('renders the "+" button with Windows/Linux tooltip on win32', () => {
    (window as unknown as { electron: Record<string, unknown> }).electron = {
      platform: 'win32',
    };
    render(<ChatTabs sessionIds={['chat-1']} />);
    const addButton = screen.getByRole('button', { name: 'Новый чат' });
    expect(addButton.getAttribute('title')).toBe('Новый чат (Ctrl+T)');
  });

  it('creates a new session and navigates to it when "+" is clicked on /pair', async () => {
    sessionSnapshots.set('chat-1', {
      session: { name: 'chat-1', working_dir: '/test/repo' },
    });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<ChatTabs sessionIds={['chat-1', 'chat-2']} />);
    const addButton = screen.getByRole('button', { name: 'Новый чат' });
    await act(async () => {
      fireEvent.click(addButton);
    });

    expect(mockCreateSession).toHaveBeenCalledWith('/test/repo', undefined);
    expect(router.navigate).toHaveBeenCalledWith('/pair?resumeSessionId=new-session-123');

    const addEvent = dispatchSpy.mock.calls
      .map(([value]) => value)
      .find((value) => value instanceof CustomEvent && value.type === AppEvents.ADD_ACTIVE_SESSION);
    expect(addEvent).toBeInstanceOf(CustomEvent);
    expect((addEvent as CustomEvent).detail).toEqual({ sessionId: 'new-session-123' });
  });

  it('creates a new session and navigates to it when "+" is clicked while on "/"', async () => {
    router.pathname = '/';
    router.searchParams = new URLSearchParams('');
    render(<ChatTabs sessionIds={['chat-1']} />);
    const addButton = screen.getByRole('button', { name: 'Новый чат' });
    await act(async () => {
      fireEvent.click(addButton);
    });

    expect(mockCreateSession).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/pair?resumeSessionId=new-session-123');
  });

  it('creates a new session and navigates when "chat:open-new-tab" event is dispatched', async () => {
    render(<ChatTabs sessionIds={['chat-1']} />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('chat:open-new-tab'));
    });
    expect(mockCreateSession).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/pair?resumeSessionId=new-session-123');
  });

  it('renders active "Новый чат" tab on "/" route alongside open sessions', () => {
    router.pathname = '/';
    router.searchParams = new URLSearchParams('');
    render(<ChatTabs sessionIds={['chat-1', 'chat-2']} />);

    const newChatTab = screen.getByText('Новый чат').closest('[data-tab]');
    expect(newChatTab).toBeTruthy();
    expect(newChatTab?.getAttribute('data-active')).toBe('true');
    expect(screen.getByText('chat-1')).toBeTruthy();
    expect(screen.getByText('chat-2')).toBeTruthy();

    const closeNewChatBtn = screen.getByRole('button', { name: 'Закрыть новый чат' });
    expect(closeNewChatBtn).toBeTruthy();
  });

  it('navigates to the last open session when closing "Новый чат" tab on "/"', () => {
    router.pathname = '/';
    router.searchParams = new URLSearchParams('');
    render(<ChatTabs sessionIds={['chat-1', 'chat-2']} />);

    const closeNewChatBtn = screen.getByRole('button', { name: 'Закрыть новый чат' });
    fireEvent.click(closeNewChatBtn);

    expect(router.navigate).toHaveBeenCalledWith('/pair?resumeSessionId=chat-2');
  });

  it('focuses input when clicking the "Новый чат" tab body on "/"', () => {
    router.pathname = '/';
    router.searchParams = new URLSearchParams('');
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    const focusSpy = vi.spyOn(input, 'focus');

    try {
      render(<ChatTabs sessionIds={['chat-1']} />);
      const newChatTab = screen.getByText('Новый чат').closest('[data-tab]')!;
      fireEvent.click(newChatTab);

      expect(focusSpy).toHaveBeenCalled();
    } finally {
      document.body.removeChild(input);
    }
  });

  it('navigates to the last session on middle click (auxClick) on "Новый чат" tab', () => {
    router.pathname = '/';
    router.searchParams = new URLSearchParams('');
    render(<ChatTabs sessionIds={['chat-1', 'chat-2']} />);

    const newChatTab = screen.getByText('Новый чат').closest('[data-tab]')!;
    fireEvent(
      newChatTab,
      new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true })
    );

    expect(router.navigate).toHaveBeenCalledWith('/pair?resumeSessionId=chat-2');
  });

  it('does not return null on "/" when sessionIds is empty, displaying "Новый чат" and "+"', () => {
    router.pathname = '/';
    router.searchParams = new URLSearchParams('');
    const { container } = render(<ChatTabs sessionIds={[]} />);

    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('Новый чат')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Новый чат' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Закрыть новый чат' })).toBeNull();
  });

  it('returns null on "/pair" when sessionIds is empty', () => {
    router.pathname = '/pair';
    router.searchParams = new URLSearchParams('');
    const { container } = render(<ChatTabs sessionIds={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('navigates to "/" when closing the only open tab', () => {
    render(<ChatTabs sessionIds={['chat-1']} />);
    const closeBtn = screen.getByRole('button', { name: 'Закрыть чат' });
    fireEvent.click(closeBtn);
    expect(router.navigate).toHaveBeenCalledWith('/');
  });

  describe('ChatTabStatusIndicator', () => {
    it('displays animated spinner/processing indicator when thinking or streaming', () => {
      sessionSnapshots.set('chat-1', {
        session: { name: 'chat-1' },
        chatState: ChatState.Streaming,
        isProcessing: true,
      });

      render(<ChatTabStatusIndicator sessionId="chat-1" isActive={false} />);
      expect(screen.getByTestId('status-processing')).toBeTruthy();
    });

    it('displays amber badge when waiting for user input', () => {
      sessionSnapshots.set('chat-1', {
        session: { name: 'chat-1' },
        chatState: ChatState.WaitingForUserInput,
        isWaitingForInput: true,
        hasPendingUserInput: true,
      });

      render(<ChatTabStatusIndicator sessionId="chat-1" isActive={false} />);
      expect(screen.getByTestId('status-waiting-input')).toBeTruthy();
    });

    it('displays red dot on error', () => {
      sessionSnapshots.set('chat-1', {
        session: { name: 'chat-1' },
        hasError: true,
        sessionLoadError: 'Network failed',
      });

      render(<ChatTabStatusIndicator sessionId="chat-1" isActive={false} />);
      expect(screen.getByTestId('status-error')).toBeTruthy();
    });

    it('displays green completion dot on inactive tabs and clears when active', () => {
      sessionSnapshots.set('chat-2', {
        session: { name: 'chat-2' },
        chatState: ChatState.Idle,
        unreadCompleted: true,
      });

      const { unmount } = render(<ChatTabStatusIndicator sessionId="chat-2" isActive={false} />);
      expect(screen.getByTestId('status-unread-completed')).toBeTruthy();
      unmount();

      render(<ChatTabStatusIndicator sessionId="chat-2" isActive={true} />);
      expect(screen.queryByTestId('status-unread-completed')).toBeNull();
    });

    it('renders status indicators inside ChatTabs for multiple concurrent tabs', () => {
      sessionSnapshots.set('chat-1', {
        session: { name: 'chat-1' },
        chatState: ChatState.Streaming,
        isProcessing: true,
      });
      sessionSnapshots.set('chat-2', {
        session: { name: 'chat-2' },
        chatState: ChatState.WaitingForUserInput,
        isWaitingForInput: true,
        hasPendingUserInput: true,
      });

      render(<ChatTabs sessionIds={['chat-1', 'chat-2']} />);
      expect(screen.getByTestId('status-processing')).toBeTruthy();
      expect(screen.getByTestId('status-waiting-input')).toBeTruthy();
    });
  });
});
