import type { ITheme } from '@xterm/xterm';

export function getTerminalTheme(): ITheme {
  if (typeof document === 'undefined') {
    return {
      background: '#15141b',
      foreground: '#e6e6e6',
      cursor: '#e6e6e6',
    };
  }

  const isDark =
    document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const style =
    typeof window !== 'undefined' ? window.getComputedStyle(document.documentElement) : null;
  const bg =
    style?.getPropertyValue('--color-background-primary').trim() ||
    (isDark ? '#15141b' : '#ffffff');
  const fg =
    style?.getPropertyValue('--color-text-primary').trim() || (isDark ? '#e6e6e6' : '#1f2328');
  const cursor = fg;
  const selection = isDark ? 'rgba(0, 163, 150, 0.35)' : 'rgba(0, 163, 150, 0.25)';

  if (isDark) {
    return {
      background: bg,
      foreground: fg,
      cursor,
      cursorAccent: bg,
      selectionBackground: selection,
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
    cursor,
    cursorAccent: bg,
    selectionBackground: selection,
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
