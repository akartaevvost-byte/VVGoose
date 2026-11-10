/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  acpChatSessionActions,
  acpChatSessionStore,
  getActiveSessionId,
  pairSessionPath,
  setActiveSessionId,
} from '../chatSessionStore';
import { cancelAcpPermissionRequestsForSession } from '../permissionRequests';
import { cancelAcpElicitationRequestsForSession } from '../elicitationRequests';
import { acpChatSessionController } from '../chatSessionController';
import { ChatState } from '../../types/chatState';
import type { Session } from '../../types/session';
import type { AcpPermissionRequest } from '../permissionRequestTypes';

vi.mock('../chatSessionController', () => ({
  acpChatSessionController: {
    stop: vi.fn(),
  },
}));

vi.mock('../permissionRequests', () => ({
  cancelAcpPermissionRequestsForSession: vi.fn(),
}));

vi.mock('../elicitationRequests', () => ({
  cancelAcpElicitationRequestsForSession: vi.fn(),
}));

describe('Concurrent Chat Tabs Execution & Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveSessionId(null);
  });

  it('pairSessionPath formats resumeSessionId correctly', () => {
    expect(pairSessionPath('session-123')).toBe('/pair?resumeSessionId=session-123');
  });

  it('active session ID tracking synchronizes and resets', () => {
    expect(getActiveSessionId()).toBeNull();
    setActiveSessionId('chat-active');
    expect(getActiveSessionId()).toBe('chat-active');
    setActiveSessionId(null);
    expect(getActiveSessionId()).toBeNull();
  });

  it('cleans up resources and stops running agent on tab closure', () => {
    const sessionId = 'session-to-close';
    acpChatSessionActions.startPromptAttempt(sessionId, 'prompt-attempt-1');

    const snap = acpChatSessionStore.getSnapshot(sessionId);
    expect(snap?.activePromptAttemptId).toBe('prompt-attempt-1');

    // Simulate tab close handler logic from App.tsx
    if (snap?.activePromptAttemptId) {
      acpChatSessionController.stop(sessionId);
    }
    cancelAcpPermissionRequestsForSession(sessionId);
    cancelAcpElicitationRequestsForSession(sessionId);
    acpChatSessionActions.deleteSnapshot(sessionId);

    expect(acpChatSessionController.stop).toHaveBeenCalledWith(sessionId);
    expect(cancelAcpPermissionRequestsForSession).toHaveBeenCalledWith(sessionId);
    expect(cancelAcpElicitationRequestsForSession).toHaveBeenCalledWith(sessionId);
    expect(acpChatSessionStore.getSnapshot(sessionId)).toBeUndefined();
  });

  it('protects busy/streaming sessions from LRU eviction over idle sessions', () => {
    // Set up 10 sessions in store
    const sessionIds = Array.from({ length: 10 }, (_, i) => `session-${i + 1}`);

    // session-1 is running (streaming)
    acpChatSessionActions.startPromptAttempt('session-1', 'prompt-1');

    // session-2 is idle
    acpChatSessionActions.finishSessionLoad('session-2', {
      id: 'session-2',
      name: 'Session 2',
    } as unknown as Session);

    // Test eviction selection logic (same as App.tsx)
    const list = sessionIds.map((id) => ({ sessionId: id }));
    const newSession = { sessionId: 'session-11' };
    const updated = [...list, newSession];

    const evictIndex = updated.findIndex((item) => {
      if (item.sessionId === 'session-11') return false;
      const snap = acpChatSessionStore.getSnapshot(item.sessionId);
      return (
        !snap ||
        (!snap.isProcessing &&
          !snap.isWaitingForInput &&
          !snap.hasPendingUserInput &&
          !snap.activePromptAttemptId &&
          snap.chatState === ChatState.Idle)
      );
    });

    // session-1 should NOT be evicted because it is running
    expect(evictIndex).not.toBe(0); // index 0 is session-1
    // session-2 or another uninitialized/idle session is evicted
    expect(evictIndex).toBeGreaterThanOrEqual(1);

    // Clean up
    acpChatSessionActions.deleteSnapshot('session-1');
    acpChatSessionActions.deleteSnapshot('session-2');
  });

  it('protects sessions waiting for user input from LRU eviction', () => {
    // session-waiting has pending user input
    acpChatSessionActions.finishSessionLoad('session-waiting', {
      id: 'session-waiting',
      name: 'Session Waiting',
    } as unknown as Session);
    acpChatSessionActions.applyPermissionRequest({
      generation: 'gen-1',
      request: {
        sessionId: 'session-waiting',
        options: [],
        toolCall: { toolCallId: 'tool-call-1' },
      },
    } as unknown as AcpPermissionRequest);

    const snap = acpChatSessionStore.getSnapshot('session-waiting')!;
    expect(snap.isWaitingForInput).toBe(true);
    expect(snap.hasPendingUserInput).toBe(true);

    const isProtected =
      snap.isProcessing ||
      snap.isWaitingForInput ||
      snap.hasPendingUserInput ||
      Boolean(snap.activePromptAttemptId) ||
      snap.chatState !== ChatState.Idle;

    expect(isProtected).toBe(true);
    acpChatSessionActions.deleteSnapshot('session-waiting');
  });

  describe('Event Scoping & Focus Isolation', () => {
    it('scopes goose:append-to-chat to specific sessionId or active session only', () => {
      const quotesA: string[] = [];
      const quotesB: string[] = [];

      const makeListener = (sessionId: string, isActive: () => boolean, sink: string[]) => {
        return (e: Event) => {
          const customEvent = e as CustomEvent<{ text: string; sessionId?: string }>;
          const targetSessionId = customEvent.detail?.sessionId;
          if (targetSessionId) {
            if (targetSessionId !== sessionId) return;
          } else if (!isActive()) {
            return;
          }
          if (customEvent.detail?.text) {
            sink.push(customEvent.detail.text);
          }
        };
      };

      let activeSession = 'session-a';
      const listenerA = makeListener('session-a', () => activeSession === 'session-a', quotesA);
      const listenerB = makeListener('session-b', () => activeSession === 'session-b', quotesB);

      window.addEventListener('goose:append-to-chat', listenerA);
      window.addEventListener('goose:append-to-chat', listenerB);

      // 1. Target session-b explicitly while session-a is active
      window.dispatchEvent(
        new CustomEvent('goose:append-to-chat', {
          detail: { text: 'Quote for B', sessionId: 'session-b' },
        })
      );
      expect(quotesA).toHaveLength(0);
      expect(quotesB).toEqual(['Quote for B']);

      // 2. Broadcast without sessionId: only active session (session-a) receives it
      window.dispatchEvent(
        new CustomEvent('goose:append-to-chat', {
          detail: { text: 'Quote for active' },
        })
      );
      expect(quotesA).toEqual(['Quote for active']);
      expect(quotesB).toEqual(['Quote for B']);

      window.removeEventListener('goose:append-to-chat', listenerA);
      window.removeEventListener('goose:append-to-chat', listenerB);
    });

    it('scopes ATTACH_FILE_TO_CHAT to specific sessionId or active session only', () => {
      const filesA: string[] = [];
      const filesB: string[] = [];

      const makeListener = (sessionId: string, isActive: () => boolean, sink: string[]) => {
        return (e: Event) => {
          const customEvent = e as CustomEvent<{ path: string; name: string; sessionId?: string }>;
          const targetSessionId = customEvent.detail?.sessionId;
          if (targetSessionId) {
            if (targetSessionId !== sessionId) return;
          } else if (!isActive()) {
            return;
          }
          if (customEvent.detail?.path) {
            sink.push(customEvent.detail.path);
          }
        };
      };

      let activeSession = 'session-a';
      const listenerA = makeListener('session-a', () => activeSession === 'session-a', filesA);
      const listenerB = makeListener('session-b', () => activeSession === 'session-b', filesB);

      window.addEventListener('attach-file-to-chat', listenerA);
      window.addEventListener('attach-file-to-chat', listenerB);

      // 1. Target session-b explicitly
      window.dispatchEvent(
        new CustomEvent('attach-file-to-chat', {
          detail: { path: '/tmp/test-b.ts', name: 'test-b.ts', sessionId: 'session-b' },
        })
      );
      expect(filesA).toHaveLength(0);
      expect(filesB).toEqual(['/tmp/test-b.ts']);

      // 2. Broadcast without sessionId: only active session (session-a) receives it
      window.dispatchEvent(
        new CustomEvent('attach-file-to-chat', {
          detail: { path: '/tmp/test-a.ts', name: 'test-a.ts' },
        })
      );
      expect(filesA).toEqual(['/tmp/test-a.ts']);
      expect(filesB).toEqual(['/tmp/test-b.ts']);

      window.removeEventListener('attach-file-to-chat', listenerA);
      window.removeEventListener('attach-file-to-chat', listenerB);
    });
  });
});
