import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IpcRendererEvent } from 'electron';
import { Outlet, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import { PanelLeft, Columns2, FolderTree } from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';
import { Button } from '../ui/button';
import ChatSessionsContainer from '../ChatSessionsContainer';
import { useChatContext } from '../../contexts/ChatContext';
import { NavigationProvider, useNavigationContext } from './NavigationContext';
import { WorkspaceProvider, useWorkspace } from '../../contexts/WorkspaceContext';
import { Navigation } from './NavigationPanel';
import { EditorArea } from '../Editor/EditorArea';
import { FileExplorer } from '../FileExplorer/FileExplorer';
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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key.toLowerCase() === 'e' || e.code === 'KeyE')
      ) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        setIsExplorerVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsExplorerVisible]);

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
  const navToggleTitle = intl.formatMessage(
    isNavExpanded ? i18n.collapseNavigation : i18n.openNavigation
  );
  const editorToggleTitle = intl.formatMessage(i18n.toggleEditor);
  const explorerShortcut = safeIsMacOS ? '⌘⇧E' : 'Ctrl+Shift+E';
  const explorerToggleTitle = `${intl.formatMessage(i18n.toggleExplorer)} (${explorerShortcut})`;

  return (
    <div className="flex flex-col flex-1 w-full h-full relative animate-fade-in bg-background-primary overflow-hidden">
      {/* Workspace Top Header Bar */}
      <div className="h-9 w-full flex items-center justify-between px-3 border-b border-border-primary/40 bg-background-secondary/30 select-none flex-shrink-0 z-30">
        {/* Left Section: Traffic light spacing on macOS + Navigation sidebar toggle */}
        <div className={cn('flex items-center gap-1.5', needsTrafficLightInset ? 'pl-[76px]' : 'pl-1')}>
          <Button
            onClick={() => setIsNavExpanded(!isNavExpanded)}
            className="no-drag hover:!bg-background-tertiary h-7 w-7 p-0 flex items-center justify-center text-text-secondary hover:text-text-primary"
            variant="ghost"
            size="xs"
            title={navToggleTitle}
            aria-label={navToggleTitle}
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* Right Section: Workspace toggles */}
        {isMainWorkspaceRoute && (
          <div className="flex items-center gap-1.5">
            <Button
              onClick={() => setIsEditorVisible((v) => !v)}
              className={cn(
                'no-drag h-7 px-2 flex items-center gap-1.5 text-xs rounded-md transition-colors',
                isEditorVisible
                  ? 'bg-background-tertiary text-text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60'
              )}
              variant="ghost"
              size="xs"
              title={editorToggleTitle}
              aria-label={editorToggleTitle}
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span className="text-[11px]">Редактор</span>
            </Button>
            <Button
              onClick={() => setIsExplorerVisible((v) => !v)}
              className={cn(
                'no-drag h-7 px-2 flex items-center gap-1.5 text-xs rounded-md transition-colors',
                isExplorerVisible
                  ? 'bg-background-tertiary text-text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/60'
              )}
              variant="ghost"
              size="xs"
              title={explorerToggleTitle}
              aria-label={explorerToggleTitle}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span className="text-[11px]">Файлы</span>
            </Button>
          </div>
        )}
      </div>

      {/* Main content with navigation. Shared canvas; the sidebar is a
          rounded outlined card floating on it with breathing room. */}
      <div className="flex flex-1 w-full h-full min-h-0 flex-row">
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

            {/* Splitter between Chat/Hub and Center */}
            {(isEditorVisible || isExplorerVisible) && (
              <div
                className="w-1.5 h-full cursor-col-resize hover:bg-border-primary/40 active:bg-goose-teal/40 transition-colors flex-shrink-0"
                onMouseDown={handleChatResizeMouseDown}
                title="Перетащите для изменения ширины"
              />
            )}

            {/* Center Panel: Editor Area */}
            {isEditorVisible && (
              <div className="flex-1 h-full min-w-[300px] p-2 pl-0">
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
                style={{ width: isEditorVisible ? explorerWidth : 'auto' }}
                className={cn(
                  'h-full p-2 pl-0 flex flex-col min-w-[200px]',
                  isEditorVisible ? 'flex-shrink-0' : 'flex-1'
                )}
              >
                <div className="w-full h-full overflow-hidden rounded-xl border border-border-primary bg-background-primary relative">
                  <FileExplorer />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden min-h-0">
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
