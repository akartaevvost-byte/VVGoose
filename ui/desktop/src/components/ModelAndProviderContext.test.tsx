import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  ModelAndProviderProvider,
  useModelAndProvider,
} from './ModelAndProviderContext';
import { IntlTestWrapper } from '../i18n/test-utils';
import {
  acpReadDefaults,
  acpSaveDefaults,
  acpSetSessionProviderModel,
} from '../acp/providers';
import type Model from './settings/models/modelInterface';

vi.mock('../acp/providers', () => ({
  acpReadDefaults: vi.fn(),
  acpSaveDefaults: vi.fn(),
  acpSetSessionProviderModel: vi.fn(),
}));

vi.mock('../acp/chatSessionStore', () => ({
  acpChatSessionStore: {
    getSnapshot: vi.fn(() => ({ session: { id: 'session-123', provider_name: 'old-p' } })),
  },
  acpChatSessionActions: {
    setSessionMetadata: vi.fn(),
  },
}));

vi.mock('./settings/models/modelInterface', () => ({
  getProviderMetadata: vi.fn().mockImplementation((id: string) => {
    if (id === 'zai_coding_plan') {
      return Promise.resolve({ display_name: 'Z.AI Coding Plan' });
    }
    if (id === 'zai') {
      return Promise.resolve({ display_name: 'Z.AI' });
    }
    return Promise.resolve({ display_name: id });
  }),
}));

vi.mock('../toasts', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

describe('ModelAndProviderContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <IntlTestWrapper>
      <ModelAndProviderProvider>{children}</ModelAndProviderProvider>
    </IntlTestWrapper>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    if (window.electron?.getSetting) {
      vi.mocked(window.electron.getSetting).mockResolvedValue(null);
    }
    vi.mocked(acpReadDefaults).mockResolvedValue({
      providerId: 'zai',
      modelId: 'glm-5',
    });
    vi.mocked(acpSaveDefaults).mockResolvedValue(undefined);
    vi.mocked(acpSetSessionProviderModel).mockResolvedValue({
      providerId: 'zai_coding_plan',
      modelId: 'glm-5.3-flash',
    });

    // Reset electron setting mock
    window.electron.getSetting = vi.fn().mockResolvedValue(null);
    window.electron.setSetting = vi.fn().mockResolvedValue(undefined);
    window.electron.broadcastModelAndProviderChange = vi.fn();
  });

  it('loads saved lastSelectedModelAndProvider from electron settings if available', async () => {
    vi.mocked(window.electron.getSetting).mockImplementation(async (key: string) => {
      if (key === 'lastSelectedModelAndProvider') {
        return { provider: 'zai_coding_plan', model: 'glm-5.3-flash' };
      }
      return null;
    });

    const { result } = renderHook(() => useModelAndProvider(), { wrapper });

    await waitFor(() => {
      expect(result.current.currentProvider).toBe('zai_coding_plan');
      expect(result.current.currentModel).toBe('glm-5.3-flash');
    });

    const modelAndProvider = await result.current.getCurrentModelAndProvider();
    expect(modelAndProvider).toEqual({
      provider: 'zai_coding_plan',
      model: 'glm-5.3-flash',
    });
  });

  it('falls back to acpReadDefaults if no electron setting is present', async () => {
    vi.mocked(window.electron.getSetting).mockResolvedValue(null);
    vi.mocked(acpReadDefaults).mockResolvedValue({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
    });

    const { result } = renderHook(() => useModelAndProvider(), { wrapper });

    await waitFor(() => {
      expect(result.current.currentProvider).toBe('anthropic');
      expect(result.current.currentModel).toBe('claude-3-7-sonnet');
    });
  });

  it('persists selected model and provider when changing model within an active session', async () => {
    const { result } = renderHook(() => useModelAndProvider(), { wrapper });
    await waitFor(() => expect(result.current.currentProvider).toBe('zai'));

    const modelObj: Model = {
      name: 'glm-5.3-flash',
      provider: 'zai_coding_plan',
      subtext: 'Z.AI Coding Plan',
    };

    let success = false;
    await act(async () => {
      success = await result.current.changeModel('session-active-123', modelObj);
    });

    expect(success).toBe(true);

    // Verifies that session model was switched on agent
    expect(acpSetSessionProviderModel).toHaveBeenCalledWith(
      'session-active-123',
      'zai_coding_plan',
      'glm-5.3-flash',
      null
    );

    // CRITICAL: Verifies that even with an active sessionId, global defaults are updated
    expect(acpSaveDefaults).toHaveBeenCalledWith('zai_coding_plan', 'glm-5.3-flash');

    // CRITICAL: Verifies that electron settings are updated
    expect(window.electron.setSetting).toHaveBeenCalledWith('lastSelectedModelAndProvider', {
      provider: 'zai_coding_plan',
      model: 'glm-5.3-flash',
    });

    // Verifies that change is broadcast to other windows
    expect(window.electron.broadcastModelAndProviderChange).toHaveBeenCalledWith({
      provider: 'zai_coding_plan',
      model: 'glm-5.3-flash',
    });

    // Verifies local context state update
    expect(result.current.currentProvider).toBe('zai_coding_plan');
    expect(result.current.currentModel).toBe('glm-5.3-flash');
  });

  it('persists selected model and provider when changing model without a session (from settings)', async () => {
    const { result } = renderHook(() => useModelAndProvider(), { wrapper });
    await waitFor(() => expect(result.current.currentProvider).toBe('zai'));

    const modelObj: Model = {
      name: 'glm-5.3-flash',
      provider: 'zai_coding_plan',
      subtext: 'Z.AI Coding Plan',
    };

    let success = false;
    await act(async () => {
      success = await result.current.changeModel(null, modelObj);
    });

    expect(success).toBe(true);

    // No session to update
    expect(acpSetSessionProviderModel).not.toHaveBeenCalled();

    // Global defaults and electron settings updated
    expect(acpSaveDefaults).toHaveBeenCalledWith('zai_coding_plan', 'glm-5.3-flash');
    expect(window.electron.setSetting).toHaveBeenCalledWith('lastSelectedModelAndProvider', {
      provider: 'zai_coding_plan',
      model: 'glm-5.3-flash',
    });

    await waitFor(() => {
      expect(result.current.currentProvider).toBe('zai_coding_plan');
      expect(result.current.currentModel).toBe('glm-5.3-flash');
    });
  });

  it('never resets zai_coding_plan to base zai', async () => {
    const { result } = renderHook(() => useModelAndProvider(), { wrapper });
    await waitFor(() => expect(result.current.currentProvider).toBe('zai'));

    const modelObj: Model = {
      name: 'glm-5.3-flash',
      provider: 'zai_coding_plan',
    };

    await act(async () => {
      await result.current.changeModel('session-999', modelObj);
    });

    // Verify exact provider ID passed to persistence
    expect(acpSaveDefaults).toHaveBeenCalledWith('zai_coding_plan', 'glm-5.3-flash');
    expect(window.electron.setSetting).toHaveBeenCalledWith('lastSelectedModelAndProvider', {
      provider: 'zai_coding_plan',
      model: 'glm-5.3-flash',
    });
    await waitFor(() => {
      expect(result.current.currentProvider).toBe('zai_coding_plan');
    });
  });

  it('updates state when receiving model-and-provider-changed event from another window', async () => {
    const { result } = renderHook(() => useModelAndProvider(), { wrapper });
    await waitFor(() => expect(result.current.currentProvider).toBe('zai'));

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('model-and-provider-changed', {
          detail: { provider: 'zai_coding_plan', model: 'glm-5.3' },
        })
      );
    });

    await waitFor(() => {
      expect(result.current.currentProvider).toBe('zai_coding_plan');
      expect(result.current.currentModel).toBe('glm-5.3');
    });
  });
});
