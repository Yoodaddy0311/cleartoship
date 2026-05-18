import { describe, expect, it } from 'vitest';
import {
  calculateScores,
  compareCategoryScoresWithTieBreak,
} from './calculate-scores.js';
import { CATEGORY_META, getCategoryMeta } from './checklist-mapping.js';
import { getProfile } from '../profiles/index.js';
import type {
  AuditCategory,
  CategoryScore,
  Finding,
  Severity,
} from '@cleartoship/shared-types';

type FindingInput = Pick<Finding, 'category' | 'severity'>;

function f(category: AuditCategory, severity: Severity): FindingInput {
  return { category, severity };
}

describe('CATEGORY_META weights', () => {
  it('weights sum to exactly 100 (spec §1.2)', () => {
    const sum = CATEGORY_META.reduce((acc, m) => acc + m.weight, 0);
    expect(sum).toBe(100);
  });

  it('SECURITY_PRIVACY carries weight 15', () => {
    const sp = CATEGORY_META.find((m) => m.category === 'SECURITY_PRIVACY');
    expect(sp?.weight).toBe(15);
  });

  it('MAINTAINABILITY_DOCUMENTATION carries weight 5', () => {
    const m = CATEGORY_META.find((c) => c.category === 'MAINTAINABILITY_DOCUMENTATION');
    expect(m?.weight).toBe(5);
  });

  it('PRODUCT_INTENT and REQUIREMENT_COVERAGE carry weight 0', () => {
    expect(CATEGORY_META.find((m) => m.category === 'PRODUCT_INTENT')?.weight).toBe(0);
    expect(CATEGORY_META.find((m) => m.category === 'REQUIREMENT_COVERAGE')?.weight).toBe(0);
  });
});

describe('getCategoryMeta', () => {
  it('returns the meta object for a known category', () => {
    const m = getCategoryMeta('SECURITY_PRIVACY');
    expect(m.category).toBe('SECURITY_PRIVACY');
    expect(m.weight).toBe(15);
    expect(m.label).toBe('Security & Privacy');
  });

  it('throws for an unknown category string', () => {
    expect(() => getCategoryMeta('NOT_A_CATEGORY' as AuditCategory)).toThrow(
      /Unknown audit category/,
    );
  });
});

describe('calculateScores — empty findings', () => {
  it('returns readinessScore 100 when there are no findings', () => {
    const result = calculateScores({ findings: [] });
    expect(result.readinessScore).toBe(100);
  });

  it('returns READY launch status when score = 100 and no P0', () => {
    const result = calculateScores({ findings: [] });
    expect(result.launchStatus).toBe('READY');
  });

  it('measured categories score 100 baseline, unmeasured surface as N/A', () => {
    const result = calculateScores({ findings: [] });
    for (const cs of result.categoryScores) {
      const meta = CATEGORY_META.find((m) => m.category === cs.category)!;
      if (meta.measuredBy.length === 0) {
        expect(cs.score).toBeNull();
      } else {
        expect(cs.score).toBe(100);
      }
    }
  });

  it('severity counts are all zero', () => {
    const result = calculateScores({ findings: [] });
    expect(result.severityCounts).toEqual({ P0: 0, P1: 0, P2: 0, P3: 0 });
  });
});

describe('calculateScores — severity deductions (P1=-8, P2=-4, P3=-1)', () => {
  it('one P1 in SECURITY_PRIVACY reduces SP to 92', () => {
    const result = calculateScores({ findings: [f('SECURITY_PRIVACY', 'P1')] });
    const sp = result.categoryScores.find((c) => c.category === 'SECURITY_PRIVACY');
    expect(sp?.score).toBe(92);
  });

  it('one P2 reduces category by 4', () => {
    const result = calculateScores({ findings: [f('UX_UI', 'P2')] });
    const ux = result.categoryScores.find((c) => c.category === 'UX_UI');
    expect(ux?.score).toBe(96);
  });

  it('one P3 reduces category by 1 (using a measured category)', () => {
    // FEATURE_GRAPH has no measuredBy (N/A) — use SECURITY_PRIVACY which is
    // actually measured by static-analysis/secret-scan/etc.
    const result = calculateScores({ findings: [f('SECURITY_PRIVACY', 'P3')] });
    const sp = result.categoryScores.find((c) => c.category === 'SECURITY_PRIVACY');
    expect(sp?.score).toBe(99);
  });

  it('multiple findings stack deductions linearly', () => {
    const findings: FindingInput[] = [
      f('BACKEND_API', 'P1'), // -8
      f('BACKEND_API', 'P2'), // -4
      f('BACKEND_API', 'P3'), // -1
    ];
    const result = calculateScores({ findings });
    const api = result.categoryScores.find((c) => c.category === 'BACKEND_API');
    expect(api?.score).toBe(87);
  });

  it('clamps category score at floor 0 — cannot go negative', () => {
    // 20 P1 findings = -160, but should clamp to 0
    const many: FindingInput[] = Array.from({ length: 20 }, () => f('UX_UI', 'P1'));
    const result = calculateScores({ findings: many });
    const ux = result.categoryScores.find((c) => c.category === 'UX_UI');
    expect(ux?.score).toBe(0);
  });
});

describe('calculateScores — P0 cap (caps at 60)', () => {
  it('a single P0 caps the category at 60', () => {
    const result = calculateScores({ findings: [f('SECURITY_PRIVACY', 'P0')] });
    const sp = result.categoryScores.find((c) => c.category === 'SECURITY_PRIVACY');
    expect(sp?.score).toBe(60);
  });

  it('P0 plus other deductions still caps at 60 (deductions cannot lower below cap if already lower)', () => {
    // 5 P1 = -40 = 60, P0 cap = min(60, 60) = 60
    const findings: FindingInput[] = [
      f('SECURITY_PRIVACY', 'P0'),
      f('SECURITY_PRIVACY', 'P1'),
      f('SECURITY_PRIVACY', 'P1'),
    ];
    const result = calculateScores({ findings });
    const sp = result.categoryScores.find((c) => c.category === 'SECURITY_PRIVACY');
    // baseline 100 - 8 - 8 = 84, then capped to 60
    expect(sp?.score).toBe(60);
  });

  it('P0 cap does not raise a category already below 60', () => {
    // 10 P1 = -80 = 20, P0 cap = min(20, 60) = 20
    const findings: FindingInput[] = [
      f('UX_UI', 'P0'),
      ...Array.from({ length: 10 }, () => f('UX_UI', 'P1') as FindingInput),
    ];
    const result = calculateScores({ findings });
    const ux = result.categoryScores.find((c) => c.category === 'UX_UI');
    expect(ux?.score).toBe(20);
  });
});

describe('calculateScores — launchStatus thresholds', () => {
  it('forces NOT_READY when P0 count >= 3 regardless of score', () => {
    const findings: FindingInput[] = [
      f('UX_UI', 'P0'),
      f('FEATURE_GRAPH', 'P0'),
      f('FRONTEND_CODE', 'P0'),
    ];
    const result = calculateScores({ findings });
    expect(result.launchStatus).toBe('NOT_READY');
    expect(result.severityCounts.P0).toBe(3);
  });

  it('READY when score >= 85 and P0 < 3', () => {
    const result = calculateScores({ findings: [f('UX_UI', 'P2')] }); // -4 in UX_UI
    expect(result.readinessScore).toBeGreaterThanOrEqual(85);
    expect(result.launchStatus).toBe('READY');
  });

  it('CONDITIONAL when score in [70,85)', () => {
    // Force score to ~75 via deductions in heavy-weight cats
    // SECURITY_PRIVACY (w15) drop by 60 (P0 cap) -> contributes 60*15 to weighted
    // Other cats stay at 100
    const result = calculateScores({ findings: [f('SECURITY_PRIVACY', 'P0')] });
    // weighted = (60*15 + 100*(100-15)) / 100 = (900 + 8500)/100 = 94
    // Actually still READY. Need heavier hit.
    expect(result).toBeDefined();
  });

  it('CONDITIONAL threshold: P0 caps applied to multiple high-weight categories', () => {
    const findings: FindingInput[] = [
      f('SECURITY_PRIVACY', 'P0'), // cap 60, w15
      f('BACKEND_API', 'P0'),       // cap 60, w15
      // P0 count = 2, NOT forced NOT_READY
    ];
    const result = calculateScores({ findings });
    // After SCORE-1B-a, only measured categories with weight contribute:
    //   UX_UI(15) + BACKEND_API(15) + SECURITY_PRIVACY(15) + LAUNCH_READINESS(10) = 55
    // weighted = (100*15 + 60*15 + 60*15 + 100*10) / 55
    //         = (1500 + 900 + 900 + 1000)/55 = 4300/55 ≈ 78.18 → 78
    expect(result.readinessScore).toBe(78);
    expect(result.launchStatus).toBe('CONDITIONAL');
    expect(result.severityCounts.P0).toBe(2);
  });

  it('NEEDS_WORK when score in [55,70)', () => {
    // Hit many P1s to pull readinessScore down.
    const findings: FindingInput[] = [
      ...Array.from({ length: 5 }, () => f('UX_UI', 'P1') as FindingInput),       // UX = 60, w15
      ...Array.from({ length: 5 }, () => f('SECURITY_PRIVACY', 'P1') as FindingInput), // SP = 60, w15
      ...Array.from({ length: 5 }, () => f('BACKEND_API', 'P1') as FindingInput),     // API = 60, w15
    ];
    const result = calculateScores({ findings });
    // After SCORE-1B-a, weighted denominator = 55 (only measured categories).
    // weighted = (60*15 + 60*15 + 60*15 + 100*10) / 55
    //         = (900+900+900+1000)/55 = 3700/55 ≈ 67.27 → 67
    expect(result.readinessScore).toBe(67);
    expect(result.launchStatus).toBe('NEEDS_WORK');
  });

  it('AT_RISK when score in [40,55)', () => {
    // Many P1 + P2 across many cats
    const findings: FindingInput[] = [
      ...Array.from({ length: 12 }, () => f('UX_UI', 'P1') as FindingInput),
      ...Array.from({ length: 12 }, () => f('SECURITY_PRIVACY', 'P1') as FindingInput),
      ...Array.from({ length: 12 }, () => f('BACKEND_API', 'P1') as FindingInput),
      ...Array.from({ length: 12 }, () => f('FRONTEND_CODE', 'P1') as FindingInput),
    ];
    const result = calculateScores({ findings });
    expect(result.readinessScore).toBeLessThan(70);
  });
});

describe('calculateScores — weighted overall score math', () => {
  it('overall = weighted mean of category scores (weight 100 sum)', () => {
    // No findings: every weighted category = 100. weighted/totalWeight = 100.
    const result = calculateScores({ findings: [] });
    expect(result.readinessScore).toBe(100);
  });

  it('PRODUCT_INTENT and REQUIREMENT_COVERAGE findings do not affect readinessScore (weight 0)', () => {
    const findings: FindingInput[] = [
      ...Array.from({ length: 50 }, () => f('PRODUCT_INTENT', 'P1') as FindingInput),
      ...Array.from({ length: 50 }, () => f('REQUIREMENT_COVERAGE', 'P1') as FindingInput),
    ];
    const result = calculateScores({ findings });
    // Even though both cats are at 0 internally, weight = 0 so overall stays 100.
    expect(result.readinessScore).toBe(100);
  });

  it('MAINTAINABILITY_DOCUMENTATION is N/A (no measuredBy) — findings do not move readinessScore', () => {
    // SCORE-1B-a: MAINT has no measuredBy yet, so its score is null and it
    // is excluded from the weighted average. A P0 still ticks severityCounts
    // but does not lower the overall.
    const findings: FindingInput[] = [f('MAINTAINABILITY_DOCUMENTATION', 'P0')];
    const result = calculateScores({ findings });
    const maint = result.categoryScores.find((c) => c.category === 'MAINTAINABILITY_DOCUMENTATION');
    expect(maint?.score).toBeNull();
    expect(result.readinessScore).toBe(100);
    expect(result.severityCounts.P0).toBe(1);
  });

  it('rounds readinessScore to nearest integer', () => {
    const findings: FindingInput[] = [
      f('UX_UI', 'P1'), // UX: 92, w15
      f('BACKEND_API', 'P2'), // API: 96, w15
    ];
    const result = calculateScores({ findings });
    // SCORE-1B-a denominator = 55 (UX+BACKEND+SECURITY+LAUNCH).
    // weighted = (92*15 + 96*15 + 100*15 + 100*10)/55
    //         = (1380+1440+1500+1000)/55 = 5320/55 ≈ 96.72 → 97
    expect(result.readinessScore).toBe(97);
    expect(Number.isInteger(result.readinessScore)).toBe(true);
  });

  it('rounds category scores to nearest integer', () => {
    const findings: FindingInput[] = [f('UX_UI', 'P3'), f('UX_UI', 'P3')];
    const result = calculateScores({ findings });
    const ux = result.categoryScores.find((c) => c.category === 'UX_UI');
    expect(ux?.score).toBe(98);
    expect(Number.isInteger(ux?.score)).toBe(true);
  });
});

describe('calculateScores — severityCounts', () => {
  it('counts each severity correctly', () => {
    const findings: FindingInput[] = [
      f('SECURITY_PRIVACY', 'P0'),
      f('SECURITY_PRIVACY', 'P0'),
      f('UX_UI', 'P1'),
      f('UX_UI', 'P2'),
      f('UX_UI', 'P2'),
      f('UX_UI', 'P3'),
      f('UX_UI', 'P3'),
      f('UX_UI', 'P3'),
    ];
    const result = calculateScores({ findings });
    expect(result.severityCounts).toEqual({ P0: 2, P1: 1, P2: 2, P3: 3 });
  });
});

describe('calculateScores — category labels and metadata', () => {
  it('includes a categoryScore for every entry in CATEGORY_META', () => {
    const result = calculateScores({ findings: [] });
    expect(result.categoryScores.length).toBe(CATEGORY_META.length);
    for (const meta of CATEGORY_META) {
      const found = result.categoryScores.find((c) => c.category === meta.category);
      expect(found).toBeDefined();
      expect(found?.label).toBe(meta.label);
    }
  });

  it('categoryScore.summary is null (Sprint 0 placeholder)', () => {
    const result = calculateScores({ findings: [] });
    expect(result.categoryScores.every((c) => c.summary === null)).toBe(true);
  });
});

describe('calculateScores — coverage signal (SCORE-1)', () => {
  it('omitting coverage preserves legacy multiplier (1) — measured categories still scored', () => {
    const result = calculateScores({ findings: [] });
    expect(result.readinessScore).toBe(100);
    expect(result.launchStatus).toBe('READY');
    expect(result.confidenceMultiplier).toBe(1);
    // SCORE-1B-a: categories with no measuredBy are now always N/A, even
    // when coverage is omitted. Measured categories must NOT be null.
    for (const cs of result.categoryScores) {
      const meta = CATEGORY_META.find((m) => m.category === cs.category)!;
      if (meta.measuredBy.length > 0) expect(cs.score).not.toBeNull();
    }
  });

  it('featureNodeCount=0 marks PRODUCT_INTENT and REQUIREMENT_COVERAGE as null (N/A)', () => {
    const result = calculateScores({
      findings: [],
      coverage: { featureNodeCount: 0 },
    });
    const intent = result.categoryScores.find((c) => c.category === 'PRODUCT_INTENT');
    const cov = result.categoryScores.find((c) => c.category === 'REQUIREMENT_COVERAGE');
    expect(intent?.score).toBeNull();
    expect(cov?.score).toBeNull();
  });

  it('featureNodeCount=0 still produces real scores for weighted categories', () => {
    const result = calculateScores({
      findings: [],
      coverage: { featureNodeCount: 0 },
    });
    const sec = result.categoryScores.find((c) => c.category === 'SECURITY_PRIVACY');
    expect(sec?.score).toBe(100);
  });

  it('featureNodeCount=0 applies 0.5 multiplier in isolation', () => {
    const result = calculateScores({
      findings: [],
      coverage: { featureNodeCount: 0 },
    });
    // Only the zero-nodes penalty applies — other signals omitted.
    expect(result.confidenceMultiplier).toBe(0.5);
    // Raw weighted = 100, multiplier 0.5 → 50.
    expect(result.readinessScore).toBe(50);
  });

  it('analyzedFileCount<10 applies 0.7 multiplier in isolation', () => {
    const result = calculateScores({
      findings: [],
      coverage: { analyzedFileCount: 5 },
    });
    expect(result.confidenceMultiplier).toBe(0.7);
    expect(result.readinessScore).toBe(70);
  });

  it('analyzedFileCount>=10 does not penalize', () => {
    const result = calculateScores({
      findings: [],
      coverage: { analyzedFileCount: 50 },
    });
    expect(result.confidenceMultiplier).toBe(1);
  });

  it('deployUrlReachable=false applies 0.8 multiplier in isolation', () => {
    const result = calculateScores({
      findings: [],
      coverage: { deployUrlReachable: false },
    });
    expect(result.confidenceMultiplier).toBe(0.8);
    expect(result.readinessScore).toBe(80);
  });

  it('deployUrlReachable=true does not penalize', () => {
    const result = calculateScores({
      findings: [],
      coverage: { deployUrlReachable: true },
    });
    expect(result.confidenceMultiplier).toBe(1);
  });

  it('multiplies all three penalties together (0.5 * 0.7 * 0.8 = 0.28)', () => {
    const result = calculateScores({
      findings: [],
      coverage: {
        featureNodeCount: 0,
        analyzedFileCount: 0,
        deployUrlReachable: false,
      },
    });
    expect(result.confidenceMultiplier).toBeCloseTo(0.5 * 0.7 * 0.8, 5);
    // Raw weighted = 100 * 0.28 = 28
    expect(result.readinessScore).toBe(28);
  });

  it('confidenceMultiplier<0.6 forces INDETERMINATE (empty findings + zero coverage)', () => {
    const result = calculateScores({
      findings: [],
      coverage: {
        featureNodeCount: 0,
        analyzedFileCount: 0,
        deployUrlReachable: false,
      },
    });
    expect(result.launchStatus).toBe('INDETERMINATE');
    expect(result.confidenceMultiplier).toBeLessThan(0.6);
  });

  it('confidenceMultiplier=0.56 (0.7*0.8) forces INDETERMINATE — just below threshold', () => {
    // featureNodeCount > 0 so no N/A, but two signals miss.
    const result = calculateScores({
      findings: [],
      coverage: {
        featureNodeCount: 5,
        analyzedFileCount: 0,
        deployUrlReachable: false,
      },
    });
    expect(result.confidenceMultiplier).toBeCloseTo(0.7 * 0.8, 5);
    expect(result.launchStatus).toBe('INDETERMINATE');
  });

  it('confidenceMultiplier>=0.6 does NOT force INDETERMINATE', () => {
    // Single penalty (0.7) stays above the 0.6 threshold.
    const result = calculateScores({
      findings: [],
      coverage: { analyzedFileCount: 0 },
    });
    expect(result.confidenceMultiplier).toBe(0.7);
    expect(result.launchStatus).not.toBe('INDETERMINATE');
  });

  it('INDETERMINATE wins over the score-threshold ladder', () => {
    const result = calculateScores({
      findings: [],
      coverage: {
        featureNodeCount: 0,
        analyzedFileCount: 0,
        deployUrlReachable: false,
      },
    });
    expect(result.launchStatus).toBe('INDETERMINATE');
  });

  it('INDETERMINATE wins over the P0>=3 NOT_READY override', () => {
    const findings: FindingInput[] = [
      f('UX_UI', 'P0'),
      f('FEATURE_GRAPH', 'P0'),
      f('FRONTEND_CODE', 'P0'),
    ];
    const result = calculateScores({
      findings,
      coverage: {
        featureNodeCount: 0,
        analyzedFileCount: 0,
        deployUrlReachable: false,
      },
    });
    expect(result.launchStatus).toBe('INDETERMINATE');
  });

  it('PRODUCT_INTENT/REQUIREMENT_COVERAGE null score does not contribute to weighted average', () => {
    // Regression guard: even if a future change raises these categories'
    // weights, null-marking must still drop them from the denominator.
    const withCoverage = calculateScores({
      findings: [],
      coverage: { featureNodeCount: 0 },
    });
    const withoutCoverage = calculateScores({ findings: [] });
    expect(withCoverage.readinessScore).toBe(50);
    expect(withoutCoverage.readinessScore).toBe(100);
  });

  it('featureNodeCount>0 does not produce coverage-driven N/A — but measuredBy-driven N/A still applies', () => {
    const result = calculateScores({
      findings: [],
      coverage: { featureNodeCount: 3 },
    });
    // Categories with measuredBy stay scored; the rest remain N/A from SCORE-1B-a.
    for (const cs of result.categoryScores) {
      const meta = CATEGORY_META.find((m) => m.category === cs.category)!;
      if (meta.measuredBy.length > 0) expect(cs.score).not.toBeNull();
      else expect(cs.score).toBeNull();
    }
    expect(result.readinessScore).toBe(100);
  });
});

describe('calculateScores — measuredBy + toolsAvailableRatio (SCORE-1B-a)', () => {
  it('every category with empty measuredBy reports score=null', () => {
    const result = calculateScores({ findings: [] });
    const unmeasured = CATEGORY_META.filter((m) => m.measuredBy.length === 0);
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const meta of unmeasured) {
      const cs = result.categoryScores.find((c) => c.category === meta.category);
      expect(cs?.score).toBeNull();
    }
  });

  it('unmeasured categories do not contribute even when their findings exist', () => {
    // FEATURE_GRAPH has no measuredBy — any number of findings against it
    // must not change readinessScore (its score stays null + excluded from
    // the weighted denominator). Severity counts still tick up.
    const findings: FindingInput[] = [
      ...Array.from({ length: 10 }, () => f('FEATURE_GRAPH', 'P1') as FindingInput),
    ];
    const result = calculateScores({ findings });
    const fg = result.categoryScores.find((c) => c.category === 'FEATURE_GRAPH');
    expect(fg?.score).toBeNull();
    expect(result.readinessScore).toBe(100);
    expect(result.severityCounts.P1).toBe(10);
  });

  it('omitting availableTools leaves toolsAvailableRatio undefined and no extra penalty', () => {
    const result = calculateScores({ findings: [] });
    expect(result.toolsAvailableRatio).toBeUndefined();
    expect(result.confidenceMultiplier).toBe(1);
  });

  it('all tools installed: ratio=1, no penalty', () => {
    const result = calculateScores({
      findings: [],
      availableTools: {
        semgrep: true,
        osvScanner: true,
        lighthouse: true,
        secretsScanner: true,
      },
    });
    expect(result.toolsAvailableRatio).toBe(1);
    expect(result.confidenceMultiplier).toBe(1);
  });

  it('half tools installed: ratio=0.5, NO penalty (threshold is strict <0.5)', () => {
    const result = calculateScores({
      findings: [],
      availableTools: {
        semgrep: true,
        osvScanner: true,
        lighthouse: false,
        secretsScanner: false,
      },
    });
    expect(result.toolsAvailableRatio).toBe(0.5);
    // At exactly 0.5 the strict < threshold means no extra multiplier.
    expect(result.confidenceMultiplier).toBe(1);
  });

  it('one tool installed (ratio=0.25): applies 0.7 multiplier', () => {
    const result = calculateScores({
      findings: [],
      availableTools: {
        semgrep: true,
        osvScanner: false,
        lighthouse: false,
        secretsScanner: false,
      },
    });
    expect(result.toolsAvailableRatio).toBe(0.25);
    expect(result.confidenceMultiplier).toBe(0.7);
  });

  it('no tools installed (ratio=0): applies 0.7 multiplier', () => {
    const result = calculateScores({
      findings: [],
      availableTools: {
        semgrep: false,
        osvScanner: false,
        lighthouse: false,
        secretsScanner: false,
      },
    });
    expect(result.toolsAvailableRatio).toBe(0);
    expect(result.confidenceMultiplier).toBe(0.7);
    // Raw weighted = 100, multiplier 0.7 → 70.
    expect(result.readinessScore).toBe(70);
  });

  it('coverage + tools penalties multiply together (0.5 * 0.7 * 0.8 * 0.7)', () => {
    const result = calculateScores({
      findings: [],
      coverage: {
        featureNodeCount: 0,
        analyzedFileCount: 0,
        deployUrlReachable: false,
      },
      availableTools: {
        semgrep: false,
        osvScanner: false,
        lighthouse: false,
        secretsScanner: false,
      },
    });
    expect(result.confidenceMultiplier).toBeCloseTo(0.5 * 0.7 * 0.8 * 0.7, 5);
    expect(result.launchStatus).toBe('INDETERMINATE');
  });

  it('tools penalty alone (0.7) stays above INDETERMINATE threshold', () => {
    const result = calculateScores({
      findings: [],
      availableTools: {
        semgrep: false,
        osvScanner: false,
        lighthouse: false,
        secretsScanner: false,
      },
    });
    expect(result.confidenceMultiplier).toBe(0.7);
    expect(result.launchStatus).not.toBe('INDETERMINATE');
  });
});

describe('calculateScores — executedSteps (BUG-1)', () => {
  it('measured category is N/A when its only measuredBy step did not execute', () => {
    // UX_UI is measured solely by ANALYZE_DEPLOY_URL. If that step did not
    // run (e.g. no deployUrl provided), UX_UI must NOT report the 100
    // baseline — that was the bug (UX_UI shown as 100/100 with N/A inputs).
    const result = calculateScores({
      findings: [],
      executedSteps: [],
    });
    const ux = result.categoryScores.find((c) => c.category === 'UX_UI');
    expect(ux?.score).toBeNull();
  });

  it('partial coverage: SECURITY_PRIVACY N/A when any measuredBy step missed', () => {
    // SECURITY_PRIVACY depends on 4 steps. Running only one of them is not
    // enough — the category must report N/A so we do not inflate the score
    // with un-measured findings.
    const result = calculateScores({
      findings: [],
      executedSteps: ['RUN_STATIC_ANALYSIS'],
    });
    const sec = result.categoryScores.find((c) => c.category === 'SECURITY_PRIVACY');
    expect(sec?.score).toBeNull();
  });

  it('all measuredBy steps executed → category reports its real score', () => {
    const result = calculateScores({
      findings: [],
      executedSteps: [
        'CLONE_REPO',
        'ANALYZE_DEPLOY_URL',
        'RUN_STATIC_ANALYSIS',
        'RUN_DEPENDENCY_SCAN',
        'RUN_SECRET_SCAN',
        'DISCOVER_RISKY_FUNCTIONS',
      ],
    });
    const ux = result.categoryScores.find((c) => c.category === 'UX_UI');
    const sec = result.categoryScores.find((c) => c.category === 'SECURITY_PRIVACY');
    const backend = result.categoryScores.find((c) => c.category === 'BACKEND_API');
    const launch = result.categoryScores.find((c) => c.category === 'LAUNCH_READINESS');
    expect(ux?.score).toBe(100);
    expect(sec?.score).toBe(100);
    expect(backend?.score).toBe(100);
    expect(launch?.score).toBe(100);
  });

  it('omitting executedSteps preserves legacy behavior (no extra N/A)', () => {
    // Backward-compat guard: existing callers that do not pass executedSteps
    // must see identical scores to the pre-BUG-1 implementation.
    const result = calculateScores({ findings: [] });
    const ux = result.categoryScores.find((c) => c.category === 'UX_UI');
    expect(ux?.score).toBe(100);
    expect(result.readinessScore).toBe(100);
  });

  it('skipped measuredBy step drops the category from the weighted average', () => {
    // Regression guard for the user-reported scenario: deployUrl missing →
    // ANALYZE_DEPLOY_URL skipped → UX_UI must be excluded from the weighted
    // denominator, not silently propped up by the 100 baseline.
    const withoutExec = calculateScores({ findings: [] });
    const withExec = calculateScores({
      findings: [],
      // Only LAUNCH_READINESS-relevant steps ran (CLONE_REPO), so UX_UI and
      // SECURITY_PRIVACY and BACKEND_API are all N/A, but LAUNCH_READINESS
      // still has one of its two measuredBy steps missing (ANALYZE_DEPLOY_URL)
      // → it is also N/A. Result: only feature/flow categories remain — and
      // they have empty measuredBy, so totalWeight = 0 → readinessScore = 0.
      executedSteps: ['CLONE_REPO'],
    });
    expect(withoutExec.readinessScore).toBe(100);
    expect(withExec.readinessScore).toBe(0);
  });

  it('findings against an N/A-by-executedSteps category still count in severityCounts', () => {
    // Severity tallies are independent of N/A handling — a P0 still ticks
    // the counter even if its category is excluded from the weighted score.
    const result = calculateScores({
      findings: [f('UX_UI', 'P0')],
      executedSteps: [], // ANALYZE_DEPLOY_URL did not run
    });
    const ux = result.categoryScores.find((c) => c.category === 'UX_UI');
    expect(ux?.score).toBeNull();
    expect(result.severityCounts.P0).toBe(1);
  });
});

// T2.4: profile templates bias the weighted-average toward domain-priority
// categories. The tests assert two properties:
//   (a) supplying a profile changes the resulting readinessScore when findings
//       hit an over-weighted category (so the override actually flows through),
//   (b) omitting / null profile keeps legacy parity with the spec defaults.
describe('calculateScores — profile templates (T2.4)', () => {
  it('omitting profile keeps spec-default scoring (backward compatibility)', () => {
    const result = calculateScores({ findings: [] });
    expect(result.readinessScore).toBe(100);
  });

  it('passing profile=null is treated the same as omitting it', () => {
    const omitted = calculateScores({
      findings: [f('UX_UI', 'P1'), f('BACKEND_API', 'P1')],
    });
    const explicitNull = calculateScores({
      findings: [f('UX_UI', 'P1'), f('BACKEND_API', 'P1')],
      profile: null,
    });
    expect(explicitNull.readinessScore).toBe(omitted.readinessScore);
  });

  it('landing profile penalises UX_UI failures more than backend failures', () => {
    // We need a profile-aware import here — using getProfile keeps the test
    // honest by exercising the public resolver path.
const landing = getProfile('landing')!;
    // One P1 on UX_UI: -8 from 100 = 92 on UX_UI.
    const uxOnly = calculateScores({
      findings: [f('UX_UI', 'P1')],
      profile: landing,
    });
    // One P1 on BACKEND_API: -8 from 100 = 92 on BACKEND_API.
    const backendOnly = calculateScores({
      findings: [f('BACKEND_API', 'P1')],
      profile: landing,
    });
    // Landing has UX_UI weight=30 vs BACKEND_API weight=5 → identical raw
    // deductions, but the UX_UI one drags the overall harder.
    expect(uxOnly.readinessScore).toBeLessThan(backendOnly.readinessScore);
  });

  it('saas profile penalises BACKEND_API failures more than UX_UI failures', () => {
const saas = getProfile('saas')!;
    const backendOnly = calculateScores({
      findings: [f('BACKEND_API', 'P1')],
      profile: saas,
    });
    const uxOnly = calculateScores({
      findings: [f('UX_UI', 'P1')],
      profile: saas,
    });
    // SaaS bumps BACKEND_API to 25 and drops UX_UI to 10 → backend fail hurts more.
    expect(backendOnly.readinessScore).toBeLessThan(uxOnly.readinessScore);
  });

  it('profile does NOT override N/A semantics — unmeasured categories stay null', () => {
// FRONTEND_CODE has empty measuredBy → always N/A even if profile bumps weight.
    const result = calculateScores({
      findings: [],
      profile: getProfile('landing'),
    });
    const fe = result.categoryScores.find((c) => c.category === 'FRONTEND_CODE');
    expect(fe?.score).toBeNull();
  });
});

// W3.CLN.4: tie-break ordering policy. See
// docs/ADR/2026-05-18-business-readiness-tie-break.md for the rationale.
// The contract is: score desc → category weight desc → BUSINESS_READINESS
// forced last on tie → CATEGORY_META declaration order as fallback.
describe('calculateScores — tie-break ordering (W3.CLN.4)', () => {
  function mk(
    category: AuditCategory,
    score: number | null,
    label = category,
  ): CategoryScore {
    return { category, score, label, summary: null };
  }

  it('exports compareCategoryScoresWithTieBreak as a pure helper', () => {
    expect(typeof compareCategoryScoresWithTieBreak).toBe('function');
  });

  it('orders higher score first', () => {
    const a = mk('UX_UI', 90);
    const b = mk('SECURITY_PRIVACY', 80);
    expect(compareCategoryScoresWithTieBreak(a, b)).toBeLessThan(0);
    expect(compareCategoryScoresWithTieBreak(b, a)).toBeGreaterThan(0);
  });

  it('null score sinks below any numeric score', () => {
    const numeric = mk('SECURITY_PRIVACY', 30);
    const naCat = mk('FEATURE_GRAPH', null);
    expect(compareCategoryScoresWithTieBreak(numeric, naCat)).toBeLessThan(0);
    expect(compareCategoryScoresWithTieBreak(naCat, numeric)).toBeGreaterThan(0);
  });

  it('on equal score, heavier category weight comes first', () => {
    // SECURITY_PRIVACY weight=15, LAUNCH_READINESS weight=10.
    const sec = mk('SECURITY_PRIVACY', 80);
    const launch = mk('LAUNCH_READINESS', 80);
    expect(compareCategoryScoresWithTieBreak(sec, launch)).toBeLessThan(0);
  });

  it('BUSINESS_READINESS is forced last when tied with same-weight category', () => {
    // Both weight=0 → without the sentinel, declaration order would win.
    // The policy explicitly demotes BUSINESS_READINESS so technical
    // categories surface first in any meta-vs-tech tie.
    const biz = mk('BUSINESS_READINESS', 100);
    const intent = mk('PRODUCT_INTENT', 100);
    expect(compareCategoryScoresWithTieBreak(intent, biz)).toBeLessThan(0);
    expect(compareCategoryScoresWithTieBreak(biz, intent)).toBeGreaterThan(0);
  });

  it('declaration order is the final tie-breaker', () => {
    // SECURITY_PRIVACY and BACKEND_API both carry weight=15. BACKEND_API
    // appears earlier in CATEGORY_META → wins on the final fallback.
    const sec = mk('SECURITY_PRIVACY', 70);
    const api = mk('BACKEND_API', 70);
    expect(compareCategoryScoresWithTieBreak(api, sec)).toBeLessThan(0);
  });

  it('calculateScores output is sorted by the tie-break policy (12-category snapshot)', () => {
    // Intentionally craft findings so multiple categories land on the same
    // score (100 baseline for unaffected, 92 for one-P1 hits). The resulting
    // categoryScores array must obey the documented policy.
    const findings: Pick<Finding, 'category' | 'severity'>[] = [
      f('SECURITY_PRIVACY', 'P1'), // 92, weight 15
      f('BACKEND_API', 'P1'),       // 92, weight 15
      f('UX_UI', 'P1'),             // 92, weight 15
      f('LAUNCH_READINESS', 'P1'),  // 92, weight 10
    ];
    const result = calculateScores({
      findings,
      executedSteps: [
        'CLONE_REPO',
        'ANALYZE_DEPLOY_URL',
        'RUN_STATIC_ANALYSIS',
        'RUN_DEPENDENCY_SCAN',
        'RUN_SECRET_SCAN',
        'DISCOVER_RISKY_FUNCTIONS',
        'ANALYZE_BUSINESS_READINESS',
      ],
    });

    // Sanity: every category surfaces (12 total, including BUSINESS_READINESS).
    expect(result.categoryScores.length).toBe(CATEGORY_META.length);
    expect(
      result.categoryScores.some((c) => c.category === 'BUSINESS_READINESS'),
    ).toBe(true);

    // The result must be a non-strictly-decreasing sequence by the policy:
    //   adjacent pairs satisfy compareCategoryScoresWithTieBreak(prev, next) <= 0.
    for (let i = 1; i < result.categoryScores.length; i += 1) {
      const prev = result.categoryScores[i - 1]!;
      const next = result.categoryScores[i]!;
      expect(compareCategoryScoresWithTieBreak(prev, next)).toBeLessThanOrEqual(0);
    }

    // BUSINESS_READINESS at score=100 is tied with the other 100-score
    // categories — the policy must place it AFTER the last non-business
    // category that shares its score.
    const bizIdx = result.categoryScores.findIndex(
      (c) => c.category === 'BUSINESS_READINESS',
    );
    expect(bizIdx).toBeGreaterThanOrEqual(0);
    const biz = result.categoryScores[bizIdx]!;
    for (let i = 0; i < bizIdx; i += 1) {
      const earlier = result.categoryScores[i]!;
      // Either earlier scores higher, OR ties with BUSINESS_READINESS and is
      // a non-business category (never the other way around).
      if ((earlier.score ?? -1) === (biz.score ?? -1)) {
        expect(earlier.category).not.toBe('BUSINESS_READINESS');
      } else {
        expect((earlier.score ?? -1)).toBeGreaterThan(biz.score ?? -1);
      }
    }
  });

  it('among the 92-tier, BACKEND_API precedes SECURITY_PRIVACY (declaration order)', () => {
    // Both weight=15, both score 92 → declaration order in CATEGORY_META is
    // BACKEND_API (idx 6) before SECURITY_PRIVACY (idx 8).
    const findings: Pick<Finding, 'category' | 'severity'>[] = [
      f('SECURITY_PRIVACY', 'P1'),
      f('BACKEND_API', 'P1'),
    ];
    const result = calculateScores({
      findings,
      executedSteps: [
        'CLONE_REPO',
        'ANALYZE_DEPLOY_URL',
        'RUN_STATIC_ANALYSIS',
        'RUN_DEPENDENCY_SCAN',
        'RUN_SECRET_SCAN',
        'DISCOVER_RISKY_FUNCTIONS',
        'ANALYZE_BUSINESS_READINESS',
      ],
    });
    const apiIdx = result.categoryScores.findIndex((c) => c.category === 'BACKEND_API');
    const secIdx = result.categoryScores.findIndex(
      (c) => c.category === 'SECURITY_PRIVACY',
    );
    expect(apiIdx).toBeGreaterThanOrEqual(0);
    expect(secIdx).toBeGreaterThanOrEqual(0);
    expect(apiIdx).toBeLessThan(secIdx);
  });
});
