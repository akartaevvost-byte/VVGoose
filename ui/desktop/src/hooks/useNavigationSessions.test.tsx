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

import { acpArchiveSession, acpGetSessionListItem, acpListRecentSessions } from '../acp/sessions';
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

  it('does not add an archived open chat to recent chats', async () => {
    routerState.searchParams = new URLSearchParams({ resumeSessionId: 'archived-1' });
    vi.mocked(acpGetSessionListItem).mockResolvedValue(sessionItem('archived-1', '2026-01-02'));

    const { result } = renderHook(() => useNavigationSessions());

    await waitFor(() => expect(acpGetSessionListItem).toHaveBeenCalledWith('archived-1'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.recentSessions).toEqual([]);
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
    expect(navigateMock).not.toHaveBeenCalled();
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
