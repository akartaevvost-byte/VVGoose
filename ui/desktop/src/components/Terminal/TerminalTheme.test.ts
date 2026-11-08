import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { colorToOscRgb, getTerminalTheme } from './TerminalTheme';

describe('getTerminalTheme', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  afterEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it('returns aura theme when data-theme="aura"', () => {
    document.documentElement.setAttribute('data-theme', 'aura');
    const theme = getTerminalTheme();

    expect(theme.cursor).toBe('#a277ff');
    expect(theme.selectionBackground).toBe('rgba(162, 119, 255, 0.3)');
    expect(theme.selectionForeground).toBe('#ffffff');
    expect(theme.selectionInactiveBackground).toBe('rgba(162, 119, 255, 0.15)');
    expect(theme.red).toBe('#ff6767');
    expect(theme.green).toBe('#61ffca');
    expect(theme.yellow).toBe('#ffca85');
    expect(theme.blue).toBe('#82e2ff');
    expect(theme.magenta).toBe('#a277ff');
    expect(theme.cyan).toBe('#61ffca');
    expect(theme.white).toBe('#edecee');
    expect(theme.brightWhite).toBe('#ffffff');
  });

  it('returns dark theme when dark class is present', () => {
    document.documentElement.classList.add('dark');
    const theme = getTerminalTheme();

    expect(theme.cursor).toBe('#58a6ff');
    expect(theme.selectionBackground).toBe('rgba(56, 139, 253, 0.35)');
    expect(theme.selectionForeground).toBe('#ffffff');
    expect(theme.selectionInactiveBackground).toBe('rgba(56, 139, 253, 0.2)');
    expect(theme.red).toBe('#ff7b72');
    expect(theme.green).toBe('#7ee787');
    expect(theme.yellow).toBe('#f2cc60');
    expect(theme.blue).toBe('#58a6ff');
    expect(theme.magenta).toBe('#bc8cff');
    expect(theme.cyan).toBe('#39c5cf');
    expect(theme.white).toBe('#d2d4d7');
    expect(theme.brightWhite).toBe('#ffffff');
  });

  it('returns dark theme when data-theme="dark"', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const theme = getTerminalTheme();

    expect(theme.cursor).toBe('#58a6ff');
    expect(theme.selectionBackground).toBe('rgba(56, 139, 253, 0.35)');
  });

  it('returns dark theme when system prefers dark and theme is not aura', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const theme = getTerminalTheme();
    expect(theme.cursor).toBe('#58a6ff');
  });

  it('returns light theme by default', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const theme = getTerminalTheme();

    expect(theme.cursor).toBe('#0969da');
    expect(theme.selectionBackground).toBe('rgba(9, 105, 218, 0.25)');
    expect(theme.selectionForeground).toBe('#1f2328');
    expect(theme.selectionInactiveBackground).toBe('rgba(9, 105, 218, 0.15)');
    expect(theme.red).toBe('#cf222e');
    expect(theme.green).toBe('#116329');
    expect(theme.yellow).toBe('#4d2d00');
    expect(theme.blue).toBe('#0969da');
    expect(theme.magenta).toBe('#8250df');
    expect(theme.cyan).toBe('#1b7c83');
    expect(theme.white).toBe('#6e7781');
    expect(theme.brightWhite).toBe('#8c959f');
  });
});

describe('colorToOscRgb', () => {
  it('converts 6-digit hex colors to xterm 16-bit rgb format', () => {
    expect(colorToOscRgb('#ffffff')).toBe('rgb:ffff/ffff/ffff');
    expect(colorToOscRgb('#15141b')).toBe('rgb:1515/1414/1b1b');
    expect(colorToOscRgb('#000000')).toBe('rgb:0000/0000/0000');
  });

  it('converts 3-digit hex colors to xterm 16-bit rgb format', () => {
    expect(colorToOscRgb('#fff')).toBe('rgb:ffff/ffff/ffff');
    expect(colorToOscRgb('#000')).toBe('rgb:0000/0000/0000');
  });

  it('converts rgb/rgba strings to xterm 16-bit rgb format', () => {
    expect(colorToOscRgb('rgb(248, 248, 248)')).toBe('rgb:f8f8/f8f8/f8f8');
    expect(colorToOscRgb('rgba(31, 35, 40, 0.9)')).toBe('rgb:1f1f/2323/2828');
  });

  it('returns null for empty or invalid colors', () => {
    expect(colorToOscRgb('')).toBeNull();
    expect(colorToOscRgb(undefined)).toBeNull();
    expect(colorToOscRgb('invalid')).toBeNull();
  });
});
