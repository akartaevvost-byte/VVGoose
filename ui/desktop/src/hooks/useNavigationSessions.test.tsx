import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const routerState = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: '/pair', search: routerState.searchParams.toString() }),
  useSearchParams: () => [routerState.searchParams, vi.fn()],
}));

vi.mock('../acp/sessions', () => ({
  acpGetSessionListItem: vi.fn(() => new Promise(() => {})),
  acpListRecentSessions: vi.fn().mockResolvedValue([]),
  acpListArchivedSessions: vi.fn().mockResolvedValue([]),
  acpArchiveSession: vi.fn().mockResolvedValue(undefined),
  acpUnarchiveSession: vi.fn().mockResolvedValue(undefined),
  acpDeleteSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../contexts/ChatContext', () => ({
  useChatContext: () => ({ chat: { sessionId: undefined } }),
}));

vi.mock('../acp/permissionRequests', () => ({
  cancelAcpPermissionRequestsForSession: vi.fn(),
}));

vi.mock('../acp/elicitationRequests', () => ({
  cancelAcpElicitationRequestsForSession: vi.fn(),
}));

vi.mock('../acp/chatSessionStore', () => ({
  acpChatSessionActions: { deleteSnapshot: vi.fn() },
}));

import {
  acpArchiveSession,
  acpGetSessionListItem,
  acpListArchivedSessions,
  acpListRecentSessions,
  acpUnarchiveSession,
} from '../acp/sessions';
import type { SessionListChange } from '../types/sessionListSync';
import { useNavigationSessions } from './useNavigationSessions';
import type { SessionListItem } from '../acp/sessions';

const injectedSessionId = 'session-1&shouldStartAgent=true';

function expectSingleSessionParameter(target: string) {
  const url = new URL(target, 'http://localhost');
  expect(url.searchParams.get('resumeSessionId')).toBe(injectedSessionId);
  expect(url.searchParams.get('shouldStartAgent')).toBeNull();
}

describe('useNavigationSessions', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    routerState.searchParams = new URLSearchParams();
    localStorage.clear();
    vi.mocked(acpGetSessionListItem).mockReset();
    vi.mocked(acpGetSessionListItem).mockImplementation(
      () => new Promise<SessionListItem>(() => {})
    );
    vi.mocked(acpListRecentSessions).mockReset();
    vi.mocked(acpListRecentSessions).mockResolvedValue([]);
    vi.mocked(acpListArchivedSessions).mockReset();
    vi.mocked(acpListArchivedSessions).mockResolvedValue([]);
    vi.mocked(acpUnarchiveSession).mockReset();
    vi.mocked(acpUnarchiveSession).mockResolvedValue(undefined);
    window.electron.broadcastSessionListChange = vi.fn();
    window.electron.onSessionListChange = vi.fn(() => () => {});
  });

  it('keeps a selected session ID in one query parameter', () => {
    const { result } = renderHook(() => useNavigationSessions());

    act(() => result.current.handleSessionClick(injectedSessionId));

    expectSingleSessionParameter(navigateMock.mock.calls[0][0]);
  });

  it('keeps a retained session ID in one query parameter', () => {
    routerState.searchParams = new URLSearchParams({ resumeSessionId: injectedSessionId });
    const { result } = renderHook(() => useNavigationSessions());

    act(() => result.current.handleNavClick('/pair'));

    expectSingleSessionParameter(navigateMock.mock.calls[0][0]);
  });

  it('unarchives an open archived chat into recent chats', async () => {
    routerState.searchParams = new URLSearchParams({ resumeSessionId: 'archived-1' });
    vi.mocked(acpGetSessionListItem).mockResolvedValue(sessionItem('archived-1', '2026-01-02'));

    const { result } = renderHook(() => useNavigationSessions());

    await waitFor(() =>
      expect(result.current.recentSessions.map((session) => session.id)).toEqual(['archived-1'])
    );
    expect(acpUnarchiveSession).toHaveBeenCalledWith('archived-1');
    expect(result.current.recentSessions[0]?.archivedAt).toBeUndefined();
  });

  it('adds an open chat that is not archived to recent chats', async () => {
    routerState.searchParams = new URLSearchParams({ resumeSessionId: 'open-1' });
    vi.mocked(acpGetSessionListItem).mockResolvedValue(sessionItem('open-1'));

    const { result } = renderHook(() => useNavigationSessions());

    await waitFor(() =>
      expect(result.current.recentSessions.map((session) => session.id)).toEqual(['open-1'])
    );
  });

  it('moves an archived chat into the archive list', async () => {
    const chat = sessionItem('chat-1');
    vi.mocked(acpListRecentSessions).mockResolvedValue([chat]);
    const { result } = renderHook(() => useNavigationSessions());

    await act(async () => {
      await result.current.fetchSessions();
    });
    await act(async () => {
      await result.current.archiveSession('chat-1');
    });

    expect(acpArchiveSession).toHaveBeenCalledWith('chat-1');
    expect(result.current.recentSessions).toEqual([]);
    expect(result.current.archivedSessions.map((session) => session.id)).toEqual(['chat-1']);
    expect(window.electron.broadcastSessionListChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'archived', sessionId: 'chat-1' })
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('keeps recent chats when the archive list fails', async () => {
    const chat = sessionItem('chat-1');
    vi.mocked(acpListRecentSessions).mockResolvedValue([chat]);
    vi.mocked(acpListArchivedSessions).mockRejectedValue(new Error('timeout'));
    const { result } = renderHook(() => useNavigationSessions());

    await act(async () => {
      await result.current.fetchSessions();
    });

    expect(result.current.recentSessions).toEqual([chat]);
    expect(result.current.archivedSessions).toEqual([]);
    expect(result.current.isLoadingSessions).toBe(false);
  });

  it('does not let an older session fetch hide a chat that was just unarchived', async () => {
    const oldChat = sessionItem('old');
    const newer = sessionItem('newer');
    vi.mocked(acpListArchivedSessions).mockResolvedValue([oldChat]);
    vi.mocked(acpListRecentSessions).mockResolvedValue([newer]);
    const { result } = renderHook(() => useNavigationSessions());

    await act(async () => {
      await result.current.fetchSessions();
    });

    let resolveRecent: (sessions: SessionListItem[]) => void = () => {};
    let resolveArchived: (sessions: SessionListItem[]) => void = () => {};
    vi.mocked(acpListRecentSessions).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRecent = resolve;
        })
    );
    vi.mocked(acpListArchivedSessions).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveArchived = resolve;
        })
    );
    act(() => {
      void result.current.fetchSessions();
    });
    await act(async () => {
      await result.current.unarchiveSession('old');
    });
    await act(async () => {
      resolveArchived([oldChat]);
      resolveRecent([newer]);
      await Promise.resolve();
    });

    expect(result.current.recentSessions.map((session) => session.id)).toEqual(['old', 'newer']);
    expect(result.current.archivedSessions).toEqual([]);
  });

  it('keeps an unarchived chat in recents when a later list page omits it', async () => {
    const oldChat = sessionItem('old');
    const newer = sessionItem('newer');
    vi.mocked(acpListArchivedSessions).mockResolvedValue([oldChat]);
    vi.mocked(acpListRecentSessions).mockResolvedValue([newer]);
    const { result } = renderHook(() => useNavigationSessions());

    await act(async () => {
      await result.current.fetchSessions();
    });
    await act(async () => {
      await result.current.unarchiveSession('old');
    });

    vi.mocked(acpListArchivedSessions).mockResolvedValue([]);
    vi.mocked(acpListRecentSessions).mockResolvedValue([newer]);
    await act(async () => {
      await result.current.fetchSessions();
    });

    expect(result.current.recentSessions.map((session) => session.id)).toEqual(['old', 'newer']);
    expect(result.current.archivedSessions).toEqual([]);
  });

  it('still shows an unarchived chat after the sidebar hook is mounted again', async () => {
    const oldChat = sessionItem('old');
    const newer = sessionItem('newer');
    vi.mocked(acpListArchivedSessions).mockResolvedValue([oldChat]);
    vi.mocked(acpListRecentSessions).mockResolvedValue([newer]);
    const first = renderHook(() => useNavigationSessions());

    await act(async () => {
      await first.result.current.fetchSessions();
    });
    await act(async () => {
      await first.result.current.unarchiveSession('old');
    });
    first.unmount();

    vi.mocked(acpListArchivedSessions).mockResolvedValue([]);
    vi.mocked(acpListRecentSessions).mockResolvedValue([newer]);
    const second = renderHook(() => useNavigationSessions());
    await act(async () => {
      await second.result.current.fetchSessions();
    });

    expect(second.result.current.recentSessions.map((session) => session.id)).toEqual([
      'old',
      'newer',
    ]);
    expect(second.result.current.archivedSessions).toEqual([]);
  });

  it('moves a chat into the archive when another window archives it', async () => {
    let listener: ((change: SessionListChange) => void) | undefined;
    window.electron.onSessionListChange = (callback) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    };
    const chat = sessionItem('chat-1');
    vi.mocked(acpListRecentSessions).mockResolvedValue([chat]);
    vi.mocked(acpListArchivedSessions).mockResolvedValue([]);
    const { result } = renderHook(() => useNavigationSessions());

    await act(async () => {
      await result.current.fetchSessions();
    });
    await act(async () => {
      listener?.({
        kind: 'archived',
        sessionId: chat.id,
        session: { ...chat, archivedAt: '2026-02-01T00:00:00Z' },
      });
    });

    await waitFor(() => {
      expect(result.current.recentSessions).toEqual([]);
    });
    expect(result.current.archivedSessions.map((session) => session.id)).toEqual(['chat-1']);
  });
});

function sessionItem(id: string, archivedAt?: string): SessionListItem {
  return {
    id,
    name: id,
    workingDir: '/tmp',
    updatedAt: '2026-01-01T00:00:00Z',
    messageCount: 1,
    createdAt: '2026-01-01T00:00:00Z',
    archivedAt,
  };
}
