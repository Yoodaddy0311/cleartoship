import type { Step } from './index.js';
import {
  calculateScores,
  getProfile,
  type AvailableTools,
} from '@cleartoship/audit-core';
import { getToolsHealthSync } from '../../diagnostics/tools-health.js';

/**
 * Probe scanner CLIs at scoring time so the confidence multiplier reflects
 * the runtime that actually produced the findings. We currently use the
 * `git` probe slot as a proxy for the in-repo secrets scanner since the
 * dedicated secret-scan step depends on git/diff tooling being present.
 */
function probeAvailableTools(): AvailableTools {
  try {
    const h = getToolsHealthSync();
    return {
      semgrep: h.semgrep.status === 'found',
      osvScanner: h['osv-scanner'].status === 'found',
      lighthouse: h.lighthouse.status === 'found',
      // No standalone secrets-scanner CLI in this project — git absence fails
      // CLONE_REPO upstream, invalidating all downstream signals, so we use
      // its presence as the proxy signal.
      secretsScanner: h.git.status === 'found',
    };
  } catch {
    // Defensive fallback: if probing crashes we assume nothing is available
    // so the score is conservatively discounted rather than overstated.
    return {
      semgrep: false,
      osvScanner: false,
      lighthouse: false,
      secretsScanner: false,
    };
  }
}

export const step12CalculateScores: Step = {
  step: 'CALCULATE_SCORES',
  async execute(ctx, state) {
    // Coverage signals tell the scorer how confident the analysis is. Zero
    // feature nodes / tiny file tree / unreachable deploy URL all discount
    // the readiness score and can force launchStatus → INDETERMINATE so the
    // UI no longer shows misleadingly high numbers when nothing was analysed.
    const coverage = {
      featureNodeCount: state.detectedFeatures.length,
      analyzedFileCount: state.fileTree.length,
      deployUrlReachable: !!ctx.deployUrl,
    };
    const availableTools = probeAvailableTools();
    // T2.4: resolve the audit profile selected at run start (if any). Unknown
    // / missing ids return null — `applyProfileWeights` is a no-op under
    // null, so spec defaults still apply. `getProfile` swallows typos/legacy
    // docs so a bad profileId can never crash the worker.
    const profile = getProfile(ctx.profileId);
    // BUG-1: forward which steps actually ran so the scorer can N/A any
    // category whose measuredBy step skipped (e.g. UX_UI when there was no
    // deployUrl, so ANALYZE_DEPLOY_URL early-returned without findings).
    const result = calculateScores({
      findings: state.pendingFindings.map((f) => ({
        category: f.category,
        severity: f.severity,
      })),
      coverage,
      availableTools,
      executedSteps: state.executedSteps,
      profile,
      // PR-A4 — pass the three source-driven inventories so the scorer can
      // lift PRODUCT_INTENT / FEATURE_GRAPH / DATA_MODEL out of N/A when the
      // pipeline-step measurement is empty but inventory data exists.
      // `repoMetadata` is nullable (step02 can throw before populating it);
      // the inventory helpers tolerate null.
      inventories: {
        repoMetadata: state.repoMetadata,
        dataModelInventory: state.dataModelInventory,
        routeInventory: state.routeInventory,
      },
    });
    state.severityCounts = result.severityCounts;
    state.readinessScore = result.readinessScore;
    state.launchStatus = result.launchStatus;
    // I2: typed channel — step13 reads state.categoryScores back without an
    // `as unknown as` cast. Promoted from a smuggled __categoryScores field
    // so producer/consumer share a checked contract.
    state.categoryScores = result.categoryScores;
    // PR-A4-fix: surface inventory signals so step13 can persist them in
    // the report — the dashboard's strengths panel renders them as positive
    // evidence cards ("권장사항: GitHub topics 발견"). They do NOT contribute
    // to the score (the fix is precisely to NOT conflate existence with
    // quality).
    state.inventorySignals = result.inventorySignals;
    ctx.log('info', 'Scores calculated', {
      readinessScore: result.readinessScore,
      launchStatus: result.launchStatus,
      coverage,
      availableTools,
      toolsAvailableRatio: result.toolsAvailableRatio,
      confidenceMultiplier: result.confidenceMultiplier,
      profileId: profile?.id ?? null,
    });
  },
};
