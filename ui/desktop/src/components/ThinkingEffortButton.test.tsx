import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThinkingEffortButton from './ThinkingEffortButton';
import { IntlTestWrapper } from '../i18n/test-utils';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const mockAcpReadThinkingEffort = vi.fn();
const mockAcpSaveThinkingEffort = vi.fn();
const mockAcpSetSessionProviderModel = vi.fn();
const mockFetchModelReasoning = vi.fn();
const mockGetSnapshot = vi.fn();
const mockSetSessionMetadata = vi.fn();

vi.mock('../acp/providers', () => ({
  acpReadThinkingEffort: () => mockAcpReadThinkingEffort(),
  acpSaveThinkingEffort: (effort: string) => mockAcpSaveThinkingEffort(effort),
  acpSetSessionProviderModel: (
    sessionId: string,
    provider: string,
    model: string,
    effort: string
  ) => mockAcpSetSessionProviderModel(sessionId, provider, model, effort),
}));

vi.mock('./settings/models/modelInterface', () => ({
  fetchModelReasoning: (provider: string, model: string, fallback?: boolean) =>
    mockFetchModelReasoning(provider, model, fallback),
}));

vi.mock('./settings/models/predefinedModelsUtils', () => ({
  getPredefinedModelsFromEnv: () => [],
}));

vi.mock('../acp/chatSessionStore', () => ({
  acpChatSessionStore: {
    getSnapshot: (sessionId: string) => mockGetSnapshot(sessionId),
  },
  acpChatSessionActions: {
    setSessionMetadata: (sessionId: string, data: unknown) =>
      mockSetSessionMetadata(sessionId, data),
  },
}));

describe('ThinkingEffortButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchModelReasoning.mockResolvedValue(true);
    mockAcpReadThinkingEffort.mockResolvedValue('off');
    mockAcpSaveThinkingEffort.mockResolvedValue(undefined);
    mockAcpSetSessionProviderModel.mockResolvedValue({});
    mockGetSnapshot.mockReturnValue(null);
  });

  it('does not render when the model does not support reasoning', async () => {
    mockFetchModelReasoning.mockResolvedValue(false);

    render(
      <ThinkingEffortButton sessionId="session-1" currentProvider="openai" currentModel="gpt-4o" />,
      { wrapper: IntlTestWrapper }
    );

    await waitFor(() => {
      expect(mockFetchModelReasoning).toHaveBeenCalledWith('openai', 'gpt-4o', undefined);
    });

    expect(screen.queryByTestId('thinking-effort-button')).not.toBeInTheDocument();
  });

  it('renders when the model supports reasoning', async () => {
    mockFetchModelReasoning.mockResolvedValue(true);
    mockAcpReadThinkingEffort.mockResolvedValue('high');

    render(
      <ThinkingEffortButton
        sessionId="session-1"
        currentProvider="anthropic"
        currentModel="claude-3-7-sonnet"
      />,
      { wrapper: IntlTestWrapper }
    );

    const button = await screen.findByTestId('thinking-effort-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('data-effort', 'high');
    expect(screen.getByText('Effort: high')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Effort: high (⌥T to cycle)');
  });

  it('uses compact label in narrow mode', async () => {
    mockFetchModelReasoning.mockResolvedValue(true);
    mockAcpReadThinkingEffort.mockResolvedValue('medium');

    render(
      <ThinkingEffortButton
        sessionId="session-1"
        currentProvider="anthropic"
        currentModel="claude-3-7-sonnet"
        isNarrow={true}
      />,
      { wrapper: IntlTestWrapper }
    );

    const button = await screen.findByTestId('thinking-effort-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('medium');
    expect(screen.queryByText('Effort: medium')).not.toBeInTheDocument();
  });

  it('initializes effort from session metadata when available', async () => {
    mockFetchModelReasoning.mockResolvedValue(true);
    mockGetSnapshot.mockReturnValue({
      session: {
        model_config: {
          request_params: {
            thinking_effort: 'max',
          },
        },
      },
    });

    render(
      <ThinkingEffortButton
        sessionId="session-1"
        currentProvider="anthropic"
        currentModel="claude-3-7-sonnet"
      />,
      { wrapper: IntlTestWrapper }
    );

    const button = await screen.findByTestId('thinking-effort-button');
    expect(button).toHaveAttribute('data-effort', 'max');
    expect(screen.getByText('Effort: max')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Effort: max (⌥T to cycle)');
  });

  it('opens dropdown menu on click and lists all 5 effort levels', async () => {
    const user = userEvent.setup();
    mockFetchModelReasoning.mockResolvedValue(true);
    mockAcpReadThinkingEffort.mockResolvedValue('low');

    render(
      <ThinkingEffortButton
        sessionId="session-1"
        currentProvider="anthropic"
        currentModel="claude-3-7-sonnet"
      />,
      { wrapper: IntlTestWrapper }
    );

    const button = await screen.findByTestId('thinking-effort-button');
    await user.click(button);

    expect(await screen.findByTestId('thinking-effort-dropdown')).toBeInTheDocument();
    expect(screen.getByText('Thinking Effort')).toBeInTheDocument();
    expect(screen.getByText('Control reasoning depth before responding')).toBeInTheDocument();
    expect(screen.getByTestId('thinking-effort-option-off')).toBeInTheDocument();
    expect(screen.getByTestId('thinking-effort-option-low')).toBeInTheDocument();
    expect(screen.getByTestId('thinking-effort-option-medium')).toBeInTheDocument();
    expect(screen.getByTestId('thinking-effort-option-high')).toBeInTheDocument();
    expect(screen.getByTestId('thinking-effort-option-max')).toBeInTheDocument();

    const offOption = screen.getByTestId('thinking-effort-option-off');
    expect(within(offOption).getAllByText('Off')).toHaveLength(2);
    expect(
      within(offOption).getByText('No extended thinking, fastest responses')
    ).toBeInTheDocument();

    const lowOption = screen.getByTestId('thinking-effort-option-low');
    expect(within(lowOption).getByText('Low')).toBeInTheDocument();
    expect(within(lowOption).getByText('Fast')).toBeInTheDocument();
    expect(within(lowOption).getByText('Minimal thinking, light reasoning')).toBeInTheDocument();

    const mediumOption = screen.getByTestId('thinking-effort-option-medium');
    expect(within(mediumOption).getByText('Medium')).toBeInTheDocument();
    expect(within(mediumOption).getByText('Balanced')).toBeInTheDocument();
    expect(
      within(mediumOption).getByText('Moderate thinking for balanced reasoning')
    ).toBeInTheDocument();

    const highOption = screen.getByTestId('thinking-effort-option-high');
    expect(within(highOption).getByText('High')).toBeInTheDocument();
    expect(within(highOption).getByText('Deep')).toBeInTheDocument();
    expect(within(highOption).getByText('Deep reasoning for complex problems')).toBeInTheDocument();

    const maxOption = screen.getByTestId('thinking-effort-option-max');
    expect(within(maxOption).getAllByText('Max')).toHaveLength(2);
    expect(
      within(maxOption).getByText('Maximum depth without reasoning constraints')
    ).toBeInTheDocument();
  });

  it('updates effort, saves preference and updates session on selection', async () => {
    const user = userEvent.setup();
    mockFetchModelReasoning.mockResolvedValue(true);
    mockAcpReadThinkingEffort.mockResolvedValue('off');
    const onEffortChanged = vi.fn();

    render(
      <ThinkingEffortButton
        sessionId="session-123"
        currentProvider="anthropic"
        currentModel="claude-3-7-sonnet"
        onEffortChanged={onEffortChanged}
      />,
      { wrapper: IntlTestWrapper }
    );

    const button = await screen.findByTestId('thinking-effort-button');
    expect(button).toHaveAttribute('data-effort', 'off');
    expect(screen.getByText('Effort: off')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Effort: off (⌥T to cycle)');

    await user.click(button);

    const highOption = await screen.findByTestId('thinking-effort-option-high');
    await user.click(highOption);

    await waitFor(() => {
      expect(mockAcpSaveThinkingEffort).toHaveBeenCalledWith('high');
      expect(mockAcpSetSessionProviderModel).toHaveBeenCalledWith(
        'session-123',
        'anthropic',
        'claude-3-7-sonnet',
        'high'
      );
      expect(onEffortChanged).toHaveBeenCalledWith('high');
    });

    expect(button).toHaveAttribute('data-effort', 'high');
    expect(screen.getByText('Effort: high')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Effort: high (⌥T to cycle)');
  });

  it('cycles through effort levels on Alt+T keypress', async () => {
    mockFetchModelReasoning.mockResolvedValue(true);
    mockAcpReadThinkingEffort.mockResolvedValue('off');

    render(
      <ThinkingEffortButton
        sessionId="session-1"
        currentProvider="anthropic"
        currentModel="claude-3-7-sonnet"
      />,
      { wrapper: IntlTestWrapper }
    );

    const button = await screen.findByTestId('thinking-effort-button');
    expect(button).toHaveAttribute('data-effort', 'off');
    expect(screen.getByText('Effort: off')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Effort: off (⌥T to cycle)');

    // Press Alt+T
    fireEvent.keyDown(window, { key: 't', altKey: true });

    await waitFor(() => {
      expect(mockAcpSaveThinkingEffort).toHaveBeenCalledWith('low');
      expect(button).toHaveAttribute('data-effort', 'low');
      expect(screen.getByText('Effort: low')).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-label', 'Effort: low (⌥T to cycle)');
    });

    // Press Alt+T again
    fireEvent.keyDown(window, { key: 't', altKey: true });

    await waitFor(() => {
      expect(mockAcpSaveThinkingEffort).toHaveBeenCalledWith('medium');
      expect(button).toHaveAttribute('data-effort', 'medium');
      expect(screen.getByText('Effort: medium')).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-label', 'Effort: medium (⌥T to cycle)');
    });
  });
});
