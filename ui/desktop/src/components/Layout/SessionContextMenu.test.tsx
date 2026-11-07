/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../../i18n/test-utils';
import { SessionContextMenu } from './SessionContextMenu';

function renderMenu(
  archived: boolean,
  actions?: Partial<Record<'archive' | 'restore' | 'delete', () => void>>
) {
  const onArchive = actions?.archive ?? vi.fn();
  const onUnarchive = actions?.restore ?? vi.fn();
  const onDelete = actions?.delete ?? vi.fn();
  const onClose = vi.fn();
  render(
    <IntlTestWrapper>
      <SessionContextMenu
        x={10}
        y={10}
        archived={archived}
        onClose={onClose}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onDelete={onDelete}
      />
    </IntlTestWrapper>
  );
  return { onArchive, onUnarchive, onDelete, onClose };
}

describe('SessionContextMenu', () => {
  it('offers archive and delete for an active chat', () => {
    const { onArchive, onUnarchive, onDelete, onClose } = renderMenu(false);

    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeDefined();
    expect(screen.queryByRole('menuitem', { name: 'Restore from archive' })).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledOnce();
    expect(onUnarchive).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('offers restore and delete for an archived chat', () => {
    const { onArchive, onUnarchive, onDelete, onClose } = renderMenu(true);

    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore from archive' }));
    expect(onUnarchive).toHaveBeenCalledOnce();
    expect(onArchive).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
