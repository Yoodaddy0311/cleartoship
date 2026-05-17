'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FilterChips, FindingCard } from '@cleartoship/ui';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { ResourceStatePanel } from '@/components/common/resource-state-panel';
import { listFindings } from '@/lib/api/audit-runs';
import { adaptFinding } from '@/lib/api/adapters';
import { useAuditResource } from '@/lib/api/use-audit-resource';
import { categoryLabel } from '@/lib/format/category';
import { SEVERITY_ORDER, type Severity } from '@/lib/format/severity';
import { t } from '@/lib/i18n';
import type { ListFindingsResponse } from '@/lib/api/audit-runs';
import type { FindingViewModel } from '@/lib/types/finding-view';

type StatusFilter = 'all' | 'confirmed' | 'open';

export default function FindingsPage() {
  const { id: auditId } = useParams<{ id: string }>();
  const router = useRouter();
  const state = useAuditResource<ListFindingsResponse>(
    () => listFindings(auditId, { limit: 200 }),
    [auditId]
  );

  const findings = useMemo<FindingViewModel[]>(
    () =>
      state.status === 'ready'
        ? state.data.findings.map((f) => adaptFinding(f))
        : [],
    [state]
  );

  const [selectedStatus, setSelectedStatus] = useState<StatusFilter[]>(['all']);
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);

  const sorted = useMemo(() => {
    return findings.slice().sort((a, b) => {
      return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    });
  }, [findings]);

  const filtered = useMemo(() => {
    return sorted.filter((f) => {
      if (
        selectedSeverities.length > 0 &&
        !selectedSeverities.includes(f.severity)
      )
        return false;
      return true;
    });
  }, [sorted, selectedSeverities]);

  const sevCounts = useMemo(() => {
    const m: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    sorted.forEach((f) => {
      m[f.severity] += 1;
    });
    return m;
  }, [sorted]);

  const statusChips = [
    { value: 'all', label: '전체', count: sorted.length },
    { value: 'confirmed', label: '확정' },
    { value: 'open', label: '미확정' },
  ];

  const severityChips = SEVERITY_ORDER.map((s) => ({
    value: s,
    label: s,
    count: sevCounts[s],
  }));

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-8 py-6">
      <DashboardTabs auditId={auditId} active="findings" />
      <header className="flex flex-col gap-1">
        <h1
          className="text-2xl font-semibold"
          style={{ color: 'var(--app-fg)' }}
        >
          {t('findings.title')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--app-fg-muted)' }}>
          {sorted.length}개의 이슈가 발견되었습니다.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <FilterChips
          aria-label="상태 필터"
          chips={statusChips}
          selected={selectedStatus}
          onChange={(next) =>
            setSelectedStatus(next.length === 0 ? ['all'] : (next as StatusFilter[]))
          }
          multiple={false}
        />
        <FilterChips
          aria-label="위험도 필터"
          chips={severityChips}
          selected={selectedSeverities}
          onChange={setSelectedSeverities}
          multiple
        />
      </div>

      {state.status === 'ready' ? (
        filtered.length === 0 ? (
          <div
            className="rounded-lg px-6 py-16 text-center"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              borderRadius: 'var(--app-radius)',
            }}
          >
            <h2 className="text-base" style={{ color: 'var(--app-fg)' }}>
              {t('findings.empty.title')}
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ color: 'var(--app-fg-muted)' }}
            >
              {t('findings.empty.desc')}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((f) => {
              const firstEvidence = f.evidences[0];
              return (
                <li key={f.id}>
                  <FindingCard
                    severity={f.severity}
                    title={f.title}
                    ruleId={f.id}
                    filePath={firstEvidence?.filePath ?? '—'}
                    line={firstEvidence?.lineStart ?? 0}
                    category={categoryLabel(f.category)}
                    excerpt={f.summary}
                    onView={() =>
                      router.push(`/audits/${auditId}/findings/${f.id}`)
                    }
                  />
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <ResourceStatePanel
          state={state}
          auditId={auditId}
          pendingLabel="Finding 분석이 아직 진행 중입니다."
        />
      )}
    </section>
  );
}
