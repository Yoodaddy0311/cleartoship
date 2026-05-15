'use client';

import * as React from 'react';
import { EyeOff, FileCode, ExternalLink } from 'lucide-react';
import { cn } from './lib/cn';

export interface EvidenceCardProps {
  /** File path (may be omitted for URL evidence). */
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  /** Optional URL evidence (DOM, network). */
  url?: string;
  selector?: string;
  /** Code or text snippet. Will be wrapped in <pre><code>. */
  snippet?: string;
  /** Language hint for future syntax highlighting (stub for now). */
  language?: string;
  /** When true, indicate that a secret has been masked in the snippet. */
  maskedSecret?: boolean;
  /** Optional short caption / context label. */
  caption?: string;
  className?: string;
}

/**
 * EvidenceCard — file:line + code snippet + masked-secret indicator.
 * Syntax highlighting is a stub (white-space pre, mono font). Drop-in highlighter
 * like Shiki can be wired in Sprint 1+ without changing the API.
 */
export function EvidenceCard({
  filePath,
  lineStart,
  lineEnd,
  url,
  selector,
  snippet,
  language,
  maskedSecret,
  caption,
  className,
}: EvidenceCardProps) {
  const locationLabel = (() => {
    if (filePath) {
      const range =
        typeof lineStart === 'number'
          ? typeof lineEnd === 'number' && lineEnd !== lineStart
            ? `:${lineStart}-${lineEnd}`
            : `:${lineStart}`
          : '';
      return `${filePath}${range}`;
    }
    if (url) return url;
    return '근거 자료';
  })();

  return (
    <figure
      className={cn(
        'overflow-hidden rounded-[12px] border border-[color:var(--color-border-subtle)]',
        'bg-[color:var(--color-bg-elevated)]',
        className
      )}
    >
      <figcaption
        className={cn(
          'flex items-center justify-between gap-2 border-b border-[color:var(--color-border-subtle)]',
          'bg-[rgba(255,255,255,0.02)] px-3 py-2 text-xs',
          'text-[color:var(--color-fg-secondary)]'
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {url ? (
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <FileCode aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate font-mono">{locationLabel}</span>
          {language ? (
            <span className="ml-2 rounded-sm bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 text-[10px] uppercase">
              {language}
            </span>
          ) : null}
        </span>
        {maskedSecret ? (
          <span
            className="flex items-center gap-1 text-[color:var(--color-severity-p0)]"
            role="status"
          >
            <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Secret 마스킹됨</span>
          </span>
        ) : null}
      </figcaption>

      {selector ? (
        <p className="border-b border-[color:var(--color-border-subtle)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 font-mono text-xs text-[color:var(--color-fg-muted)]">
          선택자: {selector}
        </p>
      ) : null}

      {snippet ? (
        <pre className="max-h-60 overflow-auto !rounded-none !border-0 !bg-transparent px-3 py-3 text-xs">
          <code className="whitespace-pre">{snippet}</code>
        </pre>
      ) : null}

      {caption ? (
        <p className="border-t border-[color:var(--color-border-subtle)] px-3 py-2 text-xs text-[color:var(--color-fg-muted)]">
          {caption}
        </p>
      ) : null}
    </figure>
  );
}
