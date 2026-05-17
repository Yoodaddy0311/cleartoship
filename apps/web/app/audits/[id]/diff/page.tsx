'use client';

// T2.5-FU #139 — re-audit diff route.
//
// Wires the T2.5 DiffView component up to live data: this page resolves the
// current run, looks up its `previousRunId`, fetches both reports + finding
// lists, runs `computeRunDiff` from shared-types, and hands the result to
// DiffView. The component itself is purely presentational, so all the
// "what to do when there is no baseline" logic lives here.

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardBody } from '@cleartoship/ui';
import {
  computeRunDiff,
  type Finding,
  type RunDiff,
} from '@cleartoship/shared-types';
import { DiffView } from '@/components/audit-report/diff-view';
import { ResourceStatePanel } from '@/components/common/resource-state-panel';
import {
  getAuditRun,
  getReport,
  listFindings,
  type AuditRun,
  type AuditReport,
} from '@/lib/api/audit-runs';
import { ApiHttpError } from '@/lib/api/client';
import { useAuditResource } from '@/lib/api/use-audit-resource';

type DiffData =
  | { kind: 'no-baseline'; run: AuditRun }
  | {
      kind: 'ready';
      run: AuditRun;
      previousRunId: string;
      diff: RunDiff;
    };

// listFindings hard-caps `limit` at 500 (shared-types/api.ts). Diff view
// uses 200 (well within cap) because production runs almost always emit
// < 200 findings; if a future run exceeds it the diff is computed against
// the first page only, which is preferable to looping behind the user's
// back and exploding latency. A follow-up can add cursor pagination once
// we see a real run that needs it.
const FINDINGS_LIMIT = 200;

async function fetchAllFindings(runId: string): Promise<Finding[]> {
  const res = await listFindings(runId, { limit: FINDINGS_LIMIT });
  return res.findings as Finding[];
}

async function fetchDiffData(currentRunId: string): Promise<DiffData> {
  const run = await getAuditRun(currentRunId);
  const previousRunId = run.previousRunId;
  if (!previousRunId) {
    return { kind: 'no-baseline', run };
  }

  // Previous report might be 404 if it was a BLOCKED run with no report doc.
  // Treat that as "no baseline" rather than failing the whole page.
  const [currReport, prevReportOrNull, currFindings, prevFindings] =
    await Promise.all([
      getReport(currentRunId),
      getReport(previousRunId).catch((err: unknown) => {
        if (err instanceof ApiHttpError && err.status === 404) return null;
        throw err;
      }),
      fetchAllFindings(currentRunId),
      fetchAllFindings(previousRunId).catch((err: unknown) => {
        if (err instanceof ApiHttpError && err.status === 404)
          return [] as Finding[];
        throw err;
      }),
    ]);

  const diff = computeRunDiff({
    previousRunId,
    currentRunId,
    previousReport: (prevReportOrNull as AuditReport) ?? null,
    currentReport: currReport,
    previousFindings: prevFindings,
    currentFindings: currFindings,
  });
  return { kind: 'ready', run, previousRunId, diff };
}

export default function DiffPage() {
  const { id: auditId } = useParams<{ id: string }>();
  const state = useAuditResource<DiffData>(
    () => fetchDiffData(auditId),
    [auditId]
  );

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/audits/${auditId}/dashboard`}
          className="text-xs text-[color:var(--color-fg-muted)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          ← 대시보드로 돌아가기
        </Link>
        <h1 className="text-display-md font-semibold text-[color:var(--color-fg-primary)]">
          재감사 비교
        </h1>
      </header>

      {state.status === 'ready' ? (
        state.data.kind === 'no-baseline' ? (
          <NoBaselineEmptyState />
        ) : (
          <DiffView diff={state.data.diff} />
        )
      ) : (
        <ResourceStatePanel
          state={state}
          auditId={auditId}
          pendingLabel="비교 데이터를 준비 중입니다."
        />
      )}
    </section>
  );
}

function NoBaselineEmptyState() {
  return (
    <Card variant="default" padding="md" data-testid="diff-no-baseline">
      <CardBody>
        <div className="flex flex-col items-start gap-2">
          <h2 className="text-md font-medium text-[color:var(--color-fg-primary)]">
            첫 감사라 비교 대상이 없습니다
          </h2>
          <p className="text-sm text-[color:var(--color-fg-secondary)]">
            같은 저장소에 대해 두 번째 감사를 실행하면 이전 결과와의 변화가
            여기에 표시됩니다.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
