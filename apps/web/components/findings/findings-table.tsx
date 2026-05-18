'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardBody, Button } from '@cleartoship/ui';
import { SeverityChip } from '@/components/common/severity-chip';
import { ConfidenceChip } from '@/components/common/confidence-chip';
import { categoryLabel } from '@/lib/format/category';
import { SEVERITY_ORDER } from '@/lib/format/severity';
import { FindingFilters, type FindingFiltersValue } from './finding-filters';
import { ActionHintCell } from './action-hint-cell';
import type { FindingViewModel } from '@/lib/types/finding-view';
import { t } from '@/lib/i18n';

export function FindingsTable({
  auditId,
  findings,
}: {
  auditId: string;
  findings: FindingViewModel[];
}) {
  const [filters, setFilters] = useState<FindingFiltersValue>({
    severities: new Set(),
    categories: new Set(),
  });

  const filtered = useMemo(() => {
    const ranked = findings.slice().sort((a, b) => {
      const aIx = SEVERITY_ORDER.indexOf(a.severity);
      const bIx = SEVERITY_ORDER.indexOf(b.severity);
      return aIx - bIx;
    });
    return ranked.filter((f) => {
      if (filters.severities.size > 0 && !filters.severities.has(f.severity)) return false;
      if (filters.categories.size > 0 && !filters.categories.has(f.category)) return false;
      return true;
    });
  }, [findings, filters]);

  function clearAll() {
    setFilters({ severities: new Set(), categories: new Set() });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="flex flex-col gap-3">
        <Card variant="default" padding="md">
          <CardBody>
            <FindingFilters value={filters} onChange={setFilters} />
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearAll}>
                필터 초기화
              </Button>
            </div>
          </CardBody>
        </Card>
      </aside>

      <Card variant="default" padding="none">
        {filtered.length === 0 ? (
          <CardBody className="px-6 py-16">
            <div className="flex flex-col items-center text-center">
              <h2 className="text-lg text-[color:var(--color-fg-primary)]">
                {t('findings.empty.title')}
              </h2>
              <p className="mt-2 text-sm text-[color:var(--color-fg-secondary)]">
                {t('findings.empty.desc')}
              </p>
            </div>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead className="sticky top-0 z-10 bg-[color:var(--color-bg-elevated)] text-left text-xs text-[color:var(--color-fg-muted)]">
                <tr className="border-b border-[color:var(--color-border-subtle)]">
                  <th className="px-4 py-3 font-medium">{t('findings.column.title')}</th>
                  <th className="px-4 py-3 font-medium">{t('findings.column.category')}</th>
                  <th className="px-4 py-3 font-medium">{t('findings.column.severity')}</th>
                  <th className="px-4 py-3 font-medium">{t('findings.column.confidence')}</th>
                  <th className="px-4 py-3 font-medium">
                    {t('findings.column.actionHint')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-[color:var(--color-border-subtle)] last:border-b-0 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/audits/${auditId}/findings/${f.id}`}
                        className="text-[color:var(--color-fg-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                      >
                        {f.title}
                      </Link>
                      <p className="mt-1 text-xs text-[color:var(--color-fg-muted)]">
                        {f.summary}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--color-fg-secondary)]">
                      {categoryLabel(f.category)}
                    </td>
                    <td className="px-4 py-3">
                      <SeverityChip severity={f.severity} showLabel={false} />
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceChip confidence={f.confidence} showLabel={false} />
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <ActionHintCell hint={f.actionHint} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
