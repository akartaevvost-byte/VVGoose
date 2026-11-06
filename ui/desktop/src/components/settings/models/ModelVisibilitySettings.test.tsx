import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModelVisibilitySettings from './ModelVisibilitySettings';
import { IntlTestWrapper } from '../../../i18n/test-utils';
import type { ProviderDetails } from '../../../types/providers';

const mockActiveProviders = [
  {
    name: 'openai',
    is_configured: true,
    is_available: true,
    metadata: {
      display_name: 'OpenAI',
      default_model: 'gpt-4o',
      known_models: [
        { name: 'gpt-4o', context_limit: 128000 },
        { name: 'gpt-4o-mini', context_limit: 128000 },
        { name: 'o1', reasoning: true, context_limit: 128000 },
      ],
    },
  },
];

vi.mock('../../../acp/providers', () => ({
  acpListProviderDetails: vi.fn(() => Promise.resolve(mockActiveProviders)),
}));

vi.mock('./modelInterface', () => ({
  fetchModelsForProviders: vi.fn(() =>
    Promise.resolve([
      {
        provider: mockActiveProviders[0],
        models: [
          { name: 'gpt-4o', provider: 'openai', context_limit: 128000 },
          { name: 'gpt-4o-mini', provider: 'openai', context_limit: 128000 },
          { name: 'o1', provider: 'openai', reasoning: true, context_limit: 128000 },
        ],
        error: null,
        warning: null,
      },
    ])
  ),
}));

describe('ModelVisibilitySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders configured providers and model list', async () => {
    render(
      <IntlTestWrapper>
        <ModelVisibilitySettings />
      </IntlTestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByTestId('checkbox-model-gpt-4o')).toBeInTheDocument();
      expect(screen.getByTestId('checkbox-model-gpt-4o-mini')).toBeInTheDocument();
    });
  });

  it('toggles model visibility when checkbox is clicked', async () => {
    render(
      <IntlTestWrapper>
        <ModelVisibilitySettings />
      </IntlTestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('checkbox-model-gpt-4o')).toBeInTheDocument();
    });

    const checkbox = screen.getByTestId('checkbox-model-gpt-4o') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(window.electron.setSetting).toHaveBeenCalledWith(
        'visibleModels',
        expect.objectContaining({
          openai: expect.not.arrayContaining(['gpt-4o']),
        })
      );
    });
  });

  it('allows adding a custom model identifier', async () => {
    render(
      <IntlTestWrapper>
        <ModelVisibilitySettings />
      </IntlTestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('input-custom-model-openai')).toBeInTheDocument();
    });

    const input = screen.getByTestId('input-custom-model-openai');
    fireEvent.change(input, { target: { value: 'gpt-4.5-preview' } });

    const addBtn = screen.getByTestId('btn-add-custom-model-openai');
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(window.electron.setSetting).toHaveBeenCalledWith(
        'customModels',
        expect.objectContaining({
          openai: expect.arrayContaining(['gpt-4.5-preview']),
        })
      );
      expect(screen.getByText('gpt-4.5-preview')).toBeInTheDocument();
    });
  });

  it('resets visibility to defaults when reset button is clicked', async () => {
    render(
      <IntlTestWrapper>
        <ModelVisibilitySettings />
      </IntlTestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reset to Defaults/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Reset to Defaults/i }));

    await waitFor(() => {
      expect(window.electron.setSetting).toHaveBeenCalledWith('visibleModels', {});
    });
  });

  it('filters out CLI tools not installed in the system', async () => {
    const { acpListProviderDetails } = await import('../../../acp/providers');
    vi.mocked(acpListProviderDetails).mockResolvedValueOnce([
      ...mockActiveProviders,
      {
        name: 'cursor-agent',
        is_configured: true,
        is_available: false,
        metadata: {
          display_name: 'Cursor Agent',
          default_model: 'auto',
          known_models: [{ name: 'auto' }],
        },
      },
    ] as unknown as ProviderDetails[]);

    render(
      <IntlTestWrapper>
        <ModelVisibilitySettings />
      </IntlTestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.queryByText('Cursor Agent')).not.toBeInTheDocument();
    });
  });
});
