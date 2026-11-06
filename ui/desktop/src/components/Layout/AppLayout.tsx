import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IpcRendererEvent } from 'electron';
import { Outlet, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';
import { Button } from '../ui/button';
import ChatSessionsContainer from '../ChatSessionsContainer';
import { useChatContext } from '../../contexts/ChatContext';
import { NavigationProvider, useNavigationContext } from './NavigationContext';
import { WorkspaceProvider, useWorkspace } from '../../contexts/WorkspaceContext';
import { Navigation } from './NavigationPanel';
import { EditorArea } from '../Editor/EditorArea';
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
});

interface AppLayoutContentProps {
  activeSessions: Array<{
    sessionId: string;
    initialMessage?: UserInput;
    noAutoSubmit?: boolean;
  }>;
  liveVoice: LiveVoiceController;
}

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
  } = useWorkspace();

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

  // Chat panel splitter resizing (Chat is on the left)
  const isChatResizing = useRef(false);
  const startChatX = useRef(0);
  const startChatWidth = useRef(0);

  const handleChatResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isChatResizing.current = true;
      startChatX.current = e.clientX;
      startChatWidth.current = chatWidth;
      e.preventDefault();
    },
    [chatWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isChatResizing.current) return;
      const delta = e.clientX - startChatX.current;
      setChatWidth(startChatWidth.current + delta);
    };
    const handleMouseUp = () => {
      if (isChatResizing.current) {
        isChatResizing.current = false;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setChatWidth]);

  // File explorer splitter resizing (File explorer is on the right)
  const isExplorerResizing = useRef(false);
  const startExplorerX = useRef(0);
  const startExplorerWidth = useRef(0);

  const handleExplorerResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isExplorerResizing.current = true;
      startExplorerX.current = e.clientX;
      startExplorerWidth.current = explorerWidth;
      e.preventDefault();
    },
    [explorerWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isExplorerResizing.current) return;
      const delta = e.clientX - startExplorerX.current;
      setExplorerWidth(startExplorerWidth.current - delta);
    };
    const handleMouseUp = () => {
      if (isExplorerResizing.current) {
        isExplorerResizing.current = false;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setExplorerWidth]);

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

      if (isModifier && (e.key.toLowerCase() === 'j' || e.code === 'KeyJ') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setIsChatVisible((v) => !v);
        return;
      }

      if (
        isModifier &&
        e.shiftKey &&
        (e.key.toLowerCase() === 'e' || e.code === 'KeyE')
      ) {
        e.preventDefault();
        setIsExplorerVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsChatVisible, setIsExplorerVisible]);

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

  return (
    <div className="flex flex-col flex-1 w-full h-full relative animate-fade-in bg-background-primary overflow-hidden">
      {/* Workspace Top Header Bar */}
      <div
        style={{ zIndex: Z_INDEX.HEADER }}
        className="h-9 w-full flex items-center justify-between px-3 border-b border-border-primary/40 bg-background-secondary/30 select-none flex-shrink-0 app-drag-region relative"
      >
        {/* Left Section: Traffic light spacing on macOS */}
        <div className={cn('flex items-center gap-1.5', needsTrafficLightInset ? 'w-[76px]' : 'w-2')} />

        {/* Right Section: Workspace & Layout toggles */}
        <div className="flex items-center gap-1 no-drag">
          {/* Left Panel (Navigation Sidebar) */}
          <Button
            onClick={() => setIsNavExpanded(!isNavExpanded)}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              'no-drag h-7 w-7 p-0 flex items-center justify-center rounded-md transition-colors cursor-pointer',
              isNavExpanded
                ? 'bg-background-tertiary text-text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60'
            )}
            variant="ghost"
            size="xs"
            title={navToggleTitle}
            aria-label={navToggleTitle}
          >
            <PanelLayoutIcon position="left" isOpen={isNavExpanded} />
          </Button>

          {/* Chat Window Toggle (Message icon), Center Panel (Editor) & Right Panel (Files) on Main Workspace Routes */}
          {isMainWorkspaceRoute && (
            <>
              <div className="w-[1px] h-4 bg-border-primary/40 mx-0.5" />
              <Button
                onClick={() => setIsChatVisible((v) => !v)}
                onMouseDown={(e) => e.stopPropagation()}
                className={cn(
                  'no-drag h-7 w-7 p-0 flex items-center justify-center rounded-md transition-colors cursor-pointer',
                  isChatVisible
                    ? 'bg-background-tertiary text-text-primary shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60'
                )}
                variant="ghost"
                size="xs"
                title={chatToggleTitle}
                aria-label={chatToggleTitle}
              >
                <MessageSquare
                  className={cn(
                    'w-4 h-4 pointer-events-none transition-colors',
                    isChatVisible && 'fill-current'
                  )}
                />
              </Button>
              <Button
                onClick={() => setIsEditorVisible((v) => !v)}
                onMouseDown={(e) => e.stopPropagation()}
                className={cn(
                  'no-drag h-7 w-7 p-0 flex items-center justify-center rounded-md transition-colors cursor-pointer',
                  isEditorVisible
                    ? 'bg-background-tertiary text-text-primary shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60'
                )}
                variant="ghost"
                size="xs"
                title={editorToggleTitle}
                aria-label={editorToggleTitle}
              >
                <PanelLayoutIcon position="center" isOpen={isEditorVisible} />
              </Button>
              <Button
                onClick={() => setIsExplorerVisible((v) => !v)}
                onMouseDown={(e) => e.stopPropagation()}
                className={cn(
                  'no-drag h-7 w-7 p-0 flex items-center justify-center rounded-md transition-colors cursor-pointer',
                  isExplorerVisible
                    ? 'bg-background-tertiary text-text-primary shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60'
                )}
                variant="ghost"
                size="xs"
                title={explorerToggleTitle}
                aria-label={explorerToggleTitle}
              >
                <PanelLayoutIcon position="right" isOpen={isExplorerVisible} />
              </Button>
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
            {/* Left Panel: Goose Agent Chat or Hub ("Новый чат") */}
            {isChatVisible ? (
              <div
                style={{ width: isEditorVisible || isExplorerVisible ? chatWidth : '100%' }}
                className={cn(
                  'h-full p-2 pl-0 flex flex-col min-w-[300px]',
                  isEditorVisible || isExplorerVisible ? 'flex-shrink-0' : 'flex-1'
                )}
              >
                <div className="w-full h-full overflow-hidden rounded-xl border border-border-primary bg-background-primary relative">
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
            ) : (
              <div className="hidden">
                <Outlet />
                <ChatSessionsContainer
                  setChat={setChat}
                  activeSessions={activeSessions}
                  liveVoice={liveVoice}
                />
              </div>
            )}

            {/* Splitter between Chat/Hub and Center */}
            {isChatVisible && (isEditorVisible || isExplorerVisible) && (
              <div
                className="w-1.5 h-full cursor-col-resize hover:bg-border-primary/40 active:bg-goose-teal/40 transition-colors flex-shrink-0"
                onMouseDown={handleChatResizeMouseDown}
                title="Перетащите для изменения ширины"
              />
            )}

            {/* Center Panel: Editor Area */}
            {isEditorVisible && (
              <div
                className={cn(
                  'h-full p-2 pl-0 flex flex-col min-w-[300px]',
                  isExplorerVisible || isChatVisible ? 'flex-1' : 'flex-1 w-full'
                )}
              >
                <EditorArea />
              </div>
            )}

            {/* Splitter between Editor and File Explorer */}
            {isEditorVisible && isExplorerVisible && (
              <div
                className="w-1.5 h-full cursor-col-resize hover:bg-border-primary/40 active:bg-goose-teal/40 transition-colors flex-shrink-0"
                onMouseDown={handleExplorerResizeMouseDown}
                title="Перетащите для изменения ширины"
              />
            )}

            {/* Right Panel: File Explorer */}
            {isExplorerVisible && (
              <div
                style={{ width: isEditorVisible || isChatVisible ? explorerWidth : '100%' }}
                className={cn(
                  'h-full p-2 pl-0 flex flex-col min-w-[200px]',
                  isEditorVisible || isChatVisible ? 'flex-shrink-0' : 'flex-1'
                )}
              >
                <div className="w-full h-full overflow-hidden rounded-xl border border-border-primary bg-background-primary relative">
                  <FileExplorer />
                </div>
              </div>
            )}

            {/* Empty state when all workspace panels are closed */}
            {!isChatVisible && !isEditorVisible && !isExplorerVisible && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-text-secondary select-none">
                <p className="text-sm font-medium mb-3 text-text-primary">Все рабочие панели скрыты</p>
                <div className="flex items-center gap-2">
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
                    onClick={() => setIsExplorerVisible(true)}
                    className="cursor-pointer"
                  >
                    <PanelLayoutIcon position="right" isOpen={true} className="mr-1.5" />
                    Файлы
                  </Button>
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
        <AppLayoutContent activeSessions={activeSessions} liveVoice={liveVoice} />
      </WorkspaceProvider>
    </NavigationProvider>
  );
};
