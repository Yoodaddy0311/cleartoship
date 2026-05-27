import type { Step } from './index.js';
import {
  calculateScores,
  getProfile,
  scoreDataModel,
  scoreFeatureGraph,
  scoreFrontendCode,
  scoreFunctionalFlow,
  scoreMaintainability,
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
    // Phase 2 (Audit Quality Roadmap §5) — deterministic Pattern Library scores
    // for the two structural categories still N/A after Phase 1.3. The
    // detectors are pure over `state.fileTree` + the W1-A file markers; they
    // run here rather than in a dedicated pipeline step because every input is
    // already on `state` at scoring time (no second file walk needed). Each
    // returns null when the category is genuinely not assessable (no frontend
    // code / empty file tree) → the category stays N/A.
    // Derived feature-graph signals from detectedFeatures (always populated).
    const componentFeatureCount = state.detectedFeatures.filter(
      (f) => f.type === 'component',
    ).length;
    const featureEdgeCount = state.detectedFeatures.reduce(
      (sum, f) => sum + (f.edges?.length ?? 0),
      0,
    );
    const hasAuthGuard = state.detectedFeatures.some((f) => f.type === 'auth_guard');

    const frontendScore = scoreFrontendCode({
      fileTree: state.fileTree,
      componentFeatureCount,
      pageCount: state.routeInventory.counts.pages,
    });
    const maintainabilityScore = scoreMaintainability({
      fileTree: state.fileTree,
      hasReadme: state.w1aEvidence.README_PRESENT,
      hasTests: state.w1aEvidence.TESTS_DIR_PRESENT,
      hasCiConfig: state.w1aEvidence.CI_CONFIG_PRESENT,
      hasLicense: state.w1aEvidence.LICENSE_PRESENT,
      hasPackageScripts: state.w1aEvidence.PACKAGE_SCRIPTS_PRESENT,
    });
    // §5.3/§7.1 — full Pattern Library detectors for the three structural
    // categories that previously only had Phase 1.3 inventory baselines. A
    // pattern score wins over the baseline (calculateScores precedence), so
    // these refine FEATURE_GRAPH / FUNCTIONAL_FLOW / DATA_MODEL upward/downward
    // from the coarse floor. Each returns null when genuinely not assessable.
    const featureGraphScore = scoreFeatureGraph({
      routeInventory: state.routeInventory,
      featureNodeCount: state.detectedFeatures.length,
      featureEdgeCount,
    });
    const functionalFlowScore = scoreFunctionalFlow({
      routeInventory: state.routeInventory,
      hasAuthGuard,
    });
    const dataModelPatternScore = scoreDataModel({
      dataModelInventory: state.dataModelInventory,
    });
    const patternScores = {
      ...(frontendScore
        ? { FRONTEND_CODE: { score: frontendScore.score, origin: frontendScore.origin } }
        : {}),
      ...(maintainabilityScore
        ? {
            MAINTAINABILITY_DOCUMENTATION: {
              score: maintainabilityScore.score,
              origin: maintainabilityScore.origin,
            },
          }
        : {}),
      ...(featureGraphScore
        ? { FEATURE_GRAPH: { score: featureGraphScore.score, origin: featureGraphScore.origin } }
        : {}),
      ...(functionalFlowScore
        ? {
            FUNCTIONAL_FLOW: {
              score: functionalFlowScore.score,
              origin: functionalFlowScore.origin,
            },
          }
        : {}),
      ...(dataModelPatternScore
        ? { DATA_MODEL: { score: dataModelPatternScore.score, origin: dataModelPatternScore.origin } }
        : {}),
    };
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
      // Phase 2 (§5) — Pattern Library scores for FRONTEND_CODE /
      // MAINTAINABILITY_DOCUMENTATION. The scorer applies these only to
      // categories that are otherwise N/A for lack of a measuredBy step, and a
      // pattern score wins over a Phase 1.3 inventory baseline for the same
      // category.
      patternScores,
      // Audit Quality Roadmap §4.1 — external (W1-A file-marker) evidence for
      // the 7-Question Launch Gate. The scorer derives the rest (P0 count,
      // deploy reachability, category scores) from its own output.
      // `readmeClaimVerified` / `hasContributing` are Phase 3 / not-yet-tracked
      // signals, intentionally omitted so the gate answers from presence alone.
      launchEvidence: {
        hasReadme: state.w1aEvidence.README_PRESENT,
        hasLicense: state.w1aEvidence.LICENSE_PRESENT,
        hasCiConfig: state.w1aEvidence.CI_CONFIG_PRESENT,
        hasTests: state.w1aEvidence.TESTS_DIR_PRESENT,
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
    // Audit Quality Roadmap §4.1 — persist the 7-Question Launch Gate verdict
    // so step13 can write it onto the report for the dashboard chip. `result`
    // omits the field entirely when no launch evidence was supplied; default
    // to null so the typed state contract stays exact.
    state.launchGate = result.launchGate ?? null;
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
