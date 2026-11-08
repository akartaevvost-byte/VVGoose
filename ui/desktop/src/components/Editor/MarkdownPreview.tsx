import React, { memo, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { BLOCKED_PROTOCOLS } from '../../utils/urlSecurity';
import { TERMINAL_FONT_FAMILY } from '../Terminal/terminalFont';
import { CLAUDE_TERMINAL_DARK, CLAUDE_TERMINAL_LIGHT } from './syntaxTheme';

interface MarkdownPreviewProps {
  content: string;
  isDark: boolean;
}

// Allow every URL scheme except the dangerous ones, so relative links and
// deep links keep working (same policy as chat markdown)
const urlTransform = (url: string): string => {
  try {
    if (BLOCKED_PROTOCOLS.includes(new URL(url).protocol)) {
      return '';
    }
  } catch {
    // Not an absolute URL: relative paths and anchors are fine as-is
  }
  return url;
};

interface CodeProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: React.ReactNode;
}

export const MarkdownPreview = memo(function MarkdownPreview({
  content,
  isDark,
}: MarkdownPreviewProps) {
  const handleOpenExternal = useCallback(async (href: string) => {
    try {
      await window.electron.openExternal(href);
    } catch {
      // A broken link must not break the preview
    }
  }, []);

  const components = useMemo<Components>(
    () => ({
      code: ({ className, children, ...props }: CodeProps) => {
        const codeContent = String(children ?? '');
        // react-markdown gives untagged fenced blocks no language-xxx
        // className, so inline and block code are told apart by the trailing
        // newline that only block-level content contains
        if (!codeContent.endsWith('\n')) {
          return (
            <code
              {...props}
              className="bg-inline-code"
              style={{ fontFamily: TERMINAL_FONT_FAMILY }}
            >
              {children}
            </code>
          );
        }
        const match = /language-(\w+)/.exec(className || '');
        const theme = isDark ? CLAUDE_TERMINAL_DARK : CLAUDE_TERMINAL_LIGHT;
        return (
          <div
            data-testid="markdown-code-block"
            className="my-4 overflow-x-auto rounded-lg border border-border-primary"
            style={{ backgroundColor: theme.panel }}
          >
            <SyntaxHighlighter
              style={theme.prism}
              language={match ? match[1] : 'text'}
              PreTag="div"
              customStyle={{ background: 'transparent', margin: 0, padding: '12px 16px' }}
              codeTagProps={{
                style: {
                  fontFamily: TERMINAL_FONT_FAMILY,
                  fontSize: '13px',
                  whiteSpace: 'pre-wrap',
                },
              }}
            >
              {codeContent.replace(/\n$/, '')}
            </SyntaxHighlighter>
          </div>
        );
      },
      a: ({ href, children, ...props }: LinkProps) => (
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            if (!href) return;
            void handleOpenExternal(href);
          }}
        >
          {children}
        </a>
      ),
    }),
    [isDark, handleOpenExternal]
  );

  return (
    <div data-testid="markdown-preview" className="h-full overflow-y-auto">
      <div
        className={`
          mx-auto w-full max-w-[820px] px-8 py-6
          prose prose-sm max-w-none text-text-primary dark:prose-invert
          prose-pre:p-0 prose-pre:m-0 prose-pre:bg-transparent
          prose-code:font-mono
          prose-table:table prose-table:w-full
          prose-blockquote:text-inherit
          prose-td:border prose-td:border-border-primary prose-td:p-2
          prose-th:border prose-th:border-border-primary prose-th:p-2
          prose-thead:bg-background-primary
          prose-h1:text-2xl prose-h1:font-normal prose-h1:mb-5 prose-h1:mt-2
          prose-h2:text-xl prose-h2:font-normal prose-h2:mb-4 prose-h2:mt-6
          prose-h3:text-lg prose-h3:font-normal prose-h3:mb-3 prose-h3:mt-5
          prose-p:mt-0 prose-p:mb-3
          prose-ul:mt-0 prose-ul:mb-3
          prose-ol:my-3
          prose-li:m-0
        `}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={urlTransform}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
});
