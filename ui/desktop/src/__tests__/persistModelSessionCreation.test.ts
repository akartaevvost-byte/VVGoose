import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../sessions';
import type { Session } from '../types/session';
import { acpChatSessionController } from '../acp/chatSessionController';
import { acpSetSessionProviderModel } from '../acp/providers';
import { acpChatSessionActions } from '../acp/chatSessionStore';

vi.mock('../acp/chatSessionController', () => ({
  acpChatSessionController: {
    createSession: vi.fn(),
  },
}));

vi.mock('../acp/providers', () => ({
  acpReadDefaults: vi.fn().mockResolvedValue({ providerId: 'zai', modelId: 'glm-5' }),
  acpSetSessionProviderModel: vi.fn().mockResolvedValue({
    providerId: 'zai_coding_plan',
    modelId: 'glm-5.3-flash',
  }),
}));

vi.mock('../acp/chatSessionStore', () => ({
  acpChatSessionActions: {
    setSessionMetadata: vi.fn(),
  },
}));

vi.mock('../acp/extensions', () => ({
  getConfiguredGooseExtensions: vi.fn().mockResolvedValue([]),
  gooseExtensionName: vi.fn(),
}));

vi.mock('../recipe/consent', () => ({
  requestRecipeConsent: vi.fn().mockResolvedValue(true),
}));

vi.mock('../acp/capabilities', () => ({
  getAcpFeatureCapabilities: vi.fn().mockResolvedValue({ recipeParameterScopes: true }),
}));

describe('Session creation with persisted model and provider', () => {
  const baseSession: Session = {
    id: 'session-new-1',
    name: 'New Chat',
    message_count: 0,
    created_at: '2026-11-06T00:00:00.000Z',
    updated_at: '2026-11-06T00:00:00.000Z',
    working_dir: '/tmp',
    extension_data: {},
    provider_name: 'zai',
    model_config: { model_name: 'glm-5', toolshim: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acpChatSessionController.createSession).mockResolvedValue({ ...baseSession });
    window.electron.getSetting = vi.fn().mockResolvedValue(null);
  });

  it('explicitly applies provider and model if passed in options', async () => {
    vi.mocked(acpSetSessionProviderModel).mockResolvedValue({
      providerId: 'zai_coding_plan',
      modelId: 'glm-5.3-flash',
    });

    const session = await createSession('/tmp', {
      provider: 'zai_coding_plan',
      model: 'glm-5.3-flash',
    });

    expect(acpSetSessionProviderModel).toHaveBeenCalledWith(
      'session-new-1',
      'zai_coding_plan',
      'glm-5.3-flash'
    );
    expect(session.provider_name).toBe('zai_coding_plan');
    expect(session.model_config?.model_name).toBe('glm-5.3-flash');
    expect(acpChatSessionActions.setSessionMetadata).toHaveBeenCalledWith('session-new-1', session);
  });

  it('reads lastSelectedModelAndProvider from electron settings if options are omitted', async () => {
    vi.mocked(window.electron.getSetting).mockImplementation(async (key: string) => {
      if (key === 'lastSelectedModelAndProvider') {
        return { provider: 'zai_coding_plan', model: 'glm-5.3-flash' };
      }
      return null;
    });

    vi.mocked(acpSetSessionProviderModel).mockResolvedValue({
      providerId: 'zai_coding_plan',
      modelId: 'glm-5.3-flash',
    });

    const session = await createSession('/tmp');

    expect(acpSetSessionProviderModel).toHaveBeenCalledWith(
      'session-new-1',
      'zai_coding_plan',
      'glm-5.3-flash'
    );
    expect(session.provider_name).toBe('zai_coding_plan');
    expect(session.model_config?.model_name).toBe('glm-5.3-flash');
  });

  it('does not override session provider/model if already matching', async () => {
    vi.mocked(acpChatSessionController.createSession).mockResolvedValue({
      ...baseSession,
      provider_name: 'zai_coding_plan',
      model_config: { model_name: 'glm-5.3-flash', toolshim: false },
    });

    const session = await createSession('/tmp', {
      provider: 'zai_coding_plan',
      model: 'glm-5.3-flash',
    });

    // Already matches, should not re-invoke acpSetSessionProviderModel
    expect(acpSetSessionProviderModel).not.toHaveBeenCalled();
    expect(session.provider_name).toBe('zai_coding_plan');
  });
});
