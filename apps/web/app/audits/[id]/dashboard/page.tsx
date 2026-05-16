'use client';

import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle } from '@cleartoship/ui';
import { ScoreOverview } from '@/components/dashboard/score-overview';
import { SeverityCounts } from '@/components/dashboard/severity-counts';
import { CategoryGrid } from '@/components/dashboard/category-grid';
import { SeverityChip } from '@/components/common/severity-chip';
import { ResourceStatePanel } from '@/components/common/resource-state-panel';
import { categoryLabel } from '@/lib/format/category';
import { t } from '@/lib/i18n';
import { getReport, listFindings } from '@/lib/api/audit-runs';
import { adaptCategoryScores, adaptFinding, adaptLaunchStatus } from '@/lib/api/adapters';
import { useAuditResource } from '@/lib/api/use-audit-resource';
import type { AuditReport, ListFindingsResponse } from '@/lib/api/audit-runs';

interface DashboardData {
  report: AuditReport;
  findings: ListFindingsResponse;
}

export default function DashboardPage({
  params,
}: {
  params: { id: string };
}) {
  const auditId = params.id;
  const state = useAuditResource<DashboardData>(
    async () => {
      const [report, findings] = await Promise.all([
        getReport(auditId),
        listFindings(auditId, { limit: 5 }),
      ]);
      return { report, findings };
    },
    [auditId]
  );

  return (
    <section className="mx-auto flex w-full max-w-[1536px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={auditId} active="dashboard" />
      <h1 className="sr-only">{t('dashboard.title')}</h1>

      {state.status === 'ready' ? (
        <DashboardBody auditId={auditId} data={state.data} />
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

function DashboardBody({
  auditId,
  data,
}: {
  auditId: string;
  data: DashboardData;
}) {
  const { report, findings } = data;
  const top5 = findings.findings.map((f) => adaptFinding(f));
  const categoryScores = adaptCategoryScores(report.categoryScores);

  return (
    <>
      <ScoreOverview
        score={report.readinessScore}
        launchStatus={adaptLaunchStatus(report.launchStatus)}
        summary={report.executiveSummary}
      />

      <section aria-labelledby="severity-title" className="flex flex-col gap-3">
        <h2
          id="severity-title"
          className="text-sm font-medium uppercase tracking-wide text-[color:var(--color-fg-muted)]"
        >
          {t('dashboard.severity.title')}
        </h2>
        <SeverityCounts counts={report.severityCounts} />
      </section>

      <section aria-labelledby="categories-title" className="flex flex-col gap-3">
        <h2
          id="categories-title"
          className="text-sm font-medium uppercase tracking-wide text-[color:var(--color-fg-muted)]"
        >
          {t('dashboard.categories.title')}
        </h2>
        <CategoryGrid scores={categoryScores} />
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
  active: 'dashboard' | 'feature-graph' | 'findings' | 'report' | 'improvement-prd';
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
      className="flex items-center gap-1 overflow-x-auto rounded-[12px] border border-[color:var(--color-border-subtle)] bg-[rgba(255,255,255,0.02)] p-1"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={[
              'whitespace-nowrap rounded-[10px] px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-[color-mix(in_oklch,var(--mk-accent-2)_18%,transparent)] text-[color:var(--app-fg)]'
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
