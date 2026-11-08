import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IpcRendererEvent } from 'electron';
import { Outlet, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import { FolderTree, MessageSquare, Terminal } from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';
import { Button } from '../ui/button';
import ChatSessionsContainer from '../ChatSessionsContainer';
import { useChatContext } from '../../contexts/ChatContext';
import { NavigationProvider, useNavigationContext } from './NavigationContext';
import { WorkspaceProvider, useWorkspace } from '../../contexts/WorkspaceContext';
import { TerminalProvider, useTerminal } from '../../contexts/TerminalContext';
import { Navigation } from './NavigationPanel';
import { EditorArea } from '../Editor/EditorArea';
import { TerminalPanel } from '../Terminal/TerminalPanel';
import { ChatTabs } from './ChatTabs';
import { FileExplorer } from '../FileExplorer/FileExplorer';
import { PanelLayoutIcon } from './PanelLayoutIcon';
import { Z_INDEX } from './constants';
import { cn } from '../../utils';
import { UserInput } from '../../types/message';
import type { LiveVoiceController } from '../../liveVoice/useLiveVoice';

const i18n = defineMessages({
  openNavigation: {
    id: 'appLayout.openNavigation',
    defaultMessage: 'Open navigation',
  },
  collapseNavigation: {
    id: 'appLayout.collapseNavigation',
    defaultMessage: 'Collapse navigation',
  },
  toggleChat: {
    id: 'appLayout.toggleChat',
    defaultMessage: 'Toggle chat',
  },
  toggleEditor: {
    id: 'appLayout.toggleEditor',
    defaultMessage: 'Toggle editor',
  },
  toggleExplorer: {
    id: 'appLayout.toggleExplorer',
    defaultMessage: 'Toggle File Explorer',
  },
  toggleTerminal: {
    id: 'appLayout.toggleTerminal',
    defaultMessage: 'Toggle terminal',
  },
});

interface AppLayoutContentProps {
  activeSessions: Array<{
    sessionId: string;
    initialMessage?: UserInput;
    noAutoSubmit?: boolean;
  }>;
  liveVoice: LiveVoiceController;
}

interface PanelToggleButtonProps {
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const PanelToggleButton: React.FC<PanelToggleButtonProps> = ({
  title,
  active,
  onClick,
  children,
}) => (
  <Button
    onClick={onClick}
    onMouseDown={(e) => e.stopPropagation()}
    className={cn(
      'no-drag h-7 w-7 p-0 flex items-center justify-center rounded-md transition-colors cursor-pointer',
      active
        ? 'bg-background-tertiary text-text-primary shadow-xs'
        : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60'
    )}
    variant="ghost"
    size="xs"
    title={title}
    aria-label={title}
  >
    {children}
  </Button>
);

const AppLayoutContent: React.FC<AppLayoutContentProps> = ({ activeSessions, liveVoice }) => {
  const intl = useIntl();
  const location = useLocation();
  const safeIsMacOS = (window?.electron?.platform || 'darwin') === 'darwin';
  const chatContext = useChatContext();
  const isOnPairRoute = location.pathname === '/pair';
  const isMainWorkspaceRoute = location.pathname === '/' || location.pathname === '/pair';
  const isOnSettingsRoute = location.pathname === '/settings';

  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!safeIsMacOS) return;
    window.electron
      .getIsFullScreen()
      .then(setIsFullScreen)
      .catch(() => {});
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => {
      setIsFullScreen(Boolean(args[0]));
    };
    window.electron.on('fullscreen-change', handler);
    return () => window.electron.off('fullscreen-change', handler);
  }, [safeIsMacOS]);

  const { isNavExpanded, setIsNavExpanded, navWidth, setNavWidth } = useNavigationContext();
  const {
    isChatVisible,
    setIsChatVisible,
    isEditorVisible,
    setIsEditorVisible,
    chatWidth,
    setChatWidth,
    isExplorerVisible,
    setIsExplorerVisible,
    explorerWidth,
    setExplorerWidth,
    swapChatAndExplorer,
  } = useWorkspace();

  const {
    isTerminalVisible,
    setIsTerminalVisible,
    terminalHeight,
    setTerminalHeight,
    isMaximized,
    toggleTerminal,
    createTerminal,
  } = useTerminal();

  const isTerminalResizing = useRef(false);
  const startTerminalY = useRef(0);
  const startTerminalHeight = useRef(0);

  const handleTerminalResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isTerminalResizing.current = true;
      startTerminalY.current = e.clientY;
      startTerminalHeight.current = terminalHeight;
      e.preventDefault();
    },
    [terminalHeight]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isTerminalResizing.current) return;
      const deltaY = startTerminalY.current - e.clientY;
      setTerminalHeight(startTerminalHeight.current + deltaY);
    };
    const handleMouseUp = () => {
      isTerminalResizing.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setTerminalHeight]);

  const [isNavDragging, setIsNavDragging] = useState(false);
  const isNavResizing = useRef(false);
  const startNavX = useRef(0);
  const startNavWidth = useRef(0);

  const handleNavResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isNavResizing.current = true;
      startNavX.current = e.clientX;
      startNavWidth.current = navWidth;
      setIsNavDragging(true);
      e.preventDefault();
    },
    [navWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isNavResizing.current) return;
      setNavWidth(startNavWidth.current + (e.clientX - startNavX.current));
    };
    const handleMouseUp = () => {
      if (isNavResizing.current) {
        isNavResizing.current = false;
        setIsNavDragging(false);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setNavWidth]);

  // Splitter resizing by layout side: each splitter controls the width of
  // whichever panel (chat or file explorer) currently occupies its side
  const isLeftResizing = useRef(false);
  const startLeftX = useRef(0);
  const startLeftWidth = useRef(0);

  const handleLeftResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isLeftResizing.current = true;
      startLeftX.current = e.clientX;
      startLeftWidth.current = swapChatAndExplorer ? explorerWidth : chatWidth;
      e.preventDefault();
    },
    [swapChatAndExplorer, chatWidth, explorerWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isLeftResizing.current) return;
      const delta = e.clientX - startLeftX.current;
      const next = startLeftWidth.current + delta;
      if (swapChatAndExplorer) {
        setExplorerWidth(next);
      } else {
        setChatWidth(next);
      }
    };
    const handleMouseUp = () => {
      isLeftResizing.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [swapChatAndExplorer, setChatWidth, setExplorerWidth]);

  const isRightResizing = useRef(false);
  const startRightX = useRef(0);
  const startRightWidth = useRef(0);

  const handleRightResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isRightResizing.current = true;
      startRightX.current = e.clientX;
      startRightWidth.current = swapChatAndExplorer ? chatWidth : explorerWidth;
      e.preventDefault();
    },
    [swapChatAndExplorer, chatWidth, explorerWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isRightResizing.current) return;
      const delta = e.clientX - startRightX.current;
      const next = startRightWidth.current - delta;
      if (swapChatAndExplorer) {
        setChatWidth(next);
      } else {
        setExplorerWidth(next);
      }
    };
    const handleMouseUp = () => {
      isRightResizing.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [swapChatAndExplorer, setChatWidth, setExplorerWidth]);

  // Cmd+B / Ctrl+B to toggle navigation and sessions sidebar (isNavExpanded)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        setIsNavExpanded(!isNavExpanded);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNavExpanded, setIsNavExpanded]);

  // Cmd+Shift+E / Ctrl+Shift+E to toggle file explorer panel (isExplorerVisible)
  // Cmd+J / Ctrl+J to toggle chat window (isChatVisible)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const isModifier = e.metaKey || e.ctrlKey;

      if (
        isModifier &&
        (e.key.toLowerCase() === 'j' || e.code === 'KeyJ') &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault();
        setIsChatVisible((v) => !v);
        return;
      }

      if (isModifier && e.shiftKey && (e.key.toLowerCase() === 'e' || e.code === 'KeyE')) {
        e.preventDefault();
        setIsExplorerVisible((v) => !v);
        return;
      }

      if (isModifier && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault();
        if (e.shiftKey) {
          createTerminal();
        } else {
          toggleTerminal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsChatVisible, setIsExplorerVisible, toggleTerminal, createTerminal]);

  if (!chatContext) {
    throw new Error('AppLayoutContent must be used within ChatProvider');
  }

  const { setChat } = chatContext;

  if (isOnSettingsRoute) {
    return (
      <div className="relative flex h-full w-full flex-1 bg-background-secondary">
        <Outlet />
        <div className="hidden">
          <ChatSessionsContainer
            setChat={setChat}
            activeSessions={activeSessions}
            liveVoice={liveVoice}
          />
        </div>
      </div>
    );
  }

  const needsTrafficLightInset = safeIsMacOS && !isFullScreen;
  const chatShortcut = safeIsMacOS ? '⌘J' : 'Ctrl+J';
  const chatToggleTitle = `${intl.formatMessage(i18n.toggleChat)} (${chatShortcut})`;
  const navToggleTitle = intl.formatMessage(
    isNavExpanded ? i18n.collapseNavigation : i18n.openNavigation
  );
  const editorToggleTitle = intl.formatMessage(i18n.toggleEditor);
  const explorerShortcut = safeIsMacOS ? '⌘⇧E' : 'Ctrl+Shift+E';
  const explorerToggleTitle = `${intl.formatMessage(i18n.toggleExplorer)} (${explorerShortcut})`;

  const chatToggleButton = (
    <PanelToggleButton
      title={chatToggleTitle}
      active={isChatVisible}
      onClick={() => setIsChatVisible((v) => !v)}
    >
      <MessageSquare
        className={cn(
          'w-4 h-4 pointer-events-none transition-colors',
          isChatVisible && 'fill-current'
        )}
      />
    </PanelToggleButton>
  );
  const editorToggleButton = (
    <PanelToggleButton
      title={editorToggleTitle}
      active={isEditorVisible}
      onClick={() => setIsEditorVisible((v) => !v)}
    >
      <PanelLayoutIcon position="center" isOpen={isEditorVisible} />
    </PanelToggleButton>
  );
  const explorerToggleButton = (
    <PanelToggleButton
      title={explorerToggleTitle}
      active={isExplorerVisible}
      onClick={() => setIsExplorerVisible((v) => !v)}
    >
      <FolderTree
        className={cn(
          'w-4 h-4 pointer-events-none transition-colors',
          isExplorerVisible && 'fill-current'
        )}
      />
    </PanelToggleButton>
  );
  const terminalShortcut = safeIsMacOS ? '⌘`' : 'Ctrl+`';
  const terminalToggleTitle = `${intl.formatMessage(i18n.toggleTerminal)} (${terminalShortcut})`;
  const terminalToggleButton = (
    <PanelToggleButton
      title={terminalToggleTitle}
      active={isTerminalVisible}
      onClick={toggleTerminal}
    >
      <Terminal
        className={cn(
          'w-4 h-4 pointer-events-none transition-colors',
          isTerminalVisible && 'text-text-primary'
        )}
      />
    </PanelToggleButton>
  );

  const isLeftPanelVisible = swapChatAndExplorer ? isExplorerVisible : isChatVisible;
  const isRightPanelVisible = swapChatAndExplorer ? isChatVisible : isExplorerVisible;
  const isCenterVisible = isEditorVisible || isTerminalVisible;

  const renderChatPanel = (side: 'left' | 'right') =>
    isChatVisible ? (
      <div
        style={{ width: isCenterVisible || isExplorerVisible ? chatWidth : '100%' }}
        className={cn(
          'h-full p-2 pl-0 flex flex-col min-w-[300px]',
          isCenterVisible || isExplorerVisible ? 'flex-shrink-0' : 'flex-1',
          side === 'right' && 'ml-auto'
        )}
      >
        <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border-primary bg-background-primary">
          <ChatTabs sessionIds={activeSessions.map((session) => session.sessionId)} />
          <div className="relative min-h-0 flex-1">
            {isOnPairRoute ? (
              <>
                <Outlet />
                <ChatSessionsContainer
                  setChat={setChat}
                  activeSessions={activeSessions}
                  liveVoice={liveVoice}
                />
              </>
            ) : (
              <>
                <Outlet />
                <div className="hidden">
                  <ChatSessionsContainer
                    setChat={setChat}
                    activeSessions={activeSessions}
                    liveVoice={liveVoice}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    ) : (
      <div className="hidden">
        <Outlet />
        <ChatSessionsContainer
          setChat={setChat}
          activeSessions={activeSessions}
          liveVoice={liveVoice}
        />
      </div>
    );

  const renderExplorerPanel = (side: 'left' | 'right') =>
    isExplorerVisible && (
      <div
        style={{ width: isCenterVisible || isChatVisible ? explorerWidth : '100%' }}
        className={cn(
          'h-full p-2 pl-0 flex flex-col min-w-[200px]',
          isCenterVisible || isChatVisible ? 'flex-shrink-0' : 'flex-1',
          side === 'right' && 'ml-auto'
        )}
      >
        <div className="w-full h-full overflow-hidden rounded-xl border border-border-primary bg-background-primary relative">
          <FileExplorer />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col flex-1 w-full h-full relative animate-fade-in bg-background-primary overflow-hidden">
      {/* Workspace Top Header Bar */}
      <div
        style={{ zIndex: Z_INDEX.HEADER }}
        className="h-9 w-full flex items-center justify-between px-3 border-b border-border-primary/40 bg-background-secondary/30 select-none flex-shrink-0 app-drag-region relative"
      >
        {/* Left Section: Traffic light spacing on macOS */}
        <div
          className={cn('flex items-center gap-1.5', needsTrafficLightInset ? 'w-[76px]' : 'w-2')}
        />

        {/* Right Section: Workspace & Layout toggles */}
        <div className="flex items-center gap-1 no-drag">
          {/* Left Panel (Navigation Sidebar) */}
          <PanelToggleButton
            title={navToggleTitle}
            active={isNavExpanded}
            onClick={() => setIsNavExpanded(!isNavExpanded)}
          >
            <PanelLayoutIcon position="left" isOpen={isNavExpanded} />
          </PanelToggleButton>

          {/* Panel visibility toggles on Main Workspace Routes, ordered to match
              the physical panel positions (files left / chat right when swapped) */}
          {isMainWorkspaceRoute && (
            <>
              <div className="w-[1px] h-4 bg-border-primary/40 mx-0.5" />
              {swapChatAndExplorer ? (
                <>
                  {explorerToggleButton}
                  {editorToggleButton}
                  {terminalToggleButton}
                  {chatToggleButton}
                </>
              ) : (
                <>
                  {chatToggleButton}
                  {editorToggleButton}
                  {terminalToggleButton}
                  {explorerToggleButton}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main content with navigation. Shared canvas; the sidebar is a
          rounded outlined card floating on it with breathing room. */}
      <div className="flex flex-1 w-full min-h-0 flex-row">
        <motion.div
          key="nav"
          initial={false}
          animate={{ width: isNavExpanded ? navWidth : 0 }}
          transition={
            isNavDragging ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 40 }
          }
          style={{ height: '100%' }}
          className="relative flex-shrink-0 overflow-hidden h-full p-2"
        >
          <div className="w-full h-full overflow-hidden rounded-xl border border-border-primary">
            <Navigation activeLiveVoiceSessionId={liveVoice.activeSessionId} />
          </div>
          {isNavExpanded && (
            <div
              className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-border-primary/30 transition-colors"
              onMouseDown={handleNavResizeMouseDown}
            />
          )}
        </motion.div>

        {/* Workspace 3-Panel or Standard Route View */}
        {isMainWorkspaceRoute ? (
          <div className="flex flex-1 w-full h-full min-h-0 flex-row overflow-hidden">
            {/* Left Panel: chat by default, file explorer when panels are swapped */}
            {swapChatAndExplorer ? renderExplorerPanel('left') : renderChatPanel('left')}

            {/* Splitter between the left panel and the center */}
            {isLeftPanelVisible && (isCenterVisible || isRightPanelVisible) && (
              <div
                className="w-1.5 h-full cursor-col-resize hover:bg-border-primary/40 active:bg-goose-teal/40 transition-colors flex-shrink-0"
                onMouseDown={handleLeftResizeMouseDown}
                title="Перетащите для изменения ширины"
              />
            )}

            {/* Center Panel: Editor Area + Terminal Dock */}
            {isCenterVisible && (
              <div
                className={cn(
                  'h-full p-2 pl-0 flex flex-col min-w-[300px] overflow-hidden',
                  isExplorerVisible || isChatVisible ? 'flex-1' : 'flex-1 w-full'
                )}
              >
                {isEditorVisible && !isMaximized && (
                  <div className={cn('min-h-0', isTerminalVisible ? 'flex-1' : 'h-full')}>
                    <EditorArea />
                  </div>
                )}

                {isEditorVisible && isTerminalVisible && !isMaximized && (
                  <div
                    className="h-1.5 w-full cursor-row-resize hover:bg-border-primary/40 active:bg-goose-teal/40 transition-colors flex-shrink-0"
                    onMouseDown={handleTerminalResizeMouseDown}
                    title="Перетащите для изменения высоты"
                  />
                )}

                {isTerminalVisible && (
                  <div
                    style={isEditorVisible && !isMaximized ? { height: terminalHeight } : undefined}
                    className={cn(
                      'w-full flex-shrink-0 min-h-0',
                      (!isEditorVisible || isMaximized) && 'flex-1 h-full'
                    )}
                  >
                    <TerminalPanel />
                  </div>
                )}
              </div>
            )}

            {/* Splitter between the center and the right panel */}
            {isCenterVisible && isRightPanelVisible && (
              <div
                className="w-1.5 h-full cursor-col-resize hover:bg-border-primary/40 active:bg-goose-teal/40 transition-colors flex-shrink-0"
                onMouseDown={handleRightResizeMouseDown}
                title="Перетащите для изменения ширины"
              />
            )}

            {/* Right Panel: file explorer by default, chat when panels are
                swapped - pinned to the right window edge via ml-auto so it
                never slides left when the center panel is hidden */}
            {swapChatAndExplorer ? renderChatPanel('right') : renderExplorerPanel('right')}

            {/* Empty state when all workspace panels are closed */}
            {!isChatVisible && !isEditorVisible && !isExplorerVisible && !isTerminalVisible && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-text-secondary select-none">
                <p className="text-sm font-medium mb-3 text-text-primary">
                  Все рабочие панели скрыты
                </p>
                <div className="flex items-center gap-2">
                  {swapChatAndExplorer ? (
                    <>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setIsExplorerVisible(true)}
                        className="cursor-pointer"
                      >
                        <FolderTree className="w-3.5 h-3.5 mr-1.5" />
                        Файлы
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setIsEditorVisible(true)}
                        className="cursor-pointer"
                      >
                        <PanelLayoutIcon position="center" isOpen={true} className="mr-1.5" />
                        Редактор
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setIsTerminalVisible(true)}
                        className="cursor-pointer"
                      >
                        <Terminal className="w-3.5 h-3.5 mr-1.5" />
                        Терминал
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setIsChatVisible(true)}
                        className="cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                        Чат
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setIsChatVisible(true)}
                        className="cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                        Чат
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setIsEditorVisible(true)}
                        className="cursor-pointer"
                      >
                        <PanelLayoutIcon position="center" isOpen={true} className="mr-1.5" />
                        Редактор
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setIsTerminalVisible(true)}
                        className="cursor-pointer"
                      >
                        <Terminal className="w-3.5 h-3.5 mr-1.5" />
                        Терминал
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setIsExplorerVisible(true)}
                        className="cursor-pointer"
                      >
                        <FolderTree className="w-3.5 h-3.5 mr-1.5" />
                        Файлы
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden min-h-0 h-full">
            <Outlet />
            {/* Always render ChatSessionsContainer to keep SSE connections alive.
                When navigating away from /pair, hide it with CSS */}
            <div className="hidden">
              <ChatSessionsContainer
                setChat={setChat}
                activeSessions={activeSessions}
                liveVoice={liveVoice}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface AppLayoutProps {
  activeSessions: Array<{
    sessionId: string;
    initialMessage?: UserInput;
    noAutoSubmit?: boolean;
  }>;
  liveVoice: LiveVoiceController;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ activeSessions, liveVoice }) => {
  return (
    <NavigationProvider>
      <WorkspaceProvider>
        <TerminalProvider>
          <AppLayoutContent activeSessions={activeSessions} liveVoice={liveVoice} />
        </TerminalProvider>
      </WorkspaceProvider>
    </NavigationProvider>
  );
};
