/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorTabs } from './EditorTabs';

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const workspace = vi.hoisted(() => ({
  openFiles: [] as { path: string; name: string; isDirty: boolean }[],
  activeFilePath: null as string | null,
  setActiveFilePath: vi.fn(),
  setSelectedFile: vi.fn(),
  closeFile: vi.fn(),
}));

vi.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspace,
}));

function file(name: string) {
  return { path: `/repo/${name}`, name, isDirty: false };
}

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

describe('EditorTabs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    workspace.openFiles = [];
    workspace.activeFilePath = null;
    workspace.setActiveFilePath.mockReset();
    workspace.setSelectedFile.mockReset();
    workspace.closeFile.mockReset();
  });

  it('does not show scroll buttons when every tab fits', () => {
    mockStripSize({ client: 400, scroll: 200 });
    workspace.openFiles = [file('main.rs'), file('lib.rs')];
    workspace.activeFilePath = '/repo/main.rs';
    render(<EditorTabs />);

    const scroller = screen.getByTestId('editor-tabs-scroller');
    expect(scroller.className).toContain('overflow-x-hidden');
    expect(screen.queryByRole('button', { name: 'Предыдущие вкладки' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Следующие вкладки' })).toBeNull();
  });

  it('scrolls hidden tabs with the side buttons and does not use a horizontal scrollbar', () => {
    const readScrollLeft = mockStripSize({ client: 100, scroll: 500 });
    workspace.openFiles = ['a.rs', 'b.rs', 'c.rs', 'd.rs', 'e.rs'].map(file);
    workspace.activeFilePath = '/repo/a.rs';
    render(<EditorTabs />);

    const scroller = screen.getByTestId('editor-tabs-scroller');
    expect(scroller.className).not.toContain('overflow-x-auto');
    const next = screen.getByRole('button', { name: 'Следующие вкладки' });
    const previous = screen.getByRole('button', { name: 'Предыдущие вкладки' });
    expect(previous).toHaveProperty('disabled', true);

    fireEvent.click(next);
    expect(readScrollLeft()).toBe(120);
    expect(screen.getByRole('button', { name: 'Предыдущие вкладки' })).toHaveProperty(
      'disabled',
      false
    );

    fireEvent.click(screen.getByRole('button', { name: 'Предыдущие вкладки' }));
    expect(readScrollLeft()).toBe(0);
  });
});
