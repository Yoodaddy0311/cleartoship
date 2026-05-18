'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Skeleton } from '@cleartoship/ui';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { ResourceStatePanel } from '@/components/common/resource-state-panel';
import {
  createAuditRun,
  getAuditRun,
  getFeatureGraph,
  listEvidences,
} from '@/lib/api/audit-runs';
import { adaptFeatureGraph } from '@/lib/api/adapters';
import { useAuditResource } from '@/lib/api/use-audit-resource';
import { buildFindingIdsByNode } from '@/lib/feature-graph/adapter';
import { t } from '@/lib/i18n';
import type { FeatureGraph } from '@/lib/api/audit-runs';
import type { Evidence } from '@cleartoship/shared-types';

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

export default function FeatureGraphPage() {
  const { id: auditId } = useParams<{ id: string }>();
  const router = useRouter();
  const state = useAuditResource<FeatureGraph>(
    () => getFeatureGraph(auditId),
    [auditId]
  );
  const [rerunStatus, setRerunStatus] = useState<
    'idle' | 'submitting' | 'error'
  >('idle');
  const [rerunError, setRerunError] = useState<string | null>(null);

  async function handleRerun() {
    setRerunStatus('submitting');
    setRerunError(null);
    try {
      const run = await getAuditRun(auditId);
      const created = await createAuditRun({
        repoUrl: run.repoUrl,
        ...(run.deployUrl ? { deployUrl: run.deployUrl } : {}),
        ...(run.prdText ? { prdText: run.prdText } : {}),
      });
      router.push(`/audits/${created.auditRunId}`);
    } catch (err) {
      setRerunStatus('error');
      setRerunError(err instanceof Error ? err.message : '요청에 실패했습니다.');
    }
  }

  // Secondary fetch: pull every evidence in the run via a single round-trip
  // so we can join graph nodes (which carry `evidenceIds`) to their owning
  // findings via `Evidence.findingId`. Best-effort — failures must NOT block
  // the graph; we degrade to an empty `findingIdsByNode` map, which the
  // canvas already handles gracefully.
  const [evidences, setEvidences] = useState<ReadonlyArray<Evidence>>([]);

  useEffect(() => {
    let cancelled = false;
    setEvidences([]);
    (async () => {
      try {
        const res = await listEvidences(auditId);
        if (cancelled) return;
        setEvidences(res.evidences);
      } catch {
        if (!cancelled) setEvidences([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auditId]);

  const adapted = useMemo(
    () => (state.status === 'ready' ? adaptFeatureGraph(state.data) : null),
    [state]
  );

  const findingIdsByNode = useMemo(() => {
    if (state.status !== 'ready') return {};
    return buildFindingIdsByNode(state.data.nodes, evidences);
  }, [state, evidences]);

  return (
    <section className="mx-auto flex w-full max-w-[1536px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={auditId} active="feature-graph" />
      <h1 className="text-display-sm font-semibold text-[color:var(--color-fg-primary)]">
        {t('graph.title')}
      </h1>
      {adapted ? (
        adapted.nodes.length === 0 ? (
          <div
            data-testid="feature-graph-empty"
            role="status"
            className="rounded-mk border border-app-border bg-mk-bg-soft px-6 py-10 text-center"
          >
            <h2 className="text-lg font-semibold text-mk-fg">
              기능 노드가 비어 있어요
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-mk-fg-muted">
              아래 두 가지가 가장 흔한 원인이에요. 다시 분석하면 최신 룰로 노드를
              재구성합니다.
            </p>
            <ul className="mx-auto mt-4 max-w-xl space-y-2 text-left text-sm text-mk-fg-muted">
              <li className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>
                  <strong className="font-medium text-mk-fg">
                    {t('graph.empty.cause.stale.label')}
                  </strong>
                  {t('graph.empty.cause.stale.body')}
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>
                  <strong className="font-medium text-mk-fg">
                    {t('graph.empty.cause.buildArtifacts.label')}
                  </strong>
                  {t('graph.empty.cause.buildArtifacts.body')}
                </span>
              </li>
            </ul>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                data-testid="feature-graph-empty-rerun"
                onClick={handleRerun}
                variant="primary"
                disabled={rerunStatus === 'submitting'}
              >
                {rerunStatus === 'submitting' ? '다시 분석 요청 중…' : '다시 분석'}
              </Button>
              <a
                href={`/audits/${auditId}/dashboard`}
                className="text-sm text-mk-accent underline-offset-2 hover:underline"
              >
                대시보드에서 다른 결과 보기
              </a>
            </div>
            {rerunStatus === 'error' && rerunError ? (
              <p
                role="alert"
                className="mt-3 text-sm text-[color:var(--color-severity-p0)]"
              >
                {rerunError}
              </p>
            ) : null}
          </div>
        ) : (
          <GraphCanvas
            nodes={adapted.nodes}
            edges={adapted.edges}
            auditId={auditId}
            findingIdsByNode={findingIdsByNode}
          />
        )
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
