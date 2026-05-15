import dynamic from 'next/dynamic';
import { Skeleton } from '@cleartoship/ui';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { getMockAudit } from '@/lib/mock/audit-fixture';
import { t } from '@/lib/i18n';

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
  const audit = getMockAudit(params.id);
  return (
    <section className="mx-auto flex w-full max-w-[1536px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={audit.id} active="feature-graph" />
      <h1 className="text-display-sm font-semibold text-[color:var(--color-fg-primary)]">
        {t('graph.title')}
      </h1>
      <GraphCanvas nodes={audit.graph.nodes} edges={audit.graph.edges} />
    </section>
  );
}
