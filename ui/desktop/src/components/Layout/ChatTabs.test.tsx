/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppEvents } from '../../constants/events';
import { ChatTabs } from './ChatTabs';

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

vi.mock('../../acp/chatSessionStore', () => ({
  useAcpChatSessionSnapshot: (sessionId: string) => ({
    session: { name: sessionId, user_set_name: true },
  }),
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
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    router.pathname = '/pair';
    router.searchParams = new URLSearchParams('resumeSessionId=chat-1');
    router.navigate.mockReset();
  });

  it('shows open chats and scrolls them with the same side buttons as the editor', () => {
    const readScrollLeft = mockStripSize({ client: 100, scroll: 500 });
    render(<ChatTabs sessionIds={['chat-1', 'chat-2', 'chat-3', 'chat-4']} />);

    expect(screen.getByText('chat-1')).toBeTruthy();
    expect(screen.getByText('chat-2')).toBeTruthy();
    const scroller = screen.getByTestId('chat-tabs-scroller');
    expect(scroller.className).toContain('overflow-x-hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Следующие чаты' }));
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
});
