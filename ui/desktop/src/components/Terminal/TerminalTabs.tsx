import React from 'react';
import {
  Plus,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  Sparkles,
  ChevronDown,
  Terminal as TerminalIcon,
} from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { cn } from '../../utils';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export const TerminalTabs: React.FC = () => {
  const {
    sessions,
    activeTerminalId,
    setActiveTerminalId,
    createTerminal,
    closeTerminal,
    isMaximized,
    toggleMaximize,
    clearActiveTerminal,
    sendToChat,
    setIsTerminalVisible,
  } = useTerminal();

  const { workspaceFolders } = useWorkspace();
  const hasMultipleFolders = workspaceFolders && workspaceFolders.length > 1;

  return (
    <div className="h-8 w-full flex items-center justify-between border-b border-border-primary/40 bg-background-secondary/40 px-2 select-none flex-shrink-0 text-xs">
      {/* Left: Tabs list and Add button */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0 pr-2">
        {sessions.map((session) => {
          const isActive = session.id === activeTerminalId;
          const isExited = session.exitCode !== null && session.exitCode !== undefined;

          return (
            <div
              key={session.id}
              onClick={() => setActiveTerminalId(session.id)}
              className={cn(
                'group h-6.5 px-2.5 flex items-center gap-1.5 rounded-md cursor-pointer transition-colors max-w-[160px] flex-shrink-0',
                isActive
                  ? 'bg-background-primary text-text-primary shadow-xs font-medium border border-border-primary/40'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/40'
              )}
            >
              <TerminalIcon className="w-3 h-3 flex-shrink-0 opacity-70" />
              <span className="truncate flex-1" title={session.title}>
                {session.title}
              </span>

              {isExited && (
                <span
                  className={cn(
                    'px-1 py-0.2 rounded text-[10px] font-mono leading-none',
                    session.exitCode === 0
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-rose-500/10 text-rose-500'
                  )}
                  title={`Exited with code ${session.exitCode}`}
                >
                  {session.exitCode}
                </span>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-400 rounded p-0.5 transition-opacity cursor-pointer"
                title="Close Terminal"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Add Terminal button */}
        {hasMultipleFolders ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-6 w-6 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60 transition-colors cursor-pointer"
                title="New Terminal..."
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 text-xs">
              <DropdownMenuItem onClick={() => createTerminal()}>
                <TerminalIcon className="w-3.5 h-3.5 mr-2" />
                Default Workspace
              </DropdownMenuItem>
              {workspaceFolders.map((folder) => (
                <DropdownMenuItem
                  key={folder.path}
                  onClick={() => createTerminal(folder.path)}
                  className="truncate"
                >
                  <span className="truncate">{folder.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            type="button"
            onClick={() => createTerminal()}
            className="h-6 w-6 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60 transition-colors cursor-pointer"
            title="New Terminal"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Right: Actions toolbar */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => sendToChat()}
          className="h-6 px-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60 cursor-pointer gap-1"
          title="Debug with Goose (Send output to Chat)"
        >
          <Sparkles className="w-3.5 h-3.5 text-goose-teal" />
          <span className="hidden sm:inline">Ask Goose</span>
        </Button>

        <Button
          variant="ghost"
          size="xs"
          onClick={clearActiveTerminal}
          className="h-6 w-6 p-0 text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60 cursor-pointer"
          title="Clear Buffer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="xs"
          onClick={toggleMaximize}
          className="h-6 w-6 p-0 text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60 cursor-pointer"
          title={isMaximized ? 'Restore Panel' : 'Maximize Panel'}
        >
          {isMaximized ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="xs"
          onClick={() => setIsTerminalVisible(false)}
          className="h-6 w-6 p-0 text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60 cursor-pointer"
          title="Close Terminal Panel"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
