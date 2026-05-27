'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@cleartoship/ui';
import { ScoreSkeleton } from '@/components/skeletons';
import { SeverityCounts } from '@/components/dashboard/severity-counts';
import { StrengthsPanel } from '@/components/dashboard/strengths-panel';
import { CategoryGrid } from '@/components/dashboard/category-grid';
import { LaunchVerdictChip } from '@/components/dashboard/launch-verdict-chip';
import { RepoTreeView } from '@/components/dashboard/repo-tree-view';
import { PageCardGrid } from '@/components/dashboard/page-card-grid';
import { SeverityChip } from '@/components/common/severity-chip';
import { LaunchStatusChip } from '@/components/common/launch-status-chip';
import {
  ResourceStatePanel,
  PartialResultBanner,
} from '@/components/common/resource-state-panel';
import { usePrefetchGraphCanvas } from '@/components/feature-graph/use-prefetch-graph-canvas';
// Deep import (NOT the barrel): this is a 'use client' component, and the
// audit-core barrel transitively pulls node-only modules (symbols/LSP, etc.)
// that break the client webpack bundle (node:fs/net/dns). apply-enrichment is
// pure (blend-scores + shared-types types only), so the subpath is client-safe.
import { applyEnrichment } from '@cleartoship/audit-core/scoring/apply-enrichment';
import { categoryLabel } from '@/lib/format/category';
import { t } from '@/lib/i18n';
import { getAuditRun, getReport, listFindings } from '@/lib/api/audit-runs';
import {
  adaptCategoryScoreOrigins,
  adaptCategoryScoresNullable,
  adaptFinding,
  adaptLaunchStatus,
} from '@/lib/api/adapters';
import { useAuditResource } from '@/lib/api/use-audit-resource';
import type {
  AuditReport,
  AuditRun,
  ListFindingsResponse,
} from '@/lib/api/audit-runs';
import {
  EMPTY_DATA_MODEL_INVENTORY,
  EMPTY_ROUTE_INVENTORY,
} from '@cleartoship/shared-types';

// L-P1-6 — defer the ScoreOverview chunk. The score card pulls in ScoreRing
// (SVG gauge + label formatting), LaunchStatusChip, and the i18n module via
// `launchStatusLabel`. Splitting it off the dashboard's initial JS payload and
// rendering <ScoreSkeleton /> as the fallback gives the section a CLS-safe
// placeholder while the chunk streams in. SSR stays enabled (default) so the
// dashboard HTML still ships with the score region populated when the chunk
// is already warm; the skeleton only paints on cold first-load.
const ScoreOverview = dynamic(
  () =>
    import('@/components/dashboard/score-overview').then(
      (m) => m.ScoreOverview
    ),
  {
    loading: () => <ScoreSkeleton />,
  }
);

// T1.1d: when the worker short-circuits a run via `markRunBlocked` (e.g.
// REPO_TOO_LARGE), no AuditReport doc is produced — `getReport` would 404.
// We detect BLOCKED on the run document FIRST and render a verdict-only view
// instead of attempting (and failing) to load the report.
type DashboardData =
  | {
      kind: 'ready';
      report: AuditReport;
      findings: ListFindingsResponse;
      // S6-03: kept on the dashboard payload (not just the polling DTO) so the
      // "partial results" warn banner renders on first paint, without waiting
      // for a separate request after the data is `ready`.
      run: AuditRun;
    }
  | {
      kind: 'blocked';
      run: AuditRun;
    };

export default function DashboardPage() {
  const { id: auditId } = useParams<{ id: string }>();
  const state = useAuditResource<DashboardData>(
    async () => {
      const run = await getAuditRun(auditId);
      if (run.launchStatus === 'BLOCKED') {
        return { kind: 'blocked', run };
      }
      const [report, findings] = await Promise.all([
        getReport(auditId),
        listFindings(auditId, { limit: 5 }),
      ]);
      return { kind: 'ready', report, findings, run };
    },
    [auditId]
  );

  // Idle-prefetch the GraphCanvas chunk so the feature-graph tab renders
  // instantly when the user clicks it. Runs post-hydration via
  // requestIdleCallback — zero impact on this page's LCP. See:
  // apps/web/components/feature-graph/use-prefetch-graph-canvas.ts
  usePrefetchGraphCanvas();

  return (
    <section className="mx-auto flex w-full max-w-[1536px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={auditId} active="dashboard" />
      <h1 className="sr-only">{t('dashboard.title')}</h1>

      {state.status === 'ready' ? (
        state.data.kind === 'blocked' ? (
          <DashboardBlockedBody run={state.data.run} />
        ) : (
          <DashboardBody auditId={auditId} data={state.data} />
        )
      ) : (
        <ResourceStatePanel
          state={state}
          auditId={auditId}
          pendingLabel="대시보드가 아직 준비되지 않았습니다."
        />
      )}
    </section>
  );
}

// T1.1d: BLOCKED 가드레일 short-circuit verdict view. No report doc exists for
// this run — show the verdict chip + abortReason so the user understands why
// the audit didn't produce findings, rather than ResourceStatePanel's generic
// error state (which hides the actionable reason).
function DashboardBlockedBody({ run }: { run: AuditRun }) {
  const abortReason = run.abortReason ?? 'UNKNOWN';
  return (
    <section
      data-testid="dashboard-blocked"
      aria-labelledby="dashboard-blocked-title"
      className="flex flex-col gap-4 rounded-[12px] border border-[color:var(--color-border-subtle)] bg-[rgba(255,255,255,0.02)] p-6"
    >
      <div className="flex items-center gap-3">
        <LaunchStatusChip status="blocked" />
        <h2
          id="dashboard-blocked-title"
          className="text-md font-medium text-[color:var(--color-fg-primary)]"
        >
          가드레일에 의해 분석이 중단되었습니다
        </h2>
      </div>
      <p className="text-sm text-[color:var(--color-fg-muted)]">
        중단 사유:{' '}
        <code className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 font-mono text-xs">
          {abortReason}
        </code>
      </p>
      <PartialResultBanner
        toolNames={run.partialResultTools ?? []}
        blockedContext={{ abortReason }}
      />
    </section>
  );
}

function DashboardBody({
  auditId,
  data,
}: {
  auditId: string;
  data: Extract<DashboardData, { kind: 'ready' }>;
}) {
  const { report, findings, run } = data;
  const top5 = findings.findings.map((f) => adaptFinding(f));
  // §6 — fold the opt-in L-bucket enrichment into the deterministic category
  // scores BEFORE adapting to the UI shapes. `applyEnrichment` is a pure merge:
  // when an enrichment exists (status DONE) it blends each enriched category's
  // D score with its L score and rewrites the origin to 'L'/'mixed' (the
  // existing OriginBadge renders these as 🤖/⚙️); when absent / not DONE it
  // returns the input unchanged, so behaviour is identical to today.
  const mergedCategoryScores = applyEnrichment(
    report.categoryScores,
    report.enrichment,
  );
  const categoryScores = adaptCategoryScoresNullable(mergedCategoryScores);
  const categoryOrigins = adaptCategoryScoreOrigins(mergedCategoryScores);
  const enrichmentPending = report.enrichment?.status === 'PENDING';

  return (
    <>
      <PartialResultBanner toolNames={run.partialResultTools ?? []} />
      {run.previousRunId ? (
        <div className="flex justify-end">
          <Link
            href={`/audits/${auditId}/diff`}
            data-testid="dashboard-rerun-diff-link"
            className="text-sm text-[color:var(--color-fg-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            재감사 비교 보기 →
          </Link>
        </div>
      ) : null}
      <ScoreOverview
        score={report.readinessScore}
        launchStatus={adaptLaunchStatus(report.launchStatus)}
        summary={report.executiveSummary}
      />

      {/* 7-Question Launch Gate — optional on AuditReport (older reports lack
          it). Rendered directly below the score so the founder reads the
          number, then the crisp launch verdict + the seven supporting checks. */}
      {report.launchGate ? (
        <LaunchVerdictChip launchGate={report.launchGate} />
      ) : null}

      <section aria-labelledby="severity-title" className="flex flex-col gap-3">
        <h2
          id="severity-title"
          className="text-sm font-medium uppercase tracking-wide text-[color:var(--color-fg-muted)]"
        >
          {t('dashboard.severity.title')}
        </h2>
        <SeverityCounts counts={report.severityCounts} />
      </section>

      <StrengthsPanel
        severityCounts={report.severityCounts}
        categoryScores={categoryScores}
        inventorySignals={report.inventorySignals}
      />

      <section
        aria-labelledby="repo-structure-title"
        className="flex flex-col gap-3"
      >
        <h2
          id="repo-structure-title"
          className="text-sm font-medium uppercase tracking-wide text-[color:var(--color-fg-muted)]"
        >
          저장소 구조
        </h2>
        {/*
          Phase G MVP layout — collapsible repo tree (left) + responsive page
          card grid (right). On <lg we stack vertically: tree first, cards
          second. On lg+ a 12-col grid lays the tree (cols 1-4) next to the
          card grid (cols 5-12).

          Today both inventories are fed `EMPTY_*` because the report doc
          doesn't yet persist `routeInventory` / `dataModelInventory`. The
          worker pipeline produces them (PR-A3 / PR-A2), but persisting them
          on `AuditReport` is a separate PR (out of scope per briefing's
          "변경 파일 3개" constraint). Both components render their empty
          state gracefully — no crash on first paint. Once persistence
          lands, swap to `report.routeInventory` etc. without other changes.
        */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <RepoTreeView
              routeInventory={EMPTY_ROUTE_INVENTORY}
              dataModelInventory={EMPTY_DATA_MODEL_INVENTORY}
            />
          </div>
          <div className="lg:col-span-8">
            <PageCardGrid routeInventory={EMPTY_ROUTE_INVENTORY} />
          </div>
        </div>
      </section>

      <section aria-labelledby="categories-title" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="categories-title"
            className="text-sm font-medium uppercase tracking-wide text-[color:var(--color-fg-muted)]"
          >
            {t('dashboard.categories.title')}
          </h2>
          <Link
            href={`/audits/${auditId}/categories`}
            className="text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            style={{ color: 'var(--app-fg-muted)' }}
          >
            {t('dashboard.categories.viewAll')}
          </Link>
        </div>
        {/* §6.6: enrichment still running — a muted, non-blocking note. The
            deterministic scores already render; the AI-blended values + 🤖/⚙️
            origin badges swap in on the next load once status flips to DONE. */}
        {enrichmentPending ? (
          <p className="text-xs text-[color:var(--color-fg-muted)]">
            AI 보조 분석 진행 중
          </p>
        ) : null}
        <CategoryGrid scores={categoryScores} origins={categoryOrigins} />
      </section>

      <Card variant="default" padding="md">
        <CardHeader>
          <CardTitle>{t('dashboard.top5.title')}</CardTitle>
        </CardHeader>
        <CardBody>
          {top5.length === 0 ? (
            <p className="text-sm text-[color:var(--color-fg-muted)]">
              표시할 Finding이 아직 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[color:var(--color-border-subtle)]">
              {top5.map((f, i) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="w-6 font-mono tabular-nums text-sm text-[color:var(--color-fg-muted)]">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/audits/${auditId}/findings/${f.id}`}
                      className="text-md text-[color:var(--color-fg-primary)] underline-offset-2 hover:underline"
                    >
                      {f.title}
                    </Link>
                    <p className="truncate text-xs text-[color:var(--color-fg-muted)]">
                      {categoryLabel(f.category)} · {f.summary}
                    </p>
                  </div>
                  <SeverityChip severity={f.severity} showLabel={false} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}

export function DashboardTabs({
  auditId,
  active,
}: {
  auditId: string;
  active:
    | 'dashboard'
    | 'categories'
    | 'feature-graph'
    | 'findings'
    | 'report'
    | 'improvement-prd';
}) {
  const tabs: Array<{
    key: typeof active;
    href: string;
    label: string;
  }> = [
    {
      key: 'dashboard',
      href: `/audits/${auditId}/dashboard`,
      label: t('dashboard.tab.dashboard'),
    },
    {
      key: 'categories',
      href: `/audits/${auditId}/categories`,
      label: t('dashboard.tab.categories'),
    },
    {
      key: 'feature-graph',
      href: `/audits/${auditId}/feature-graph`,
      label: t('dashboard.tab.featureGraph'),
    },
    {
      key: 'findings',
      href: `/audits/${auditId}/findings`,
      label: t('dashboard.tab.findings'),
    },
    {
      key: 'report',
      href: `/audits/${auditId}/report`,
      label: t('dashboard.tab.report'),
    },
    {
      key: 'improvement-prd',
      href: `/audits/${auditId}/improvement-prd`,
      label: t('dashboard.tab.improvementPrd'),
    },
  ];

  return (
    <nav
      aria-label="감사 결과 탭"
      // T2.11 #122: 모바일에서 탭을 sticky top으로 고정해 페이지 스크롤 중에도
      // 탭 전환이 가능하게 한다. 가로 스크롤 + scroll-snap은 칩이 6개라 좁은
      // 화면(375px)에서는 한 줄에 다 안 들어감.
      className="sticky top-0 z-30 -mx-4 flex items-center gap-1 mobile-scroll-x rounded-[12px] border border-[color:var(--color-border-subtle)] bg-[var(--app-bg)]/95 px-4 p-1 backdrop-blur sm:static sm:mx-0 sm:overflow-x-auto sm:bg-[rgba(255,255,255,0.02)]"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            data-testid={`dashboard-tab-${tab.key}`}
            className={[
              // T2.11: 모바일 터치 타겟 ≥ 44px, 데스크탑은 기존 padding 유지
              'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-[10px] px-4 py-2 text-sm transition-colors sm:min-h-0 sm:px-3',
              isActive
                ? 'bg-[color-mix(in_oklch,var(--mk-accent-2)_18%,transparent)] text-[color:var(--app-fg)] font-medium'
                : 'text-[color:var(--app-fg-muted)] hover:bg-[color:var(--app-chip-bg)] hover:text-[color:var(--app-fg)]',
              'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
