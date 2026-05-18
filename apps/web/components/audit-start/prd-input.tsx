'use client';

import { useRef, useState } from 'react';
import { Textarea, cn } from '@cleartoship/ui';
import { t } from '@/lib/i18n';

// W2-A G2: hard 50 KB cap on user-supplied PRD text. We measure UTF-8 bytes
// (not JS code units) because the server limit is byte-based — counting
// code units would let 50 000 한글 글자 (=150 000 bytes) slip past the UI
// and fail at the API boundary.
const PRD_MAX_BYTES = 50_000;
// File upload guard. 250 KB raw file allows headroom for UTF-16/BOM/whitespace
// that may shrink under utf-8 conversion; anything bigger is almost
// certainly out-of-scope (we still re-check post-decode against PRD_MAX_BYTES).
const PRD_FILE_MAX_BYTES = 250_000;
// 90 % amber warning threshold from PRD §3 UX.
const PRD_WARN_BYTES = Math.floor(PRD_MAX_BYTES * 0.9);

const encoder =
  typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function byteLength(value: string): number {
  if (encoder) return encoder.encode(value).length;
  // Fallback for the (unlikely) environment without TextEncoder.
  // Buffer is a Node-only API; in browsers encoder will always exist.
  return Buffer.byteLength(value, 'utf8');
}

export interface PrdInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function PrdInput({ value, onChange, disabled }: PrdInputProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const bytes = byteLength(value);
  const over = bytes > PRD_MAX_BYTES;
  const warn = !over && bytes >= PRD_WARN_BYTES;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > PRD_FILE_MAX_BYTES) {
      setFileError(t('audit.prd.tooLarge'));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    try {
      const text = await file.text();
      if (byteLength(text) > PRD_MAX_BYTES) {
        setFileError(t('audit.prd.tooLarge'));
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      onChange(text);
    } catch {
      setFileError(t('audit.prd.tooLarge'));
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="prdText"
        className="text-sm text-[color:var(--color-fg-secondary)]"
      >
        {t('audit.prd.label')}
      </label>
      <Textarea
        id="prdText"
        name="prdText"
        rows={6}
        value={value}
        disabled={disabled}
        placeholder={t('audit.prd.placeholder')}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={over || undefined}
        aria-describedby="prdCounter"
      />
      <div className="flex items-center justify-between gap-3">
        <label
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-[8px]',
            'border border-[color:var(--color-border-default)] px-3 py-1.5',
            'text-xs text-[color:var(--color-fg-secondary)]',
            'bg-[color:var(--color-bg-elevated)]',
            disabled && 'cursor-not-allowed opacity-60'
          )}
        >
          {t('audit.prd.fileButton')}
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            className="sr-only"
            disabled={disabled}
            onChange={onFile}
          />
        </label>
        <span
          id="prdCounter"
          aria-live="polite"
          className={cn(
            'font-mono text-xs tabular-nums',
            over
              ? 'text-[color:var(--color-severity-p0)]'
              : warn
              ? 'text-[color:var(--mk-warn)]'
              : 'text-[color:var(--color-fg-muted)]'
          )}
        >
          {bytes.toLocaleString()} / {PRD_MAX_BYTES.toLocaleString()}
        </span>
      </div>
      {fileError ? (
        <p
          role="alert"
          className="text-xs text-[color:var(--color-severity-p0)]"
        >
          {fileError}
        </p>
      ) : null}
      {over ? (
        <p
          role="alert"
          className="text-xs text-[color:var(--color-severity-p0)]"
        >
          {t('audit.prd.tooLarge')}
        </p>
      ) : null}
    </div>
  );
}
