/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppSettingsSection from './AppSettingsSection';
import { WorkspaceProvider } from '../../../contexts/WorkspaceContext';
import { IntlTestWrapper } from '../../../i18n/test-utils';

vi.mock('./UpdateSection', () => ({
  default: () => <div data-testid="update-section" />,
}));

vi.mock('../../GooseSidebar/ThemeSelector', () => ({
  default: () => <div data-testid="theme-selector" />,
}));

vi.mock('./TelemetrySettings', () => ({
  default: () => <div data-testid="telemetry-settings" />,
}));

const renderSection = () =>
  render(
    <IntlTestWrapper>
      <WorkspaceProvider>
        <AppSettingsSection />
      </WorkspaceProvider>
    </IntlTestWrapper>
  );

const getSwapPanelsSwitch = () => {
  const row = screen
    .getByText('Swap chat and file explorer positions')
    .closest('div.flex.items-center.justify-between');
  expect(row).not.toBeNull();
  return within(row as HTMLElement).getByRole('switch');
};

describe('AppSettingsSection swap panels setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    Object.defineProperty(window, 'appConfig', {
      configurable: true,
      value: { get: vi.fn(() => '') },
    });

    (window as unknown as { electron: Record<string, unknown> }).electron = {
      platform: 'darwin',
      getSetting: vi.fn().mockResolvedValue(null),
      setSetting: vi.fn().mockResolvedValue(undefined),
      getMenuBarIconState: vi.fn().mockResolvedValue(true),
      getDockIconState: vi.fn().mockResolvedValue(true),
      getWakelockState: vi.fn().mockResolvedValue(false),
      openNotificationsSettings: vi.fn().mockResolvedValue(true),
      on: vi.fn(),
      off: vi.fn(),
    };
  });

  it('renders the swap panels switch unchecked by default', async () => {
    renderSection();

    await waitFor(() => {
      expect(screen.getByText('Swap chat and file explorer positions')).toBeDefined();
    });
    expect(getSwapPanelsSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('saves the setting when the switch is toggled', async () => {
    renderSection();

    const swapSwitch = getSwapPanelsSwitch();
    fireEvent.click(swapSwitch);

    await waitFor(() => {
      expect(swapSwitch).toHaveAttribute('aria-checked', 'true');
    });
    expect(window.electron.setSetting).toHaveBeenCalledWith('swapChatAndExplorer', true);
  });

  it('restores the stored value on mount', async () => {
    (window.electron.getSetting as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string) => Promise.resolve(key === 'swapChatAndExplorer')
    );

    renderSection();

    await waitFor(() => {
      expect(getSwapPanelsSwitch()).toHaveAttribute('aria-checked', 'true');
    });
  });
});
