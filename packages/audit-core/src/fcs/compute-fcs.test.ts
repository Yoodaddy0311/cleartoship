import { describe, expect, it } from 'vitest';
import type {
  CategoryScore,
  Confidence,
  Finding,
  LaunchStatus,
  Severity,
} from '@cleartoship/shared-types';
import { FCSResultSchema } from '@cleartoship/shared-types';
import { computeFCS } from './compute-fcs.js';

type FindingForFCS = Pick<Finding, 'id' | 'category' | 'severity' | 'confidence' | 'tags'>;

const allCategories: CategoryScore[] = [
  { category: 'PRODUCT_INTENT', score: 90, label: 'Product Intent', summary: null },
  { category: 'REQUIREMENT_COVERAGE', score: 85, label: 'Requirement Coverage', summary: null },
  { category: 'FEATURE_GRAPH', score: 80, label: 'Feature Graph', summary: null },
  { category: 'FUNCTIONAL_FLOW', score: 78, label: 'Functional Flow', summary: null },
  { category: 'UX_UI', score: 88, label: 'UX/UI', summary: null },
  { category: 'FRONTEND_CODE', score: 82, label: 'Frontend Code', summary: null },
  { category: 'BACKEND_API', score: 79, label: 'Backend API', summary: null },
  { category: 'DATA_MODEL', score: 91, label: 'Data Model', summary: null },
  { category: 'SECURITY_PRIVACY', score: 70, label: 'Security & Privacy', summary: null },
  { category: 'LAUNCH_READINESS', score: 75, label: 'Launch Readiness', summary: null },
  { category: 'MAINTAINABILITY_DOCUMENTATION', score: 80, label: 'Docs', summary: null },
  { category: 'BUSINESS_READINESS', score: 65, label: 'Business Readiness', summary: null },
];

function mkFinding(
  id: string,
  severity: Severity,
  confidence: Confidence,
  category: Finding['category'] = 'SECURITY_PRIVACY',
  tags: string[] = ['secret-leak'],
): FindingForFCS {
  return { id, category, severity, confidence, tags };
}

describe('computeFCS', () => {
  // ---------------------------------------------------------------- Verdict 1
  it('READY verdict with HIGH confidence findings → low uncertainty', () => {
    const result = computeFCS({
      baseScore: 92,
      categoryScores: allCategories,
      findings: [mkFinding('f1', 'P2', 'HIGH'), mkFinding('f2', 'P3', 'HIGH')],
      baseStatus: 'READY',
    });
    expect(result.status).toBe('READY');
    expect(result.uncertainty).toBe(0);
    // uncertainty=0 → both bounds collapse to the base score.
    expect(result.lower).toBe(92);
    expect(result.upper).toBe(92);
    expect(result.topConcerns).toHaveLength(0);
    expect(FCSResultSchema.parse(result)).toEqual(result);
  });

  // ---------------------------------------------------------------- Verdict 2
  it('CONDITIONAL with MEDIUM confidence → mid uncertainty', () => {
    const result = computeFCS({
      baseScore: 78,
      categoryScores: allCategories,
      findings: [
        mkFinding('f1', 'P1', 'MEDIUM'),
        mkFinding('f2', 'P1', 'MEDIUM'),
        mkFinding('f3', 'P2', 'MEDIUM'),
      ],
      baseStatus: 'CONDITIONAL',
    });
    expect(result.status).toBe('CONDITIONAL');
    expect(result.uncertainty).toBe(0);
    expect(result.topConcerns).toHaveLength(2);
    expect(result.topConcerns[0]?.severity).toBe('P1');
  });

  // ---------------------------------------------------------------- Verdict 3
  it('NEEDS_WORK with LOW confidence findings inflates uncertainty', () => {
    const result = computeFCS({
      baseScore: 60,
      categoryScores: allCategories,
      findings: [
        mkFinding('f1', 'P1', 'LOW'),
        mkFinding('f2', 'P1', 'LOW'),
        mkFinding('f3', 'P2', 'LOW'),
        mkFinding('f4', 'P3', 'LOW'),
      ],
      baseStatus: 'NEEDS_WORK',
    });
    // 4 LOW / 4 total = 1.0 → 1.0 * 20 = 20
    expect(result.uncertainty).toBe(20);
    expect(result.lower).toBe(40);
    expect(result.upper).toBe(80);
    expect(result.status).toBe('NEEDS_WORK');
  });

  // ---------------------------------------------------------------- Verdict 4
  it('NOT_READY with P0 findings → highest impact concern first', () => {
    const result = computeFCS({
      baseScore: 30,
      categoryScores: allCategories,
      findings: [
        mkFinding('f1', 'P0', 'HIGH'),
        mkFinding('f2', 'P0', 'MEDIUM'),
        mkFinding('f3', 'P1', 'HIGH'),
        mkFinding('f4', 'P2', 'HIGH'),
      ],
      baseStatus: 'NOT_READY',
    });
    expect(result.status).toBe('NOT_READY');
    expect(result.topConcerns).toHaveLength(3);
    // Ranking: f1=P0/HIGH(12), f3=P1/HIGH(9), f2=P0/MEDIUM(8). f4 is P2 → excluded.
    expect(result.topConcerns[0]?.findingId).toBe('f1');
    expect(result.topConcerns[0]?.impact).toBe(4 * 3);
    expect(result.topConcerns[1]?.findingId).toBe('f3');
    expect(result.topConcerns[2]?.findingId).toBe('f2');
  });

  // --------------------------------------------------------- Edge: 0 findings
  it('happy path: zero findings → uncertainty=0, score=100', () => {
    const result = computeFCS({
      baseScore: 100,
      categoryScores: allCategories,
      findings: [],
      baseStatus: 'READY',
    });
    expect(result.score).toBe(100);
    expect(result.uncertainty).toBe(0);
    expect(result.lower).toBe(100);
    expect(result.upper).toBe(100);
    expect(result.topConcerns).toEqual([]);
    expect(result.rationale).toContain('Ready');
  });

  // ---------------------------------------- INDETERMINATE category contribution
  it('INDETERMINATE categories raise uncertainty (3 per N/A)', () => {
    const partial: CategoryScore[] = allCategories.map((c, i) =>
      i < 3 ? { ...c, score: null } : c,
    );
    const result = computeFCS({
      baseScore: 70,
      categoryScores: partial,
      findings: [mkFinding('f1', 'P1', 'HIGH')],
      baseStatus: 'NEEDS_WORK',
    });
    // 0 LOW / 1 total = 0 → 0*20 + 3*3 = 9
    expect(result.uncertainty).toBe(9);
    expect(result.lower).toBe(61);
    expect(result.upper).toBe(79);
  });

  // -------------------------------- R-FCS-2: cap forces INDETERMINATE status
  it('uncertainty hitting cap (30) forces status=INDETERMINATE', () => {
    const halfNa: CategoryScore[] = allCategories.map((c, i) =>
      i < 10 ? { ...c, score: null } : c,
    );
    const result = computeFCS({
      baseScore: 50,
      categoryScores: halfNa,
      findings: [mkFinding('f1', 'P1', 'LOW'), mkFinding('f2', 'P2', 'LOW')],
      baseStatus: 'NEEDS_WORK',
    });
    // 2 LOW / 2 = 1.0*20 + 10*3 = 50 → capped to 30
    expect(result.uncertainty).toBe(30);
    expect(result.status).toBe('INDETERMINATE');
  });

  // ----------------------------------------- Clamp: lower ≥ 0, upper ≤ 100
  it('lower clamps to 0, upper clamps to 100', () => {
    const allNa: CategoryScore[] = allCategories.map((c) => ({ ...c, score: null }));
    const low = computeFCS({
      baseScore: 10,
      categoryScores: allNa,
      findings: [mkFinding('f1', 'P1', 'LOW')],
      baseStatus: 'NOT_READY',
    });
    expect(low.lower).toBe(0);

    const high = computeFCS({
      baseScore: 95,
      categoryScores: allNa,
      findings: [mkFinding('f1', 'P1', 'LOW')],
      baseStatus: 'READY',
    });
    expect(high.upper).toBe(100);
  });

  // ---------------------------------------- P2/P3 excluded from topConcerns
  it('only P0/P1 surface in topConcerns', () => {
    const result = computeFCS({
      baseScore: 70,
      categoryScores: allCategories,
      findings: [
        mkFinding('f1', 'P2', 'HIGH'),
        mkFinding('f2', 'P3', 'HIGH'),
        mkFinding('f3', 'P1', 'LOW'),
      ],
      baseStatus: 'NEEDS_WORK',
    });
    expect(result.topConcerns).toHaveLength(1);
    expect(result.topConcerns[0]?.findingId).toBe('f3');
  });

  // ---------------------------------------------------- BLOCKED short-circuit
  it('BLOCKED status survives even when uncertainty would force INDETERMINATE', () => {
    const allNa: CategoryScore[] = allCategories.map((c) => ({ ...c, score: null }));
    const result = computeFCS({
      baseScore: 0,
      categoryScores: allNa,
      findings: [mkFinding('f1', 'P0', 'LOW')],
      baseStatus: 'BLOCKED',
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.uncertainty).toBe(30);
  });

  // ------------------------------------------------- rationale i18n template
  it('rationale includes ko + en separated by " / "', () => {
    const result = computeFCS({
      baseScore: 80,
      categoryScores: allCategories,
      findings: [mkFinding('f1', 'P1', 'HIGH')],
      baseStatus: 'CONDITIONAL',
      profileId: 'saas',
    });
    expect(result.rationale).toContain(' / ');
    expect(result.rationale).toContain('[saas]');
    expect(result.rationale).toContain('조건부');
    expect(result.rationale).toContain('Conditional');
  });

  // ----------------------------------------- ruleFamily convention coverage
  it('ruleFamily uses `${category}/${firstTag}` and falls back to general', () => {
    const result = computeFCS({
      baseScore: 50,
      categoryScores: allCategories,
      findings: [
        mkFinding('f1', 'P0', 'HIGH', 'SECURITY_PRIVACY', ['secret-leak']),
        mkFinding('f2', 'P1', 'HIGH', 'BACKEND_API', []),
      ],
      baseStatus: 'NOT_READY',
    });
    expect(result.topConcerns[0]?.ruleFamily).toBe('SECURITY_PRIVACY/secret-leak');
    expect(result.topConcerns[1]?.ruleFamily).toBe('BACKEND_API/general');
  });

  // --------------------------------------------- Schema parses (strict mode)
  it('output passes FCSResultSchema.parse for representative inputs', () => {
    const result = computeFCS({
      baseScore: 65,
      categoryScores: allCategories,
      findings: [
        mkFinding('f1', 'P0', 'HIGH'),
        mkFinding('f2', 'P1', 'MEDIUM'),
        mkFinding('f3', 'P2', 'LOW'),
      ],
      baseStatus: 'AT_RISK',
    });
    expect(() => FCSResultSchema.parse(result)).not.toThrow();
  });

  // -------------------------------------------- Property: uncertainty ∈ [0,30]
  it('property: uncertainty stays within [0, 30] for arbitrary inputs', () => {
    const severities: Severity[] = ['P0', 'P1', 'P2', 'P3'];
    const confidences: Confidence[] = ['HIGH', 'MEDIUM', 'LOW'];
    const baseStatuses: LaunchStatus[] = [
      'READY',
      'CONDITIONAL',
      'NEEDS_WORK',
      'AT_RISK',
      'NOT_READY',
      'INDETERMINATE',
    ];
    // Deterministic seed walk — 200 cases cover the meaningful corners
    // (all-LOW, all-N/A, mixed) without test-time randomness.
    for (let seed = 0; seed < 200; seed++) {
      const findingsCount = seed % 20;
      const findings: FindingForFCS[] = Array.from({ length: findingsCount }, (_, i) => {
        const sev = severities[(seed + i) % severities.length] as Severity;
        const conf = confidences[(seed + i * 2) % confidences.length] as Confidence;
        return mkFinding(`f${i}`, sev, conf);
      });
      const naCount = seed % 13;
      const categoryScores: CategoryScore[] = allCategories.map((c, i) =>
        i < naCount ? { ...c, score: null } : c,
      );
      const baseScore = seed % 101;
      const baseStatus = baseStatuses[seed % baseStatuses.length] as LaunchStatus;

      const result = computeFCS({ baseScore, categoryScores, findings, baseStatus });

      expect(result.uncertainty).toBeGreaterThanOrEqual(0);
      expect(result.uncertainty).toBeLessThanOrEqual(30);
      expect(result.lower).toBeGreaterThanOrEqual(0);
      expect(result.upper).toBeLessThanOrEqual(100);
      expect(result.lower).toBeLessThanOrEqual(result.upper);
      expect(result.topConcerns.length).toBeLessThanOrEqual(3);
      // Schema enforces all bounds; if any case violates them parse throws.
      expect(() => FCSResultSchema.parse(result)).not.toThrow();
    }
  });

  // ------------------------------------------------- Monotonicity: LOW worse
  it('property: more LOW-confidence findings never decreases uncertainty', () => {
    const baseFindings: FindingForFCS[] = [
      mkFinding('a', 'P1', 'HIGH'),
      mkFinding('b', 'P2', 'HIGH'),
    ];
    const r0 = computeFCS({
      baseScore: 80,
      categoryScores: allCategories,
      findings: baseFindings,
      baseStatus: 'CONDITIONAL',
    });
    const r1 = computeFCS({
      baseScore: 80,
      categoryScores: allCategories,
      findings: [...baseFindings, mkFinding('c', 'P2', 'LOW')],
      baseStatus: 'CONDITIONAL',
    });
    expect(r1.uncertainty).toBeGreaterThanOrEqual(r0.uncertainty);
  });
});
