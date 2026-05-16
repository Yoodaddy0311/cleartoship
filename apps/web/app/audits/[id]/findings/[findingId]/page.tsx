'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { FindingDetailPanel } from '@/components/findings/finding-detail-panel';
import { ResourceStatePanel } from '@/components/common/resource-state-panel';
import { getFinding } from '@/lib/api/audit-runs';
import { adaptFinding } from '@/lib/api/adapters';
import { useAuditResource } from '@/lib/api/use-audit-resource';
import { t } from '@/lib/i18n';
import type { GetFindingResponse } from '@/lib/api/audit-runs';

interface PageProps {
  params: { id: string; findingId: string };
}

export default function FindingDetailPage({ params }: PageProps) {
  const { id: auditId, findingId } = params;
  const state = useAuditResource<GetFindingResponse>(
    () => getFinding(findingId, auditId),
    [auditId, findingId]
  );

  const finding = useMemo(
    () =>
      state.status === 'ready'
        ? adaptFinding(state.data.finding, state.data.evidences)
        : null,
    [state]
  );

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={auditId} active="findings" />
      <Link
        href={`/audits/${auditId}/findings`}
        className="inline-flex items-center gap-1 text-sm text-[color:var(--color-fg-secondary)] hover:text-[color:var(--color-fg-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {t('common.back')}
      </Link>
      {finding ? (
        <FindingDetailPanel finding={finding} />
      ) : (
        <ResourceStatePanel
          state={state as Exclude<typeof state, { status: 'ready' }>}
          auditId={auditId}
        />
      )}
    </section>
  );
}
