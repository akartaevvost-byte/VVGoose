import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { getTerminalTheme } from './TerminalTheme';
import { useTerminal } from '../../contexts/TerminalContext';

interface TerminalInstanceProps {
  id: string;
  active: boolean;
  onExit?: (exitCode: number) => void;
}

export const TerminalInstance: React.FC<TerminalInstanceProps> = ({ id, active, onExit }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { registerClearHandler } = useTerminal();

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace, var(--font-mono)',
      theme: getTerminalTheme(),
      allowTransparency: true,
      convertEol: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      if (window?.electron?.openExternal) {
        window.electron.openExternal(uri).catch((err) => {
          console.error('Failed to open link from terminal:', err);
        });
      }
    });

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Custom key event handler for shortcuts
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // Let terminal toggle & new tab shortcuts bubble up to the window
      if ((e.metaKey || e.ctrlKey) && (e.key === '`' || e.code === 'Backquote')) {
        return false;
      }

      // Handle copy / paste on macOS
      const isMac = (window?.electron?.platform || navigator.platform)
        .toLowerCase()
        .includes('mac');
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (e.type === 'keydown' && modifier && e.key.toLowerCase() === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        return false;
      }

      if (e.type === 'keydown' && modifier && e.key.toLowerCase() === 'k') {
        term.clear();
        return false;
      }

      return true;
    });

    // Send stdin to PTY
    const dataDisposable = term.onData((data) => {
      if (window?.electron?.terminalData) {
        window.electron.terminalData(id, data);
      }
    });

    // Listen to stdout from PTY
    let cleanupData: (() => void) | undefined;
    if (window?.electron?.onTerminalData) {
      cleanupData = window.electron.onTerminalData(id, (data) => {
        term.write(data);
      });
    }

    // Listen to exit from PTY
    let cleanupExit: (() => void) | undefined;
    if (window?.electron?.onTerminalExit) {
      cleanupExit = window.electron.onTerminalExit(id, (exitCode) => {
        term.writeln(`\r\n\x1b[90m[Process completed with exit code ${exitCode}]\x1b[0m`);
        onExit?.(exitCode);
      });
    }

    // Initial fit
    const initialTimer = setTimeout(() => {
      try {
        fitAddon.fit();
        if (window?.electron?.terminalResize) {
          window.electron.terminalResize(id, term.cols, term.rows);
        }
      } catch {
        // Container might not have dimensions yet
      }
    }, 50);

    // Watch for theme changes on documentElement
    const themeObserver = new MutationObserver(() => {
      term.options.theme = getTerminalTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });

    // Watch for container resizes
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || containerRef.current.clientWidth === 0) return;
      try {
        fitAddon.fit();
        if (window?.electron?.terminalResize) {
          window.electron.terminalResize(id, term.cols, term.rows);
        }
      } catch {
        // Ignored during layout transitions
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(initialTimer);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      dataDisposable.dispose();
      cleanupData?.();
      cleanupExit?.();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [id, onExit]);

  // Register clear handler
  useEffect(() => {
    return registerClearHandler(id, () => {
      terminalRef.current?.clear();
    });
  }, [id, registerClearHandler]);

  // When tab becomes active, re-fit and focus
  useEffect(() => {
    if (!active || !fitAddonRef.current || !terminalRef.current) return;

    const timer = setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();
        if (window?.electron?.terminalResize && terminalRef.current) {
          window.electron.terminalResize(id, terminalRef.current.cols, terminalRef.current.rows);
        }
      } catch {
        // Ignored
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [active, id]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden p-2"
      style={{ display: active ? 'block' : 'none' }}
    />
  );
};
