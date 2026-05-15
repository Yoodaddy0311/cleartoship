import type { Step } from './index.js';
import { calculateScores } from '@cleartoship/audit-core';

export const step12CalculateScores: Step = {
  step: 'CALCULATE_SCORES',
  async execute(ctx, state) {
    const result = calculateScores({
      findings: state.pendingFindings.map((f) => ({
        category: f.category,
        severity: f.severity,
      })),
    });
    state.severityCounts = result.severityCounts;
    state.readinessScore = result.readinessScore;
    state.launchStatus = result.launchStatus;
    // Save category scores into state via a private field (we read them back in step 13).
    (state as unknown as { __categoryScores: typeof result.categoryScores }).__categoryScores =
      result.categoryScores;
    ctx.log('info', 'Scores calculated', {
      readinessScore: result.readinessScore,
      launchStatus: result.launchStatus,
    });
  },
};
