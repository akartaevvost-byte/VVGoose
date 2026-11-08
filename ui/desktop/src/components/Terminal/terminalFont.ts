// Shared so editor code previews can render with the exact same
// monospace stack as the integrated terminal (SF Mono on macOS,
// Consolas on Windows, monospace elsewhere)
export const TERMINAL_FONT_FAMILY = [
  'ui-monospace',
  '"JetBrains Mono"',
  '"SF Mono"',
  'SFMono-Regular',
  '"Fira Code"',
  '"Cascadia Code"',
  '"Cascadia Mono"',
  'Menlo',
  'Consolas',
  'Monaco',
  '"Liberation Mono"',
  '"DejaVu Sans Mono"',
  'monospace',
].join(', ');
