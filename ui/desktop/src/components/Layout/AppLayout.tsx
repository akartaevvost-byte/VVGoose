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
  const headerPadding = needsTrafficLightInset ? 'pl-[96px]' : 'pl-4';
  const headerTop = needsTrafficLightInset ? 'top-[14px]' : 'top-[11px]';
  const navToggleTitle = intl.formatMessage(
    isNavExpanded ? i18n.collapseNavigation : i18n.openNavigation
  );
  const editorToggleTitle = intl.formatMessage(i18n.toggleEditor);
  const explorerShortcut = safeIsMacOS ? '⌘⇧E' : 'Ctrl+Shift+E';
  const explorerToggleTitle = `${intl.formatMessage(i18n.toggleExplorer)} (${explorerShortcut})`;

  return (
    <div className="flex flex-1 w-full h-full relative animate-fade-in bg-background-primary flex-row">
      <div
        style={{ zIndex: Z_INDEX.HEADER }}
        className={cn('absolute flex items-center gap-1', headerPadding, headerTop, 'ml-1.5')}
      >
        <Button
          onClick={() => setIsNavExpanded(!isNavExpanded)}
          className="no-drag hover:!bg-background-tertiary"
          variant="ghost"
          size="xs"
          title={navToggleTitle}
          aria-label={navToggleTitle}
        >
          <PanelLeft className="w-5 h-5" />
        </Button>

        {isOnPairRoute && (
          <>
            <Button
              onClick={() => setIsEditorVisible((v) => !v)}
              className="no-drag hover:!bg-background-tertiary"
              variant="ghost"
              size="xs"
              title={editorToggleTitle}
              aria-label={editorToggleTitle}
            >
              <Columns2 className="w-4 h-4 text-text-secondary" />
            </Button>
            <Button
              onClick={() => setIsExplorerVisible((v) => !v)}
              className="no-drag hover:!bg-background-tertiary"
              variant="ghost"
              size="xs"
              title={explorerToggleTitle}
              aria-label={explorerToggleTitle}
            >
              <FolderTree className="w-4 h-4 text-text-secondary" />
            </Button>
          </>
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
        {isOnPairRoute ? (
          <div className="flex flex-1 w-full h-full min-h-0 flex-row overflow-hidden">
            <Outlet />
            {/* Left Panel: Goose Agent Chat */}
            <div
              style={{ width: isEditorVisible || isExplorerVisible ? chatWidth : '100%' }}
              className={cn(
                'h-full p-2 pl-0 flex flex-col min-w-[300px]',
                isEditorVisible || isExplorerVisible ? 'flex-shrink-0' : 'flex-1'
              )}
            >
              <div className="w-full h-full overflow-hidden rounded-xl border border-border-primary bg-background-primary relative">
                <ChatSessionsContainer
                  setChat={setChat}
                  activeSessions={activeSessions}
                  liveVoice={liveVoice}
                />
              </div>
            </div>

            {/* Splitter between Chat and Center */}
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
