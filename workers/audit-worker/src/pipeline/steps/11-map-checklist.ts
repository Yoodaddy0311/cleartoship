import type { Step } from './index.js';
import { writeFinding, writeEvidence } from '../../firestore/writers.js';

/**
 * Persists pending findings (normalized) and their evidences to Firestore.
 * Categories are already set by each adapter; this step just hooks them into
 * the AuditRun. Sprint 1+ will additionally re-tag findings against the
 * 10-category checklist matrix.
 */
export const step11MapChecklist: Step = {
  step: 'MAP_CHECKLIST',
  async execute(ctx, state) {
    let written = 0;
    for (const f of state.pendingFindings) {
      const findingId = await writeFinding({
        auditRunId: ctx.runId,
        title: f.title,
        category: f.category,
        severity: f.severity,
        confidence: f.confidence,
        status: 'OPEN',
        summary: f.summary,
        nonDeveloperExplanation: f.nonDeveloperExplanation,
        technicalExplanation: f.technicalExplanation,
        impact: f.impact,
        recommendation: f.recommendation,
        acceptanceCriteria: f.acceptanceCriteria,
        tags: f.tags,
      });
      state.persistedFindingIds.push(findingId);
      for (const ev of f.evidences) {
        await writeEvidence({
          auditRunId: ctx.runId,
          findingId,
          ...ev,
        });
      }
      written += 1;
    }
    ctx.log('info', 'Checklist mapping complete', { persistedFindings: written });
  },
};
