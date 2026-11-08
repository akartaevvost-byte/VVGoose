export interface TerminalSession {
  id: string;
  title: string;
  cwd?: string;
  shell?: string;
  exitCode?: number | null;
  isRunning: boolean;
  createdAt: number;
}

export interface TerminalCreateOptions {
  id: string;
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
}

export interface TerminalContextType {
  sessions: TerminalSession[];
  activeTerminalId: string | null;
  activeSession: TerminalSession | null;
  isTerminalVisible: boolean;
  terminalHeight: number;
  isMaximized: boolean;
  createTerminal: (cwd?: string) => string;
  closeTerminal: (id: string) => void;
  setActiveTerminalId: (id: string) => void;
  setIsTerminalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setTerminalHeight: (height: number | ((prev: number) => number)) => void;
  toggleTerminal: () => void;
  toggleMaximize: () => void;
  clearActiveTerminal: () => void;
  sendToChat: (text?: string) => void;
  runCommand: (command: string, autoExecute?: boolean) => void;
  registerClearHandler: (id: string, handler: () => void) => () => void;
  updateSessionExitCode: (id: string, exitCode: number) => void;
}
