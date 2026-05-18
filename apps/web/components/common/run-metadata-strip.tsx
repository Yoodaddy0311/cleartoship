'use client';

// W2.C10.1: RunMetadataStrip — top-of-page meta for an audit run detail view.
// Surfaces the three context bits a founder needs to identify a run at a
// glance: short id (8 chars, click-to-copy), KST timestamp, and audit-tool
// version pill (optional). Kept presentation-only; the parent passes the
// resolved run doc.

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { t } from '@/lib/i18n';

// Accept whatever the caller has: a Firestore Timestamp (admin or client SDK
// shape), a JS Date, an ISO string, or a millis number. We don't import the
// Firestore Timestamp type to keep this widget free of firebase peer deps.
type TimestampLike =
  | Date
  | string
  | number
  | { toDate(): Date }
  | { seconds: number; nanoseconds?: number };

interface RunMetadataStripProps {
  run: {
    id: string;
    createdAt: TimestampLike;
    version?: string;
  };
}

function toDate(v: TimestampLike): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  if ('toDate' in v && typeof v.toDate === 'function') return v.toDate();
  if ('seconds' in v) return new Date(v.seconds * 1000);
  return new Date(NaN);
}

// Format ISO timestamp as KST (Asia/Seoul) "YYYY-MM-DD HH:mm". Intl with a
// fixed timeZone gives deterministic output regardless of the host TZ, which
// matters for both browser i18n and the unit test below.
function formatKst(v: TimestampLike): string {
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${lookup('year')}-${lookup('month')}-${lookup('day')} ${lookup('hour')}:${lookup('minute')}`;
}

export function RunMetadataStrip({ run }: RunMetadataStripProps) {
  const [copied, setCopied] = useState(false);
  const shortId = run.id.slice(0, 8);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(run.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable (insecure context, etc.) — silently no-op.
    }
  }

  return (
    <div
      data-testid="run-metadata-strip"
      className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--app-fg-muted)]"
    >
      <span className="inline-flex items-center gap-1.5 font-mono">
        <span aria-label={`Run ID ${run.id}`}>{shortId}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={t('audit.run.id.copy.aria')}
          aria-live="polite"
          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-[color:var(--app-bg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--app-accent)]"
        >
          {copied ? (
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          )}
        </button>
        {copied && <span className="sr-only">{t('audit.run.id.copied')}</span>}
      </span>
      <time
        data-testid="run-metadata-timestamp"
        dateTime={toDate(run.createdAt).toISOString()}
        className="tabular-nums"
      >
        {formatKst(run.createdAt)} KST
      </time>
      {run.version && (
        <span
          data-testid="run-metadata-version"
          className="inline-flex h-5 items-center rounded-full border border-[color:var(--app-border)] px-2 font-mono text-[10px] uppercase tracking-wide"
        >
          v{run.version}
        </span>
      )}
    </div>
  );
}
