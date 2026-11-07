import React, { useEffect, useRef } from 'react';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  archiveSession: {
    id: 'navigationPanel.archiveSession',
    defaultMessage: 'Archive',
  },
  restoreSession: {
    id: 'navigationPanel.restoreSession',
    defaultMessage: 'Restore from archive',
  },
  deleteSession: {
    id: 'navigationPanel.deleteChat',
    defaultMessage: 'Delete',
  },
});

interface SessionContextMenuProps {
  x: number;
  y: number;
  archived: boolean;
  onClose: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}

export const SessionContextMenu: React.FC<SessionContextMenuProps> = ({
  x,
  y,
  archived,
  onClose,
  onArchive,
  onUnarchive,
  onDelete,
}) => {
  const intl = useIntl();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 96);

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      className="fixed z-50 w-56 bg-background-secondary border border-border-primary rounded-lg shadow-xl py-1 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
      role="menu"
    >
      {archived ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => run(onUnarchive)}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-background-tertiary text-text-primary text-left transition-colors"
        >
          <ArchiveRestore className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
          <span>{intl.formatMessage(i18n.restoreSession)}</span>
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          onClick={() => run(onArchive)}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-background-tertiary text-text-primary text-left transition-colors"
        >
          <Archive className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
          <span>{intl.formatMessage(i18n.archiveSession)}</span>
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => run(onDelete)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/10 text-red-400 hover:text-red-300 text-left transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
        <span>{intl.formatMessage(i18n.deleteSession)}</span>
      </button>
    </div>
  );
};
