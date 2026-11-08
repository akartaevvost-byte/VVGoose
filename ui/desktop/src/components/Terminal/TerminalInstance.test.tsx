import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerminalInstance, TERMINAL_FONT_FAMILY } from './TerminalInstance';
import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';

// Track mock instances
interface MockTerminalInstance {
  options: Record<string, unknown>;
  cols: number;
  rows: number;
  loadAddon: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  attachCustomKeyEventHandler: ReturnType<typeof vi.fn>;
  onData: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  writeln: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  hasSelection: ReturnType<typeof vi.fn>;
  getSelection: ReturnType<typeof vi.fn>;
}

interface MockWebglInstance {
  onContextLoss: ReturnType<typeof vi.fn>;
  triggerContextLoss: () => void;
  dispose: ReturnType<typeof vi.fn>;
  activate: ReturnType<typeof vi.fn>;
}

interface MockFitInstance {
  fit: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  activate: ReturnType<typeof vi.fn>;
}

let terminalInstances: MockTerminalInstance[] = [];
let webglInstances: MockWebglInstance[] = [];
let fitInstances: MockFitInstance[] = [];
let shouldWebglThrow = false;
let mockTerminalFontSize: number | undefined = undefined;

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function (options: Record<string, unknown>) {
    const instance: MockTerminalInstance = {
      options: { ...options },
      cols: 80,
      rows: 24,
      loadAddon: vi.fn(),
      open: vi.fn(),
      attachCustomKeyEventHandler: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      write: vi.fn(),
      writeln: vi.fn(),
      clear: vi.fn(),
      focus: vi.fn(),
      dispose: vi.fn(),
      hasSelection: vi.fn().mockReturnValue(false),
      getSelection: vi.fn().mockReturnValue(''),
    };
    terminalInstances.push(instance);
    return instance;
  }),
}));

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn().mockImplementation(function () {
    if (shouldWebglThrow) {
      throw new Error('WebGL2 not supported');
    }
    let lossCallback: (() => void) | undefined;
    const instance: MockWebglInstance = {
      onContextLoss: vi.fn((cb: () => void) => {
        lossCallback = cb;
        return { dispose: vi.fn() };
      }),
      triggerContextLoss: () => {
        lossCallback?.();
      },
      dispose: vi.fn(),
      activate: vi.fn(),
    };
    webglInstances.push(instance);
    return instance;
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function () {
    const instance: MockFitInstance = {
      fit: vi.fn(),
      dispose: vi.fn(),
      activate: vi.fn(),
    };
    fitInstances.push(instance);
    return instance;
  }),
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn().mockImplementation(function () {
    return {
      dispose: vi.fn(),
      activate: vi.fn(),
    };
  }),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(function () {
    return {
      dispose: vi.fn(),
      activate: vi.fn(),
    };
  }),
}));

const mockRegisterClearHandler = vi.fn(() => () => {});

vi.mock('../../contexts/TerminalContext', () => ({
  useTerminal: () => ({
    registerClearHandler: mockRegisterClearHandler,
    terminalFontSize: mockTerminalFontSize,
  }),
}));

const mockResizeObserverDisconnect = vi.fn();
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = mockResizeObserverDisconnect;
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('TerminalInstance', () => {
  beforeEach(() => {
    terminalInstances = [];
    webglInstances = [];
    fitInstances = [];
    shouldWebglThrow = false;
    mockTerminalFontSize = undefined;
    mockResizeObserverDisconnect.mockClear();
    vi.clearAllMocks();

    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  describe('Terminal Typography and Initialization Parameters', () => {
    it('initializes Terminal with default typography parameters', () => {
      render(<TerminalInstance id="term-1" active={true} />);

      expect(Terminal).toHaveBeenCalledTimes(1);
      const passedOptions = vi.mocked(Terminal).mock.calls[0][0];

      // Geometry & typography
      expect(passedOptions?.fontSize).toBe(12);
      expect(passedOptions?.fontFamily).toBe(TERMINAL_FONT_FAMILY);
      expect(passedOptions?.fontFamily).toContain('ui-monospace');
      expect(passedOptions?.fontFamily).toContain('"SF Mono"');
      expect(passedOptions?.fontFamily).toContain('"JetBrains Mono"');
      expect(passedOptions?.lineHeight).toBe(1.2);
      expect(passedOptions?.letterSpacing).toBe(0);
      expect(passedOptions?.fontWeight).toBe(400);
      expect(passedOptions?.fontWeightBold).toBe(600);

      // Glyphs and cursor
      expect(passedOptions?.customGlyphs).toBe(true);
      expect(passedOptions?.drawBoldTextInBrightColors).toBe(false);
      expect(passedOptions?.cursorStyle).toBe('bar');
      expect(passedOptions?.cursorWidth).toBe(2);
      expect(passedOptions?.cursorBlink).toBe(true);
      expect(passedOptions?.cursorInactiveStyle).toBe('outline');

      // Environment & buffer
      expect(passedOptions?.scrollback).toBe(5000);
      expect(passedOptions?.allowTransparency).toBe(true);
      expect(passedOptions?.convertEol).toBe(true);
    });

    it('initializes Terminal with custom fontSize when passed as prop', () => {
      render(<TerminalInstance id="term-custom" active={true} fontSize={16} />);

      const passedOptions = vi.mocked(Terminal).mock.calls[0][0];
      expect(passedOptions?.fontSize).toBe(16);
    });

    it('initializes Terminal with terminalFontSize from context when prop is omitted', () => {
      mockTerminalFontSize = 14;
      render(<TerminalInstance id="term-context" active={true} />);

      const passedOptions = vi.mocked(Terminal).mock.calls[0][0];
      expect(passedOptions?.fontSize).toBe(14);
    });

    it('dynamically updates terminal fontSize and refits when fontSize prop changes', () => {
      const { rerender } = render(
        <TerminalInstance id="term-update" active={true} fontSize={12} />
      );
      const termInstance = terminalInstances[0];
      const fitInstance = fitInstances[0];

      expect(termInstance.options.fontSize).toBe(12);

      rerender(<TerminalInstance id="term-update" active={true} fontSize={15} />);

      expect(termInstance.options.fontSize).toBe(15);
      expect(fitInstance.fit).toHaveBeenCalled();
    });
  });

  describe('WebGL Renderer Loading and Error Fallback', () => {
    it('successfully loads WebglAddon and attaches context loss listener', () => {
      render(<TerminalInstance id="term-webgl" active={true} />);

      expect(WebglAddon).toHaveBeenCalledTimes(1);
      const termInstance = terminalInstances[0];
      const webglInstance = webglInstances[0];

      expect(termInstance.loadAddon).toHaveBeenCalledWith(webglInstance);
      expect(webglInstance.onContextLoss).toHaveBeenCalled();
    });

    it('disposes WebglAddon when WebGL context is lost', () => {
      render(<TerminalInstance id="term-context-loss" active={true} />);

      const webglInstance = webglInstances[0];
      expect(webglInstance.dispose).not.toHaveBeenCalled();

      act(() => {
        webglInstance.triggerContextLoss();
      });

      expect(webglInstance.dispose).toHaveBeenCalledTimes(1);
    });

    it('catches WebglAddon instantiation error and gracefully falls back to default renderer', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      shouldWebglThrow = true;

      expect(() => {
        render(<TerminalInstance id="term-webgl-fail" active={true} />);
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Terminal] WebGL renderer could not be initialized'),
        expect.any(Error)
      );
      warnSpy.mockRestore();
    });
  });

  describe('Font Metrics Stabilization', () => {
    it('calls fitAddon.fit when document.fonts.ready resolves', async () => {
      let resolveFonts: () => void;
      const readyPromise = new Promise<void>((resolve) => {
        resolveFonts = resolve;
      });

      const originalFonts = (document as unknown as { fonts?: unknown }).fonts;
      (document as unknown as { fonts: { ready: Promise<void> } }).fonts = {
        ready: readyPromise,
      };

      render(<TerminalInstance id="term-font-stab" active={true} />);
      const fitInstance = fitInstances[0];

      await act(async () => {
        resolveFonts!();
        await readyPromise;
      });

      expect(fitInstance.fit).toHaveBeenCalled();
      (document as unknown as { fonts?: unknown }).fonts = originalFonts;
    });
  });

  describe('Theme Updates and Lifecycle Cleanup', () => {
    it('updates terminal theme when documentElement attributes change', async () => {
      render(<TerminalInstance id="term-theme" active={true} />);
      const termInstance = terminalInstances[0];

      await act(async () => {
        document.documentElement.setAttribute('data-theme', 'aura');
      });

      expect((termInstance.options.theme as { cursor?: string })?.cursor).toBe('#a277ff');
    });

    it('cleans up terminal, addons, and observers on unmount', () => {
      const { unmount } = render(<TerminalInstance id="term-cleanup" active={true} />);
      const termInstance = terminalInstances[0];
      const webglInstance = webglInstances[0];

      unmount();

      expect(termInstance.dispose).toHaveBeenCalledTimes(1);
      expect(webglInstance.dispose).toHaveBeenCalledTimes(1);
      expect(mockResizeObserverDisconnect).toHaveBeenCalled();
    });
  });
});
