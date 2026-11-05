import { describe, expect, it } from 'vitest';
import { getLanguageFromFilename } from './languageDetector';

describe('getLanguageFromFilename', () => {
  it('detects common programming languages correctly', () => {
    expect(getLanguageFromFilename('main.rs')).toBe('rust');
    expect(getLanguageFromFilename('app.ts')).toBe('typescript');
    expect(getLanguageFromFilename('component.tsx')).toBe('typescript');
    expect(getLanguageFromFilename('script.js')).toBe('javascript');
    expect(getLanguageFromFilename('index.jsx')).toBe('javascript');
    expect(getLanguageFromFilename('test.py')).toBe('python');
    expect(getLanguageFromFilename('package.json')).toBe('json');
    expect(getLanguageFromFilename('index.html')).toBe('html');
    expect(getLanguageFromFilename('style.css')).toBe('css');
    expect(getLanguageFromFilename('README.md')).toBe('markdown');
    expect(getLanguageFromFilename('config.yaml')).toBe('yaml');
    expect(getLanguageFromFilename('Cargo.toml')).toBe('ini');
    expect(getLanguageFromFilename('run.sh')).toBe('shell');
    expect(getLanguageFromFilename('query.sql')).toBe('sql');
  });

  it('falls back to plaintext for unknown extensions or files without extension', () => {
    expect(getLanguageFromFilename('unknown.xyz')).toBe('plaintext');
    expect(getLanguageFromFilename('LICENSE')).toBe('plaintext');
    expect(getLanguageFromFilename('')).toBe('plaintext');
  });
});
