import React from 'react';
import { Plus, Terminal as TerminalIcon } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { TerminalTabs } from './TerminalTabs';
import { TerminalInstance } from './TerminalInstance';
import { Button } from '../ui/button';

export const TerminalPanel: React.FC = () => {
  const { sessions, activeTerminalId, createTerminal, updateSessionExitCode, terminalFontSize } =
    useTerminal();

  return (
    <div className="flex flex-col w-full h-full bg-background-primary overflow-hidden rounded-xl border border-border-primary">
      <TerminalTabs />

      <div className="flex-1 min-h-0 relative bg-background-primary overflow-hidden">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary select-none gap-3 p-4">
            <TerminalIcon className="w-8 h-8 opacity-40" />
            <p className="text-xs">No active terminal sessions</p>
            <Button
              variant="outline"
              size="xs"
              onClick={() => createTerminal()}
              className="gap-1.5 cursor-pointer text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              New Terminal
            </Button>
          </div>
        ) : (
          sessions.map((session) => (
            <TerminalInstance
              key={session.id}
              id={session.id}
              active={session.id === activeTerminalId}
              fontSize={terminalFontSize}
              onExit={(exitCode) => updateSessionExitCode(session.id, exitCode)}
            />
          ))
        )}
      </div>
    </div>
  );
};
