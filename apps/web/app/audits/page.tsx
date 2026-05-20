'use client';

// `/audits` — list page for the caller's AuditRuns. Lives behind the same
// Firebase anonymous-auth gate as every other client API call: the apiFetch
// wrapper attaches the ID token, the GET handler validates it, and Firestore
// queries are scoped server-side by ownerId.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardBody, CardHeader, CardTitle } from '@cleartoship/ui';
import type { AuditRun } from '@cleartoship/shared-types';
import { listAuditRuns } from '@/lib/api/audit-runs';
import { ApiHttpError } from '@/lib/api/client';
import { t } from '@/lib/i18n';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; runs: AuditRun[] };

function statusBadgeColor(status: AuditRun['status']): string {
  // Match the dashboard's severity color tokens so a glance at the list
  // matches user expectations from the detail page.
  switch (status) {
    case 'COMPLETED':
      return 'var(--color-severity-p3, #16a34a)';
    case 'RUNNING':
      return 'var(--color-severity-p2, #f59e0b)';
    case 'PENDING':
      return 'var(--color-fg-muted, #6b7280)';
    case 'FAILED':
      return 'var(--color-severity-p0, #ef4444)';
    case 'CANCELLED':
      return 'var(--color-fg-muted, #6b7280)';
    default:
      return 'var(--color-fg-muted, #6b7280)';
  }
}

function formatCreatedAt(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortRepoLabel(repoUrl: string): string {
  // Strip protocol + host, leave `owner/repo`. Falls back to the raw URL on
  // any parsing failure so we never throw inside render.
  try {
    const u = new URL(repoUrl);
    const path = u.pathname.replace(/^\/+|\/+$/g, '');
    return path || repoUrl;
  } catch {
    return repoUrl;
  }
}

export default function AuditsListPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  async function load(): Promise<void> {
    setState({ kind: 'loading' });
    try {
      const res = await listAuditRuns();
      setState({ kind: 'ready', runs: res.runs });
    } catch (err) {
      const message =
        err instanceof ApiHttpError
          ? `${err.message} (${err.code})`
          : err instanceof Error
          ? err.message
          : t('audits.list.error');
      setState({ kind: 'error', message });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="ko-text text-2xl font-semibold leading-tight text-[color:var(--color-fg-primary)] sm:text-display-md">
            {t('audits.list.title')}
          </h1>
          <p className="ko-text text-md text-[color:var(--color-fg-secondary)]">
            {t('audits.list.subtitle')}
          </p>
        </div>
        <Link href="/audits/new" className="inline-flex">
          <Button variant="primary">{t('audits.list.newAudit')}</Button>
        </Link>
      </header>

      <Card variant="default" padding="md">
        <CardHeader>
          <CardTitle>{t('audits.list.title')}</CardTitle>
        </CardHeader>
        <CardBody>
          {state.kind === 'loading' ? (
            <p className="text-sm text-[color:var(--color-fg-muted)]">
              {t('audits.list.loading')}
            </p>
          ) : state.kind === 'error' ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-md text-[color:var(--color-severity-p0)]">
                {t('audits.list.error')}
              </p>
              <pre className="max-w-full overflow-auto text-xs text-[color:var(--color-fg-muted)]">
                {state.message}
              </pre>
              <Button onClick={() => void load()} variant="secondary">
                {t('audits.list.retry')}
              </Button>
            </div>
          ) : state.runs.length === 0 ? (
            <div className="flex flex-col items-start gap-4 py-8">
              <p className="text-md text-[color:var(--color-fg-secondary)]">
                {t('audits.list.empty.title')}
              </p>
              <Link href="/audits/new" className="inline-flex">
                <Button variant="primary">{t('audits.list.empty.cta')}</Button>
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-[color:var(--color-border-subtle)]">
              {state.runs.map((run) => (
                <li key={run.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      href={`/audits/${run.id}`}
                      className="truncate text-md font-medium text-[color:var(--color-fg-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
                    >
                      {shortRepoLabel(run.repoUrl)}
                    </Link>
                    <span className="text-xs text-[color:var(--color-fg-muted)]">
                      {formatCreatedAt(run.createdAt)}
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        color: statusBadgeColor(run.status),
                        border: `1px solid ${statusBadgeColor(run.status)}`,
                      }}
                      aria-label={`${t('audits.list.column.status')}: ${run.status}`}
                    >
                      {run.status}
                    </span>
                    <Link href={`/audits/${run.id}`} className="inline-flex">
                      <Button variant="secondary" size="sm">
                        {t('audits.list.action.open')}
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
