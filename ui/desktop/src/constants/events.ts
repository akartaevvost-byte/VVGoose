/**
 * Custom event names used throughout the application.
 */
export enum AppEvents {
  SESSION_CREATED = 'session-created',
  SESSION_EXTENSIONS_LOADED = 'session-extensions-loaded',
  SESSION_DELETED = 'session-deleted',
  SESSION_RENAMED = 'session-renamed',
  SESSION_WORKING_DIR_CHANGED = 'session-working-dir-changed',
  SESSION_FORKED = 'session-forked',
  SESSION_STATUS_UPDATE = 'session-status-update',
  ADD_ACTIVE_SESSION = 'add-active-session',
  CHAT_TAB_CLOSED = 'chat-tab-closed',
  CLEAR_INITIAL_MESSAGE = 'clear-initial-message',
  SCROLL_CHAT_TO_BOTTOM = 'scroll-chat-to-bottom',
  RESPONSE_STYLE_CHANGED = 'responseStyleChanged',
  SHOW_THINKING_CHANGED = 'showThinkingChanged',
  ATTACH_FILE_TO_CHAT = 'attach-file-to-chat',
  AGENT_PROPOSE_DIFF = 'agent-propose-diff',
}
