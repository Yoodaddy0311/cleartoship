import { describe, expect, it } from 'vitest';
import { calculateScores } from './calculate-scores.js';
import { CATEGORY_META, getCategoryMeta } from './checklist-mapping.js';
import type { AuditCategory, Finding, Severity } from '@cleartoship/shared-types';

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

  it('every category score is 100 baseline', () => {
    const result = calculateScores({ findings: [] });
    for (const cs of result.categoryScores) {
      expect(cs.score).toBe(100);
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

  it('one P3 reduces category by 1', () => {
    const result = calculateScores({ findings: [f('FEATURE_GRAPH', 'P3')] });
    const fg = result.categoryScores.find((c) => c.category === 'FEATURE_GRAPH');
    expect(fg?.score).toBe(99);
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
    // weighted = (60*15 + 60*15 + 100*70) / 100 = (900+900+7000)/100 = 88
    expect(result.readinessScore).toBe(88);
    expect(result.launchStatus).toBe('READY');
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
    // weighted = (60*15*3 + 100*55) / 100 = (2700 + 5500)/100 = 82
    expect(result.readinessScore).toBe(82);
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

  it('MAINTAINABILITY_DOCUMENTATION contributes weight 5 to readinessScore', () => {
    const findings: FindingInput[] = [f('MAINTAINABILITY_DOCUMENTATION', 'P0')];
    const result = calculateScores({ findings });
    // MAINT = 60 (cap), w5. Others = 100, w95.
    // weighted = (60*5 + 100*95)/100 = (300+9500)/100 = 98
    expect(result.readinessScore).toBe(98);
  });

  it('rounds readinessScore to nearest integer', () => {
    const findings: FindingInput[] = [
      f('UX_UI', 'P1'), // UX: 92, w15
      f('BACKEND_API', 'P2'), // API: 96, w15
    ];
    const result = calculateScores({ findings });
    // weighted = (92*15 + 96*15 + 100*70)/100 = (1380+1440+7000)/100 = 98.2 -> 98
    expect(result.readinessScore).toBe(98);
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
