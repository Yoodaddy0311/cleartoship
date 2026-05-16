'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { Skeleton } from '@cleartoship/ui';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { ResourceStatePanel } from '@/components/common/resource-state-panel';
import { getFeatureGraph } from '@/lib/api/audit-runs';
import { adaptFeatureGraph } from '@/lib/api/adapters';
import { useAuditResource } from '@/lib/api/use-audit-resource';
import { t } from '@/lib/i18n';
import type { FeatureGraph } from '@/lib/api/audit-runs';

const GraphCanvas = dynamic(
  () =>
    import('@/components/feature-graph/graph-canvas').then((m) => m.GraphCanvas),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="h-[60vh] min-h-[420px] w-full" rounded="lg" />
    ),
  }
);

export default function FeatureGraphPage({
  params,
}: {
  params: { id: string };
}) {
  const auditId = params.id;
  const state = useAuditResource<FeatureGraph>(
    () => getFeatureGraph(auditId),
    [auditId]
  );

  const adapted = useMemo(
    () => (state.status === 'ready' ? adaptFeatureGraph(state.data) : null),
    [state]
  );

  return (
    <section className="mx-auto flex w-full max-w-[1536px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={auditId} active="feature-graph" />
      <h1 className="text-display-sm font-semibold text-[color:var(--color-fg-primary)]">
        {t('graph.title')}
      </h1>
      {adapted ? (
        <GraphCanvas nodes={adapted.nodes} edges={adapted.edges} />
      ) : (
        <ResourceStatePanel
          state={state as Exclude<typeof state, { status: 'ready' }>}
          auditId={auditId}
          pendingLabel="기능 관계도가 아직 준비되지 않았습니다."
        />
      )}
    </section>
  );
}
