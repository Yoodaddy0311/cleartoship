'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@cleartoship/ui';

/**
 * MarkdownViewer — secure react-markdown wrapper.
 * - GFM enabled (tables, task lists, strikethrough).
 * - No raw HTML (skipHtml) — safe by default per design-system anti-pattern.
 * - Custom code block uses globals.css `pre` styling.
 */
export function MarkdownViewer({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'prose-ct max-w-none text-[color:var(--color-fg-primary)] leading-[1.6]',
        className
      )}
    >
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => (
            <h1
              {...props}
              className="mt-8 mb-4 text-display-sm font-semibold text-[color:var(--color-fg-primary)]"
            />
          ),
          h2: (props) => (
            <h2
              {...props}
              className="mt-6 mb-3 text-xl font-semibold text-[color:var(--color-fg-primary)]"
            />
          ),
          h3: (props) => (
            <h3
              {...props}
              className="mt-5 mb-2 text-lg font-semibold text-[color:var(--color-fg-primary)]"
            />
          ),
          p: (props) => (
            <p
              {...props}
              className="my-3 text-md leading-[1.65] text-[color:var(--color-fg-secondary)]"
            />
          ),
          a: ({ href, children, ...rest }) => (
            <a
              {...rest}
              href={href}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="text-[color:var(--color-plasma-cyan)] underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),
          ul: (props) => (
            <ul {...props} className="my-3 list-disc pl-6 text-[color:var(--color-fg-secondary)]" />
          ),
          ol: (props) => (
            <ol {...props} className="my-3 list-decimal pl-6 text-[color:var(--color-fg-secondary)]" />
          ),
          li: (props) => <li {...props} className="my-1 leading-[1.6]" />,
          blockquote: (props) => (
            <blockquote
              {...props}
              className="my-4 border-l-2 border-[color:var(--mk-accent-2)] bg-[color-mix(in_oklch,var(--mk-accent-2)_8%,transparent)] px-4 py-2 text-md italic text-[color:var(--app-fg)]"
            />
          ),
          table: (props) => (
            <div className="my-4 overflow-x-auto">
              <table
                {...props}
                className="w-full border-collapse text-sm text-[color:var(--color-fg-secondary)]"
              />
            </div>
          ),
          th: (props) => (
            <th
              {...props}
              className="border border-[color:var(--color-border-subtle)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-left font-medium text-[color:var(--color-fg-primary)]"
            />
          ),
          td: (props) => (
            <td
              {...props}
              className="border border-[color:var(--color-border-subtle)] px-3 py-2 align-top"
            />
          ),
          code: ({ children, className: cls, ...rest }) => {
            const isInline = !cls;
            if (isInline) {
              return (
                <code
                  {...rest}
                  className="rounded-[4px] bg-[rgba(255,255,255,0.06)] px-1 py-0.5 font-mono text-[0.875em] text-[color:var(--color-fg-primary)]"
                >
                  {children}
                </code>
              );
            }
            return (
              <code {...rest} className={cls}>
                {children}
              </code>
            );
          },
          hr: () => (
            <hr className="my-6 border-0 border-t border-[color:var(--color-border-subtle)]" />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
