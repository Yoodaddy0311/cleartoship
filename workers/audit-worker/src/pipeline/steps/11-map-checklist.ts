import type { Step } from './index.js';
import {
  buildBusinessReadinessFindings,
  buildClaimMismatchFindings,
  buildW1AFindings,
  evaluateW1AChecklist,
} from '@cleartoship/audit-core';
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
    // T1.2-FU: convert W1-A FAIL items into pending P2 findings before the
    // persistence loop runs. step04 fills `state.w1aEvidence`; passing repos
    // produce zero findings here, failing items produce one each.
    const w1aFindings = buildW1AFindings(state.w1aEvidence);
    if (w1aFindings.length > 0) {
      state.pendingFindings.push(...w1aFindings);
      ctx.log('info', 'W1-A FAIL findings emitted', {
        count: w1aFindings.length,
        ids: w1aFindings.flatMap((f) => f.tags.filter((t) => t.startsWith('W1-A') && t.length > 4)),
      });
    }

    // T2.8 / W2-BR: convert business-readiness FAIL items into pending P1
    // findings. step13b fills `state.businessEvidence`; passing repos
    // produce zero findings here, failing items produce one each.
    const brFindings = buildBusinessReadinessFindings(state.businessEvidence);
    if (brFindings.length > 0) {
      state.pendingFindings.push(...brFindings);
      ctx.log('info', 'W2-BR FAIL findings emitted', {
        count: brFindings.length,
        ids: brFindings.flatMap((f) => f.tags.filter((t) => t.startsWith('W2-BR') && t.length > 5)),
      });
    }

    // T2.1 / W2-C: compare PRD claims to measured launch readiness; flag
    // mismatches (e.g. production-ready claim with W1-A FAILs or P0 findings).
    // step04c populates `state.prdAnalysis`; null → no docs scanned, skip.
    if (state.prdAnalysis) {
      const w1aResults = evaluateW1AChecklist(state.w1aEvidence);
      const w1aAllPass = w1aResults.every((r) => r.status === 'PASS');
      const claimFindings = buildClaimMismatchFindings(state.prdAnalysis, {
        w1aAllPass,
        severityCountsP0: state.severityCounts.P0,
      });
      if (claimFindings.length > 0) {
        state.pendingFindings.push(...claimFindings);
        ctx.log('info', 'W2-C CLAIM_MISMATCH findings emitted', {
          count: claimFindings.length,
          subtypes: claimFindings.flatMap((f) =>
            f.tags.filter((t) => t.startsWith('PRODUCTION_VS_') || t.startsWith('MVP_VS_')),
          ),
        });
      }
    }

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
