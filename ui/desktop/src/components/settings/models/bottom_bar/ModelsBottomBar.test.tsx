import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, type RenderOptions, screen, waitFor } from '@testing-library/react';
import ModelsBottomBar from './ModelsBottomBar';
import { IntlTestWrapper } from '../../../../i18n/test-utils';

const renderWithIntl = (ui: React.ReactElement, options?: RenderOptions) =>
  render(ui, { wrapper: IntlTestWrapper, ...options });

const createDropdownRef = (): React.RefObject<HTMLDivElement> =>
  ({ current: document.createElement('div') }) as React.RefObject<HTMLDivElement>;

let mockCurrentModel: string | null = 'config-model';
let mockCurrentProvider: string | null = 'config-provider';
const mockGetProviders = vi.fn();
const mockOnModelChanged = vi.fn();
const mockChangeModel = vi.fn().mockResolvedValue(true);
const mockSetView = vi.fn();

const { mockActiveProviders } = vi.hoisted(() => ({
  mockActiveProviders: [
    {
      name: 'config-provider',
      is_configured: true,
      is_available: true,
      metadata: {
        display_name: 'Config Provider',
        default_model: 'config-model',
        known_models: [
          { name: 'config-model', context_limit: 128000 },
          { name: 'extra-model', context_limit: 200000, reasoning: true },
        ],
      },
    },
  ],
}));

vi.mock('../../../ModelAndProviderContext', () => ({
  useModelAndProvider: () => ({
    currentModel: mockCurrentModel,
    currentProvider: mockCurrentProvider,
    changeModel: mockChangeModel,
  }),
}));

vi.mock('../../../ConfigContext', () => ({
  useConfig: () => ({
    getProviders: mockGetProviders,
  }),
}));

vi.mock('../../../../acp/providers', () => ({
  acpListProviderDetails: vi.fn().mockResolvedValue(mockActiveProviders),
  acpReadThinkingEffort: vi.fn().mockResolvedValue(null),
}));

vi.mock('../modelInterface', () => ({
  getProviderMetadata: vi.fn().mockResolvedValue({ display_name: 'Config Provider' }),
  fetchModelReasoning: vi.fn().mockResolvedValue(null),
  fetchModelsForProviders: vi.fn().mockResolvedValue([
    {
      provider: mockActiveProviders[0],
      models: [
        { name: 'config-model', provider: 'config-provider', context_limit: 128000 },
        {
          name: 'extra-model',
          provider: 'config-provider',
          context_limit: 200000,
          reasoning: true,
        },
      ],
      error: null,
      warning: null,
    },
  ]),
}));

vi.mock('../predefinedModelsUtils', () => ({
  getModelDisplayName: (model: string) => `Display ${model}`,
  shouldShowPredefinedModels: () => false,
  getPredefinedModelsFromEnv: () => [],
}));

vi.mock('../../../ui/popover', () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="model-menu" data-open={open}>
      <button onClick={() => onOpenChange(true)}>Open model menu</button>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
  PopoverClose: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverAnchor: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../subcomponents/SwitchModelModal', () => ({
  SwitchModelModal: () => <div data-testid="switch-model-modal" />,
}));

vi.mock('../../localInference/ModelSettingsPanel', () => ({
  ModelSettingsPanel: () => <div data-testid="local-model-settings-panel" />,
}));

vi.mock('../../../ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ModelsBottomBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentModel = 'config-model';
    mockCurrentProvider = 'config-provider';
    mockGetProviders.mockResolvedValue([]);
  });

  it('shows a loading placeholder while the active session model is still loading', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={mockSetView}
        onModelChanged={mockOnModelChanged}
        sessionLoaded={false}
      />
    );

    expect(screen.getByTestId('model-loading-state')).toHaveTextContent('Loading model...');
  });

  it('shows the active session model once the session has loaded', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={mockSetView}
        sessionModel="session-model"
        sessionProvider="session-provider"
        onModelChanged={mockOnModelChanged}
        sessionLoaded={true}
      />
    );

    expect(screen.getByText('session-model')).toBeInTheDocument();
    expect(screen.queryByTestId('model-loading-state')).not.toBeInTheDocument();
  });

  it('shows the configured model when there is no active session', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId={null}
        dropdownRef={createDropdownRef()}
        setView={mockSetView}
        onModelChanged={mockOnModelChanged}
      />
    );

    expect(screen.getByText('config-model')).toBeInTheDocument();
    expect(screen.queryByTestId('model-loading-state')).not.toBeInTheDocument();
  });

  it('opens quick model picker and renders visible models', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={mockSetView}
        sessionModel="config-model"
        sessionProvider="config-provider"
        onModelChanged={mockOnModelChanged}
        sessionLoaded={true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open model menu' }));
    expect(screen.getByTestId('model-menu')).toHaveAttribute('data-open', 'true');

    await waitFor(() => {
      expect(screen.getByTestId('quick-model-picker-content')).toBeInTheDocument();
      expect(screen.getByTestId('visible-models-section')).toBeInTheDocument();
      expect(screen.getByTestId('model-item-config-model')).toBeInTheDocument();
    });
  });

  it('filters models using the search input', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={mockSetView}
        sessionModel="config-model"
        sessionProvider="config-provider"
        onModelChanged={mockOnModelChanged}
        sessionLoaded={true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open model menu' }));

    await waitFor(() => {
      expect(screen.getByTestId('model-picker-search-input')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('model-picker-search-input');
    fireEvent.change(searchInput, { target: { value: 'extra' } });

    await waitFor(() => {
      expect(screen.getByTestId('model-item-extra-model')).toBeInTheDocument();
      expect(screen.queryByTestId('model-item-config-model')).not.toBeInTheDocument();
    });
  });

  it('selects a model in one click and applies it to chat', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={mockSetView}
        sessionModel="config-model"
        sessionProvider="config-provider"
        onModelChanged={mockOnModelChanged}
        sessionLoaded={true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open model menu' }));

    await waitFor(() => {
      expect(screen.getByTestId('model-item-config-model')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('model-item-config-model'));

    await waitFor(() => {
      expect(mockChangeModel).toHaveBeenCalledWith('session-123', {
        name: 'config-model',
        provider: 'config-provider',
      });
      expect(mockOnModelChanged).toHaveBeenCalledWith({
        model: 'config-model',
        provider: 'config-provider',
      });
    });
  });

  it('opens visible models settings when configure button is clicked', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={mockSetView}
        sessionModel="config-model"
        sessionProvider="config-provider"
        onModelChanged={mockOnModelChanged}
        sessionLoaded={true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open model menu' }));

    await waitFor(() => {
      expect(screen.getByTestId('btn-configure-visible-models')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-configure-visible-models'));
    expect(mockSetView).toHaveBeenCalledWith('settings', { section: 'models' });
  });

  it('opens more options switch model modal when clicked', async () => {
    renderWithIntl(
      <ModelsBottomBar
        sessionId="session-123"
        dropdownRef={createDropdownRef()}
        setView={mockSetView}
        sessionModel="config-model"
        sessionProvider="config-provider"
        onModelChanged={mockOnModelChanged}
        sessionLoaded={true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open model menu' }));

    await waitFor(() => {
      expect(screen.getByTestId('btn-more-options')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-more-options'));
    expect(screen.getByTestId('switch-model-modal')).toBeInTheDocument();
  });
});
