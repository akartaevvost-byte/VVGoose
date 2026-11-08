import type { CSSProperties } from 'react';
import { TERMINAL_FONT_FAMILY } from '../Terminal/terminalFont';

// Syntax palette modeled on the Claude Code terminal look: warm charcoal
// panel, cream text, clay-orange keywords, sage strings, tan numbers.
// The font stack matches the integrated terminal exactly.

interface Palette {
  panel: string;
  foreground: string;
  comment: string;
  punctuation: string;
  keyword: string;
  string: string;
  number: string;
  func: string;
  className: string;
  builtin: string;
  url: string;
  deleted: string;
  inserted: string;
  selectionBackground: string;
}

const baseCode: CSSProperties = {
  fontFamily: TERMINAL_FONT_FAMILY,
  fontSize: '13px',
  lineHeight: 1.6,
  direction: 'ltr',
  textAlign: 'left',
  whiteSpace: 'pre',
  wordSpacing: 'normal',
  wordBreak: 'normal',
  tabSize: 2,
  hyphens: 'none',
};

export type PrismSyntaxTheme = Record<string, CSSProperties>;

function buildTheme(p: Palette): PrismSyntaxTheme {
  return {
    'code[class*="language-"]': { ...baseCode, background: p.panel, color: p.foreground },
    'pre[class*="language-"]': { ...baseCode, background: p.panel, color: p.foreground },
    'code[class*="language-"]::selection': {
      background: p.selectionBackground,
      color: 'inherit',
    },
    'code[class*="language-"] *::selection': {
      background: p.selectionBackground,
      color: 'inherit',
    },
    'pre[class*="language-"] *::selection': {
      background: p.selectionBackground,
      color: 'inherit',
    },
    ':not(pre) > code[class*="language-"]': {
      background: p.panel,
      color: p.foreground,
      padding: '0.2em 0.3em',
      borderRadius: '0.3em',
      whiteSpace: 'normal',
    },
    comment: { color: p.comment, fontStyle: 'italic' },
    prolog: { color: p.comment },
    doctype: { color: p.punctuation },
    cdata: { color: p.comment },
    punctuation: { color: p.punctuation },
    entity: { color: p.foreground, cursor: 'help' },
    namespace: { opacity: 0.8 },
    keyword: { color: p.keyword },
    atrule: { color: p.keyword },
    'attr-value > .token.punctuation.attr-equals': { color: p.punctuation },
    property: { color: p.keyword },
    tag: { color: p.keyword },
    selector: { color: p.keyword },
    important: { color: p.keyword },
    boolean: { color: p.number },
    constant: { color: p.number },
    number: { color: p.number },
    symbol: { color: p.number },
    'class-name': { color: p.className },
    'attr-name': { color: p.className },
    string: { color: p.string },
    char: { color: p.string },
    'attr-value': { color: p.string },
    builtin: { color: p.builtin },
    inserted: { color: p.inserted },
    regex: { color: p.string },
    url: { color: p.url },
    variable: { color: p.foreground },
    operator: { color: p.punctuation },
    function: { color: p.func },
    deleted: { color: p.deleted },
    bold: { fontWeight: 'bold' },
    italic: { fontStyle: 'italic' },
  };
}

const DARK_PALETTE: Palette = {
  panel: '#1f1e1c',
  foreground: '#edeae0',
  comment: '#857e70',
  punctuation: '#beb9aa',
  keyword: '#d97757',
  string: '#a3b18a',
  number: '#d4a27f',
  func: '#86accb',
  className: '#d5a96b',
  builtin: '#d4a27f',
  url: '#86accb',
  deleted: '#e5735f',
  inserted: '#a3b18a',
  selectionBackground: 'rgba(217, 119, 87, 0.28)',
};

const LIGHT_PALETTE: Palette = {
  panel: '#faf9f5',
  foreground: '#262624',
  comment: '#8a8474',
  punctuation: '#6f6a5e',
  keyword: '#c15f3c',
  string: '#64803c',
  number: '#9c6b43',
  func: '#3e6e96',
  className: '#9a7b2e',
  builtin: '#9c6b43',
  url: '#3e6e96',
  deleted: '#b33e2c',
  inserted: '#64803c',
  selectionBackground: 'rgba(193, 95, 60, 0.18)',
};

export const CLAUDE_TERMINAL_DARK = {
  panel: DARK_PALETTE.panel,
  prism: buildTheme(DARK_PALETTE),
};

export const CLAUDE_TERMINAL_LIGHT = {
  panel: LIGHT_PALETTE.panel,
  prism: buildTheme(LIGHT_PALETTE),
};
