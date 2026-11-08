import type { ITheme } from '@xterm/xterm';

export function colorToOscRgb(color?: string): string | null {
  if (!color) return null;
  const trimmed = color.trim().toLowerCase();

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = hex[0] + hex[0];
      const g = hex[1] + hex[1];
      const b = hex[2] + hex[2];
      return `rgb:${r}${r}/${g}${g}/${b}${b}`;
    }
    if (hex.length >= 6) {
      const r = hex.slice(0, 2);
      const g = hex.slice(2, 4);
      const b = hex.slice(4, 6);
      return `rgb:${r}${r}/${g}${g}/${b}${b}`;
    }
  }

  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = Math.min(255, parseInt(rgbMatch[1], 10)).toString(16).padStart(2, '0');
    const g = Math.min(255, parseInt(rgbMatch[2], 10)).toString(16).padStart(2, '0');
    const b = Math.min(255, parseInt(rgbMatch[3], 10)).toString(16).padStart(2, '0');
    return `rgb:${r}${r}/${g}${g}/${b}${b}`;
  }

  return null;
}

export function getTerminalTheme(): ITheme {
  if (typeof document === 'undefined') {
    return {
      background: '#15141b',
      foreground: '#e6e6e6',
      cursor: '#58a6ff',
      cursorAccent: '#15141b',
      selectionBackground: 'rgba(56, 139, 253, 0.35)',
      selectionForeground: '#ffffff',
    };
  }

  const isAura = document.documentElement.getAttribute('data-theme') === 'aura';
  const isDark =
    document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!isAura &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const style =
    typeof window !== 'undefined' ? window.getComputedStyle(document.documentElement) : null;
  const bg =
    style?.getPropertyValue('--color-background-primary').trim() ||
    (isDark ? '#15141b' : '#ffffff');
  const fg =
    style?.getPropertyValue('--color-text-primary').trim() || (isDark ? '#e6e6e6' : '#1f2328');

  if (isAura) {
    return {
      background: bg,
      foreground: fg,
      cursor: '#a277ff',
      cursorAccent: bg,
      selectionBackground: 'rgba(162, 119, 255, 0.3)',
      selectionForeground: '#ffffff',
      selectionInactiveBackground: 'rgba(162, 119, 255, 0.15)',
      black: '#15141b',
      red: '#ff6767',
      green: '#61ffca',
      yellow: '#ffca85',
      blue: '#82e2ff',
      magenta: '#a277ff',
      cyan: '#61ffca',
      white: '#edecee',
      brightBlack: '#4e496c',
      brightRed: '#ff8585',
      brightGreen: '#7effd4',
      brightYellow: '#ffd59e',
      brightBlue: '#9de8ff',
      brightMagenta: '#b894ff',
      brightCyan: '#85ffe0',
      brightWhite: '#ffffff',
    };
  }

  if (isDark) {
    return {
      background: bg,
      foreground: fg,
      cursor: '#58a6ff',
      cursorAccent: bg,
      selectionBackground: 'rgba(56, 139, 253, 0.35)',
      selectionForeground: '#ffffff',
      selectionInactiveBackground: 'rgba(56, 139, 253, 0.2)',
      black: '#1f2328',
      red: '#ff7b72',
      green: '#7ee787',
      yellow: '#f2cc60',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#d2d4d7',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#ffffff',
    };
  }

  return {
    background: bg,
    foreground: fg,
    cursor: '#0969da',
    cursorAccent: bg,
    selectionBackground: 'rgba(9, 105, 218, 0.25)',
    selectionForeground: '#1f2328',
    selectionInactiveBackground: 'rgba(9, 105, 218, 0.15)',
    black: '#24292f',
    red: '#cf222e',
    green: '#116329',
    yellow: '#4d2d00',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#633c01',
    brightBlue: '#218bff',
    brightMagenta: '#a475f9',
    brightCyan: '#3192aa',
    brightWhite: '#8c959f',
  };
}
