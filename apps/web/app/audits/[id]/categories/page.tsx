'use client';

// Layer 2 of the 3-layer progressive disclosure (T2.3 / A2-03-B).
//
//   Layer 1 (Dashboard)   → score + Top-3 P0 findings
//   Layer 2 (this page)   → per-category cards w/ inline accordion preview
//   Layer 3 (Finding)     → /audits/[id]/findings/[findingId]
//
// Why accordion (not separate detail page per category):
//   - One round-trip: a single listFindings(limit=500) groups in-memory; no
//     N+1 fetch per card.
//   - Keyboard ergonomics: aria-expanded toggle + Enter/Space mirrors native
//     <details>, but we render <button> for full a11y control (focus ring,
//     screen-reader state announcement on toggle).
//   - Mobile: opening one card pushes others down rather than navigating away
//     — preserves scroll position which matters with 10 categories.

import { useMemo, useState, useCallback, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardBody, ScoreGauge } from '@cleartoship/ui';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { SeverityChip } from '@/components/common/severity-chip';
import { LaunchStatusChip } from '@/components/common/launch-status-chip';
import { ResourceStatePanel } from '@/components/common/resource-state-panel';
import {
  ALL_CATEGORIES,
  categoryLabel,
  type AuditCategory,
} from '@/lib/format/category';
import { SEVERITY_ORDER } from '@/lib/format/severity';
import { t } from '@/lib/i18n';
import { getReport, listFindings } from '@/lib/api/audit-runs';
import {
  adaptCategoryScoresNullable,
  adaptFinding,
} from '@/lib/api/adapters';
import { useAuditResource } from '@/lib/api/use-audit-resource';
import type { LaunchStatus } from '@/lib/format/status';
import type { FindingViewModel } from '@/lib/types/finding-view';
import type {
  AuditReport,
  ListFindingsResponse,
} from '@/lib/api/audit-runs';

type CategoriesData = {
  report: AuditReport;
  findings: ListFindingsResponse;
};

// Mirror of dashboard/category-grid.tsx chipFor — kept local so this page is
// a standalone Layer-2 surface (no implicit coupling to a dashboard helper).
function launchStatusForScore(score: number): LaunchStatus {
  if (score >= 80) return 'ready';
  if (score >= 60) return 'ready_with_improvements';
  if (score >= 40) return 'needs_work';
  return 'stop';
}

const PREVIEW_LIMIT = 3;

export default function CategoriesPage() {
  const { id: auditId } = useParams<{ id: string }>();
  const state = useAuditResource<CategoriesData>(
    async () => {
      const [report, findings] = await Promise.all([
        getReport(auditId),
        // Limit chosen to cover the worst-case grouped view without paging.
        // Server-side cap is enforced separately; this is a defensive ceiling.
        listFindings(auditId, { limit: 500 }),
      ]);
      return { report, findings };
    },
    [auditId]
  );

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={auditId} active="categories" />
      <CategoriesBreadcrumb auditId={auditId} />

      <header className="flex flex-col gap-1">
        <h1
          className="text-2xl font-semibold"
          style={{ color: 'var(--app-fg)' }}
        >
          {t('categories.title')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--app-fg-muted)' }}>
          {t('categories.subtitle')}
        </p>
      </header>

      {state.status === 'ready' ? (
        <CategoriesBody auditId={auditId} data={state.data} />
      ) : (
        <ResourceStatePanel
          state={state}
          auditId={auditId}
          pendingLabel={t('categories.loading')}
        />
      )}
    </section>
  );
}

function CategoriesBreadcrumb({ auditId }: { auditId: string }) {
  return (
    <nav
      aria-label={t('categories.breadcrumb.aria')}
      className="flex items-center gap-2 text-xs"
      style={{ color: 'var(--app-fg-muted)' }}
    >
      <Link
        href={`/audits/${auditId}/dashboard`}
        className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        {t('dashboard.tab.dashboard')}
      </Link>
      <span aria-hidden>/</span>
      <span aria-current="page" style={{ color: 'var(--app-fg)' }}>
        {t('categories.title')}
      </span>
    </nav>
  );
}

function CategoriesBody({
  auditId,
  data,
}: {
  auditId: string;
  data: CategoriesData;
}) {
  const { report, findings } = data;
  const scores = useMemo(
    () => adaptCategoryScoresNullable(report.categoryScores),
    [report.categoryScores]
  );

  // Group findings by category up front so the accordion render is O(1).
  // Also pre-sort each bucket by severity (P0→P3) so preview hits matter.
  const findingsByCategory = useMemo(() => {
    const map = new Map<AuditCategory, FindingViewModel[]>();
    for (const c of ALL_CATEGORIES) map.set(c, []);
    for (const raw of findings.findings) {
      const f = adaptFinding(raw);
      const bucket = map.get(f.category as AuditCategory);
      if (bucket) bucket.push(f);
    }
    for (const bucket of map.values()) {
      bucket.sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(a.severity) -
          SEVERITY_ORDER.indexOf(b.severity)
      );
    }
    return map;
  }, [findings]);

  const [openCategory, setOpenCategory] = useState<AuditCategory | null>(null);

  const toggle = useCallback((c: AuditCategory) => {
    setOpenCategory((prev) => (prev === c ? null : c));
  }, []);

  return (
    <ul
      role="list"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {ALL_CATEGORIES.map((c) => {
        const bucket = findingsByCategory.get(c) ?? [];
        const score = scores[c];
        const isOpen = openCategory === c;
        return (
          <li key={c} className="contents">
            <CategoryAccordionCard
              auditId={auditId}
              category={c}
              score={score}
              findings={bucket}
              isOpen={isOpen}
              onToggle={() => toggle(c)}
            />
          </li>
        );
      })}
    </ul>
  );
}

function CategoryAccordionCard({
  auditId,
  category,
  score,
  findings,
  isOpen,
  onToggle,
}: {
  auditId: string;
  category: AuditCategory;
  score: number | null;
  findings: FindingViewModel[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const label = categoryLabel(category);
  const headerId = `cat-${category}-header`;
  const panelId = `cat-${category}-panel`;
  const count = findings.length;
  const topSeverity = findings[0]?.severity;

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      // Native <button> already triggers onClick on Enter/Space, but we set
      // role="button" via the element semantics for screen-reader clarity.
      // Capturing here defends against missed events on some AT combinations.
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggle();
      }
    },
    [onToggle]
  );

  return (
    <Card
      variant="default"
      padding="md"
      className={isOpen ? 'sm:col-span-2 lg:col-span-3' : undefined}
    >
      <CardBody>
        <button
          id={headerId}
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          onKeyDown={handleKey}
          className="flex w-full items-start gap-4 rounded-[8px] text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <div className="flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <h2
                className="text-base font-medium"
                style={{ color: 'var(--app-fg)' }}
              >
                {label}
              </h2>
              <span
                className="text-xs tabular-nums"
                style={{ color: 'var(--app-fg-muted)' }}
              >
                {t('categories.count.prefix')} {count}
                {t('categories.count.suffix')}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              {score == null ? (
                <span
                  className="font-mono tabular-nums text-lg"
                  style={{ color: 'var(--color-fg-muted)' }}
                  aria-label={`${label} ${t('categories.na.aria')}`}
                >
                  N/A
                </span>
              ) : (
                <ScoreGauge
                  label=""
                  score={score}
                  chip={
                    <LaunchStatusChip status={launchStatusForScore(score)} />
                  }
                />
              )}
              {topSeverity ? (
                <SeverityChip severity={topSeverity} showLabel />
              ) : null}
            </div>
            {findings[0] ? (
              <p
                className="mt-2 truncate text-xs"
                style={{ color: 'var(--app-fg-muted)' }}
                title={findings[0].title}
              >
                {findings[0].title}
              </p>
            ) : (
              <p
                className="mt-2 text-xs"
                style={{ color: 'var(--app-fg-muted)' }}
              >
                {t('categories.empty.row')}
              </p>
            )}
          </div>
          <span
            aria-hidden
            className="ml-2 select-none text-base"
            style={{ color: 'var(--app-fg-muted)' }}
          >
            {isOpen ? '▾' : '▸'}
          </span>
        </button>

        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          hidden={!isOpen}
          className="mt-4 flex flex-col gap-2 border-t border-[color:var(--app-border)] pt-4"
        >
          {findings.length === 0 ? (
            <p
              className="text-sm"
              style={{ color: 'var(--app-fg-muted)' }}
            >
              {t('categories.empty.panel')}
            </p>
          ) : (
            <>
              <ul role="list" className="flex flex-col gap-2">
                {findings.slice(0, PREVIEW_LIMIT).map((f) => (
                  <li key={f.id} className="flex items-center gap-3">
                    <SeverityChip severity={f.severity} showLabel={false} />
                    <Link
                      href={`/audits/${auditId}/findings/${f.id}`}
                      className="min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                      style={{ color: 'var(--app-fg)' }}
                    >
                      {f.title}
                    </Link>
                  </li>
                ))}
              </ul>
              {findings.length > PREVIEW_LIMIT ? (
                <Link
                  href={`/audits/${auditId}/findings?category=${category}`}
                  className="self-start text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  style={{ color: 'var(--app-fg-muted)' }}
                >
                  {t('categories.viewAll.prefix')} {findings.length}
                  {t('categories.viewAll.suffix')}
                </Link>
              ) : null}
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

