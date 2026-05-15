import type { Step } from './index.js';
import type { Finding } from '@cleartoship/shared-types';
import { buildImprovementPrd } from '@cleartoship/audit-core';
import { getFirestoreClient } from '../../firestore/client.js';
import { writeImprovementPrd } from '../../firestore/writers.js';

export const step14GenerateImprovementPrd: Step = {
  step: 'GENERATE_IMPROVEMENT_PRD',
  async execute(ctx, state) {
    const db = getFirestoreClient();
    const snap = await db.collection(`auditRuns/${ctx.runId}/findings`).get();
    const findings: Finding[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        auditRunId: ctx.runId,
        title: data.title,
        category: data.category,
        severity: data.severity,
        confidence: data.confidence,
        status: data.status ?? 'OPEN',
        summary: data.summary,
        nonDeveloperExplanation: data.nonDeveloperExplanation ?? null,
        technicalExplanation: data.technicalExplanation ?? null,
        impact: data.impact ?? null,
        recommendation: data.recommendation ?? null,
        acceptanceCriteria: data.acceptanceCriteria ?? [],
        tags: data.tags ?? [],
        evidenceCount: data.evidenceCount ?? 0,
        createdAt: new Date().toISOString(),
      };
    });

    const prd = buildImprovementPrd({
      projectName: deriveProjectName(ctx.repoUrl),
      readinessScore: state.readinessScore,
      launchStatus: state.launchStatus,
      severityCounts: state.severityCounts,
      findings,
    });

    await writeImprovementPrd(ctx.runId, {
      auditRunId: ctx.runId,
      title: prd.title,
      markdown: prd.markdown,
      epicCount: prd.epicCount,
    });
    ctx.log('info', 'Improvement PRD generated', { epicCount: prd.epicCount });
  },
};

function deriveProjectName(repoUrl: string): string {
  const m = /\/([^/]+?)(?:\.git)?\/?$/.exec(repoUrl);
  return m?.[1] ?? 'project';
}
