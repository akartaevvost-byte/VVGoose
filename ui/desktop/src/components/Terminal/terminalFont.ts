// Shared so editor code previews can render with the exact same
// monospace stack as the integrated terminal.
// Platform defaults come first: SF Mono (ui-monospace) is too thin at
// weight 400, so macOS uses Menlo (Terminal.app default) and Windows
// falls through to Consolas via ui-monospace.
export const TERMINAL_FONT_FAMILY = [
  'Menlo',
  'ui-monospace',
  '"Cascadia Mono"',
  '"Cascadia Code"',
  '"SF Mono"',
  'SFMono-Regular',
  '"JetBrains Mono"',
  '"Fira Code"',
  'Consolas',
  'Monaco',
  '"Liberation Mono"',
  '"DejaVu Sans Mono"',
  'monospace',
].join(', ');
