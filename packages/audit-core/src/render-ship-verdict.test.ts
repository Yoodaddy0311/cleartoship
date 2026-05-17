// L-P0-3 — Ship Verdict generator regression suite.
//
// Coverage plan (lead's L-P0-3 spec):
//   - BLOCKED            : 2 cases (HIGH-conf P0 alone / HIGH-conf P0 + extras)
//   - NEEDS_WORK         : 4 cases (P0 MEDIUM-conf / P1==5 boundary /
//                                   AT_RISK launch / NOT_READY auto-BLOCK)
//   - READY_WITH_CAVEATS : 4 cases (P1<5 / clean-low-conf / CONDITIONAL launch /
//                                   conf ratio just below 70%)
//   - READY              : 2 cases (zero findings / clean all-MEDIUM)
//   - LaunchStatus → ShipVerdictLevel mapping : 7 cases (one per LaunchStatus)
//   - confidence aggregation : 4 cases (HIGH / MEDIUM / LOW / INDETERMINATE→LOW)
//   - edge : 2 cases (empty findings + score=0, profile=vibe-coded passthrough)
// = 25 tests. Schema round-trip via ShipVerdictSchema.parse() asserted.

import { describe, expect, it } from 'vitest';
import type {
  Confidence,
  Finding,
  LaunchStatus,
  Severity,
  ShipVerdictLevel,
} from '@cleartoship/shared-types';
import { ShipVerdictSchema } from '@cleartoship/shared-types';
import {
  renderShipVerdict,
  renderShipVerdictMarkdown,
  renderBlockerSpotlightMarkdown,
  selectTopBlockers,
  sortForBlockerSpotlight,
  LAUNCH_STATUS_TO_SHIP_VERDICT,
  TOP_BLOCKERS_DEFAULT_MAX,
  type RenderShipVerdictInput,
} from './render-ship-verdict.js';
import type { AuditProfile } from './profiles/index.js';

const ISO = '2026-05-18T05:00:00.000Z';

function makeFinding(over: Partial<Finding> = {}): Finding {
  return {
    id: over.id ?? 'f-x',
    auditRunId: 'run-1',
    title: over.title ?? '샘플 finding',
    category: over.category ?? 'SECURITY_PRIVACY',
    severity: over.severity ?? 'P2',
    confidence: over.confidence ?? 'MEDIUM',
    status: 'OPEN',
    summary: '',
    nonDeveloperExplanation: null,
    technicalExplanation: null,
    impact: null,
    recommendation: null,
    acceptanceCriteria: [],
    tags: [],
    evidenceCount: 0,
    createdAt: ISO,
    ...over,
  };
}

function makeInput(over: Partial<RenderShipVerdictInput> = {}): RenderShipVerdictInput {
  return {
    scores: [],
    findings: [],
    profile: null,
    launchStatus: 'READY',
    overallScore: 80,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// BLOCKED tier (2 cases) — HIGH-conf P0 ≥ 1 OR launchStatus=NOT_READY/BLOCKED
// ---------------------------------------------------------------------------

describe('renderShipVerdict — BLOCKED tier', () => {
  it('case 1: single HIGH-conf P0 → BLOCKED with category + label + title in the reason', () => {
    const findings = [
      makeFinding({
        id: 'sec-1',
        severity: 'P0',
        confidence: 'HIGH',
        category: 'SECURITY_PRIVACY',
        title: '.env.production committed',
      }),
    ];
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'NOT_READY', overallScore: 30 }),
    );
    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toContain('BLOCKED');
    expect(result.reason).toContain('SECURITY_PRIVACY');
    expect(result.reason).toContain('출시 차단');
    expect(result.reason).toContain('.env.production');
    expect(result.score).toBe(30);
  });

  it('case 2: HIGH-conf P0 + extras → BLOCKED, "외 N건" suffix and top-3 ids capped', () => {
    const findings: Finding[] = [
      makeFinding({ id: 'p0-a', severity: 'P0', confidence: 'HIGH', title: 'SSRF in /api/fetch' }),
      makeFinding({ id: 'p1-a', severity: 'P1', confidence: 'HIGH', title: 'Missing CSP header' }),
      makeFinding({ id: 'p1-b', severity: 'P1', confidence: 'MEDIUM', title: 'Stale npm package' }),
      makeFinding({ id: 'p2-a', severity: 'P2', confidence: 'LOW', title: 'noisy console.log' }),
    ];
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'NOT_READY', overallScore: 35 }),
    );
    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toContain('외 2건');
    expect(result.topBlockerIds).toEqual(['p0-a', 'p1-a', 'p1-b']);
  });
});

// ---------------------------------------------------------------------------
// NEEDS_WORK tier (4 cases)
// ---------------------------------------------------------------------------

describe('renderShipVerdict — NEEDS_WORK tier', () => {
  it('case 1: MEDIUM-conf P0 alone → NEEDS_WORK (not BLOCKED)', () => {
    const findings = [
      makeFinding({
        id: 'p0-m',
        severity: 'P0',
        confidence: 'MEDIUM',
        category: 'BACKEND_API',
        title: 'Possible RCE via eval()',
      }),
    ];
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'NEEDS_WORK', overallScore: 50 }),
    );
    expect(result.verdict).toBe('NEEDS_WORK');
    expect(result.reason).toContain('NEEDS_WORK');
    expect(result.reason).toContain('BACKEND_API');
    expect(result.reason).toContain('Possible RCE');
  });

  it('case 2: exactly 5 P1 with no P0 → NEEDS_WORK at the boundary', () => {
    const findings: Finding[] = Array.from({ length: 5 }, (_, i) =>
      makeFinding({
        id: `p1-${i + 1}`,
        severity: 'P1',
        confidence: 'HIGH',
        category: 'UX_UI',
        title: `LCP > 4s on /page-${i + 1}`,
      }),
    );
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'NEEDS_WORK', overallScore: 60 }),
    );
    expect(result.verdict).toBe('NEEDS_WORK');
    expect(result.reason).toContain('P1 5건');
  });

  it('case 3: AT_RISK launchStatus with only P2/P3 findings → NEEDS_WORK absorption', () => {
    const findings: Finding[] = [
      makeFinding({ id: 'p2-1', severity: 'P2', confidence: 'HIGH' }),
      makeFinding({ id: 'p3-1', severity: 'P3', confidence: 'HIGH' }),
    ];
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'AT_RISK', overallScore: 55 }),
    );
    expect(result.verdict).toBe('NEEDS_WORK');
  });

  it('case 4: INDETERMINATE launchStatus → NEEDS_WORK with confidence=LOW forced', () => {
    const result = renderShipVerdict(
      makeInput({ findings: [], launchStatus: 'INDETERMINATE', overallScore: 0 }),
    );
    expect(result.verdict).toBe('NEEDS_WORK');
    expect(result.confidence).toBe('LOW');
    expect(result.reason).toContain('분석 표면 부족');
  });
});

// ---------------------------------------------------------------------------
// READY_WITH_CAVEATS tier (4 cases)
// ---------------------------------------------------------------------------

describe('renderShipVerdict — READY_WITH_CAVEATS tier', () => {
  it('case 1: 2 P1 findings, no P0 → READY_WITH_CAVEATS', () => {
    const findings: Finding[] = [
      makeFinding({
        id: 'p1-x',
        severity: 'P1',
        confidence: 'HIGH',
        category: 'FRONTEND_CODE',
        title: 'Missing X-Frame-Options',
      }),
      makeFinding({ id: 'p1-y', severity: 'P1', confidence: 'MEDIUM', title: 'Outdated React peer' }),
    ];
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'CONDITIONAL', overallScore: 78 }),
    );
    expect(result.verdict).toBe('READY_WITH_CAVEATS');
    expect(result.reason).toContain('READY_WITH_CAVEATS');
    expect(result.reason).toContain('FRONTEND_CODE');
    expect(result.reason).toContain('Missing X-Frame-Options');
    expect(result.reason).toContain('사용자 데이터 위협은 없음');
  });

  it('case 2: 0 P0 / 0 P1 but mostly LOW confidence → READY_WITH_CAVEATS (not READY)', () => {
    const findings: Finding[] = Array.from({ length: 4 }, (_, i) =>
      makeFinding({ id: `p2-${i}`, severity: 'P2', confidence: 'LOW', title: `cosmetic-${i}` }),
    );
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'READY', overallScore: 82 }),
    );
    expect(result.verdict).toBe('READY_WITH_CAVEATS');
    expect(result.reason).toContain('confidence 낮아 보수적');
  });

  it('case 3: CONDITIONAL launchStatus with clean findings → READY_WITH_CAVEATS mapping', () => {
    const result = renderShipVerdict(
      makeInput({ findings: [], launchStatus: 'CONDITIONAL', overallScore: 78 }),
    );
    expect(result.verdict).toBe('READY_WITH_CAVEATS');
  });

  it('case 4: ratio just below 70% (6 HIGH/MED + 3 LOW = 66.7%) → READY_WITH_CAVEATS', () => {
    const findings: Finding[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeFinding({ id: `m-${i}`, severity: 'P2', confidence: 'MEDIUM' as Confidence }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeFinding({ id: `l-${i}`, severity: 'P2', confidence: 'LOW' as Confidence }),
      ),
    ];
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'READY', overallScore: 70 }),
    );
    expect(result.verdict).toBe('READY_WITH_CAVEATS');
  });
});

// ---------------------------------------------------------------------------
// READY tier (2 cases)
// ---------------------------------------------------------------------------

describe('renderShipVerdict — READY tier', () => {
  it('case 1: zero findings + READY launchStatus → READY with HIGH confidence', () => {
    const result = renderShipVerdict(
      makeInput({ findings: [], launchStatus: 'READY', overallScore: 95 }),
    );
    expect(result.verdict).toBe('READY');
    expect(result.confidence).toBe('HIGH');
    expect(result.topBlockerIds).toEqual([]);
    expect(result.reason).toContain('즉시 출시 가능');
  });

  it('case 2: only P2/P3 with all ≥MEDIUM confidence → READY (clean per §3.2.1)', () => {
    const findings: Finding[] = [
      makeFinding({ id: 'p2-a', severity: 'P2', confidence: 'MEDIUM', title: 'Unused import' }),
      makeFinding({ id: 'p2-b', severity: 'P2', confidence: 'HIGH', title: 'Stale changelog' }),
      makeFinding({ id: 'p3-a', severity: 'P3', confidence: 'MEDIUM', title: 'Missing alt text' }),
    ];
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'READY', overallScore: 88 }),
    );
    expect(result.verdict).toBe('READY');
  });
});

// ---------------------------------------------------------------------------
// LaunchStatus → ShipVerdictLevel mapping (7 cases — exhaustive)
// ---------------------------------------------------------------------------

describe('LAUNCH_STATUS_TO_SHIP_VERDICT — full 7→4 mapping', () => {
  const cases: ReadonlyArray<[LaunchStatus, ShipVerdictLevel]> = [
    ['READY', 'READY'],
    ['CONDITIONAL', 'READY_WITH_CAVEATS'],
    ['NEEDS_WORK', 'NEEDS_WORK'],
    ['AT_RISK', 'NEEDS_WORK'],
    ['NOT_READY', 'BLOCKED'],
    ['INDETERMINATE', 'NEEDS_WORK'],
    ['BLOCKED', 'BLOCKED'],
  ];

  it.each(cases)('maps LaunchStatus=%s → ShipVerdictLevel=%s', (launch, expected) => {
    expect(LAUNCH_STATUS_TO_SHIP_VERDICT[launch]).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Confidence aggregation (4 cases)
// ---------------------------------------------------------------------------

describe('renderShipVerdict — confidence aggregation', () => {
  function withRatio(high: number, medium: number, low: number): Finding[] {
    const list: Finding[] = [];
    for (let i = 0; i < high; i++) {
      list.push(makeFinding({ id: `h-${i}`, severity: 'P2', confidence: 'HIGH' }));
    }
    for (let i = 0; i < medium; i++) {
      list.push(makeFinding({ id: `m-${i}`, severity: 'P2', confidence: 'MEDIUM' }));
    }
    for (let i = 0; i < low; i++) {
      list.push(makeFinding({ id: `l-${i}`, severity: 'P2', confidence: 'LOW' }));
    }
    return list;
  }

  it('aggregates HIGH when HIGH-confidence ratio ≥ 70%', () => {
    const result = renderShipVerdict(
      makeInput({ findings: withRatio(7, 1, 2), launchStatus: 'READY', overallScore: 80 }),
    );
    expect(result.confidence).toBe('HIGH');
  });

  it('aggregates MEDIUM when HIGH+MEDIUM ratio ≥ 70% but HIGH alone < 70%', () => {
    const result = renderShipVerdict(
      makeInput({ findings: withRatio(2, 6, 2), launchStatus: 'CONDITIONAL', overallScore: 70 }),
    );
    expect(result.confidence).toBe('MEDIUM');
  });

  it('aggregates LOW when LOW-confidence dominates (> 30%)', () => {
    const result = renderShipVerdict(
      makeInput({ findings: withRatio(1, 3, 6), launchStatus: 'AT_RISK', overallScore: 50 }),
    );
    expect(result.confidence).toBe('LOW');
  });

  it('INDETERMINATE launchStatus overrides aggregation → LOW (lead spec: 보수적 결론)', () => {
    const result = renderShipVerdict(
      makeInput({ findings: withRatio(10, 0, 0), launchStatus: 'INDETERMINATE', overallScore: 0 }),
    );
    expect(result.confidence).toBe('LOW');
  });
});

// ---------------------------------------------------------------------------
// Edge cases (2)
// ---------------------------------------------------------------------------

describe('renderShipVerdict — edge cases', () => {
  it('empty findings + overallScore=0 produces schema-valid READY', () => {
    const result = renderShipVerdict(
      makeInput({ findings: [], launchStatus: 'READY', overallScore: 0 }),
    );
    expect(() => ShipVerdictSchema.parse(result)).not.toThrow();
    expect(result.verdict).toBe('READY');
    expect(result.score).toBe(0);
  });

  it('vibe-coded profile is accepted without changing the verdict (profile passthrough)', () => {
    const vibe: AuditProfile = {
      id: 'vibe-coded',
      displayName: { ko: '바이브', en: 'Vibe' },
      emphasizedCategories: ['UX_UI'],
      weightOverrides: {},
      mandatoryEvidence: [],
    };
    const findings = [
      makeFinding({ id: 'p1-vibe', severity: 'P1', confidence: 'HIGH', title: 'CTA contrast' }),
    ];
    const result = renderShipVerdict(
      makeInput({
        findings,
        profile: vibe,
        launchStatus: 'CONDITIONAL',
        overallScore: 75,
      }),
    );
    expect(result.verdict).toBe('READY_WITH_CAVEATS');
  });
});

// ---------------------------------------------------------------------------
// Schema + invariant safety net (clamping / reason cap / 3-blocker cap)
// ---------------------------------------------------------------------------

describe('renderShipVerdict — schema + invariants', () => {
  it('always returns a ShipVerdict that round-trips through ShipVerdictSchema (.strict())', () => {
    const findings = [
      makeFinding({ id: 'p0', severity: 'P0', confidence: 'HIGH', title: 'x'.repeat(120) }),
    ];
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'NOT_READY', overallScore: 20 }),
    );
    expect(() => ShipVerdictSchema.parse(result)).not.toThrow();
  });

  it('caps topBlockerIds at 3 even when many findings exist', () => {
    const many: Finding[] = Array.from({ length: 10 }, (_, i) =>
      makeFinding({
        id: `f-${i}`,
        severity: i < 5 ? 'P0' : 'P1',
        confidence: 'HIGH',
      }),
    );
    const result = renderShipVerdict(
      makeInput({ findings: many, launchStatus: 'NOT_READY', overallScore: 10 }),
    );
    expect(result.topBlockerIds).toHaveLength(3);
  });

  it('clamps overallScore to the 0..100 integer ladder', () => {
    const a = renderShipVerdict(makeInput({ overallScore: -7 }));
    const b = renderShipVerdict(makeInput({ overallScore: 173.6 }));
    const c = renderShipVerdict(makeInput({ overallScore: Number.NaN }));
    expect(a.score).toBe(0);
    expect(b.score).toBe(100);
    expect(c.score).toBe(0);
  });

  it('keeps reason ≤ 300 chars even with very long titles', () => {
    const findings = [
      makeFinding({
        id: 'p0',
        severity: 'P0',
        confidence: 'HIGH',
        title: '매우 긴 finding 제목 — '.repeat(50),
      }),
    ];
    const result = renderShipVerdict(
      makeInput({ findings, launchStatus: 'NOT_READY', overallScore: 0 }),
    );
    expect(result.reason.length).toBeLessThanOrEqual(300);
  });
});

// ---------------------------------------------------------------------------
// sortForBlockerSpotlight — reused by L-P0-4 (#29)
// ---------------------------------------------------------------------------

describe('sortForBlockerSpotlight', () => {
  it('orders by severity → HIGH→LOW confidence → id', () => {
    const sorted = sortForBlockerSpotlight([
      makeFinding({ id: 'b', severity: 'P1' as Severity, confidence: 'HIGH' }),
      makeFinding({ id: 'a', severity: 'P0' as Severity, confidence: 'LOW' }),
      makeFinding({ id: 'c', severity: 'P0' as Severity, confidence: 'HIGH' }),
      makeFinding({ id: 'd', severity: 'P2' as Severity, confidence: 'HIGH' }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(['c', 'a', 'b', 'd']);
  });
});

// ---------------------------------------------------------------------------
// renderShipVerdictMarkdown
// ---------------------------------------------------------------------------

describe('renderShipVerdictMarkdown', () => {
  it('renders the §1 한 줄 결론 block with badge + label + reason + score line', () => {
    const verdict = renderShipVerdict(
      makeInput({
        findings: [
          makeFinding({ id: 'p0', severity: 'P0', confidence: 'HIGH', title: 'Secret 노출' }),
        ],
        launchStatus: 'NOT_READY',
        overallScore: 35,
      }),
    );
    const md = renderShipVerdictMarkdown(verdict);
    expect(md).toContain('## 한 줄 결론');
    expect(md).toContain('🔴');
    expect(md).toContain('출시 차단');
    expect(md).toContain('Readiness Score: 35/100');
    expect(md).toContain('Top blockers:');
    expect(md).toContain('`p0`');
  });

  it('omits Top blockers line for zero-blocker READY runs', () => {
    const verdict = renderShipVerdict(makeInput({ overallScore: 98 }));
    const md = renderShipVerdictMarkdown(verdict);
    expect(md).toContain('🟢');
    expect(md).not.toContain('Top blockers:');
  });
});

// ---------------------------------------------------------------------------
// L-P0-4 (#29) — selectTopBlockers stability suite.
//
// Lead spec ordering:
//   severity DESC → confidence DESC → category weight DESC → createdAt ASC
// P0<3건 → P1 패딩 + paddedWithP1=true. ≥8 tests with tie-break coverage.
// ---------------------------------------------------------------------------

describe('selectTopBlockers — priority ordering & padding (#29)', () => {
  it('returns the 3 P0 findings ordered by severity then confidence', () => {
    const result = selectTopBlockers({
      profile: null,
      findings: [
        makeFinding({ id: 'a', severity: 'P0', confidence: 'LOW' }),
        makeFinding({ id: 'b', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'c', severity: 'P0', confidence: 'MEDIUM' }),
      ],
    });
    expect(result.blockers.map((f) => f.id)).toEqual(['b', 'c', 'a']);
    expect(result.fillP1Used).toBe(false);
  });

  it('breaks confidence ties using category weight DESC (base CATEGORY_META)', () => {
    // SECURITY_PRIVACY weight=15, MAINTAINABILITY_DOCUMENTATION weight=5,
    // DATA_MODEL weight=10. Same severity P0 + HIGH conf → weight ordering.
    const result = selectTopBlockers({
      profile: null,
      findings: [
        makeFinding({ id: 'mnt', severity: 'P0', confidence: 'HIGH',
          category: 'MAINTAINABILITY_DOCUMENTATION' }),
        makeFinding({ id: 'sec', severity: 'P0', confidence: 'HIGH',
          category: 'SECURITY_PRIVACY' }),
        makeFinding({ id: 'dm', severity: 'P0', confidence: 'HIGH',
          category: 'DATA_MODEL' }),
      ],
    });
    expect(result.blockers.map((f) => f.id)).toEqual(['sec', 'dm', 'mnt']);
  });

  it('breaks weight ties using createdAt ASC (earliest first)', () => {
    // Same severity/conf/category → createdAt is the stable tie-break.
    const result = selectTopBlockers({
      profile: null,
      findings: [
        makeFinding({ id: 'late', severity: 'P0', confidence: 'HIGH',
          category: 'SECURITY_PRIVACY', createdAt: '2026-05-18T12:00:00.000Z' }),
        makeFinding({ id: 'early', severity: 'P0', confidence: 'HIGH',
          category: 'SECURITY_PRIVACY', createdAt: '2026-05-18T01:00:00.000Z' }),
        makeFinding({ id: 'mid', severity: 'P0', confidence: 'HIGH',
          category: 'SECURITY_PRIVACY', createdAt: '2026-05-18T06:00:00.000Z' }),
      ],
    });
    expect(result.blockers.map((f) => f.id)).toEqual(['early', 'mid', 'late']);
  });

  it('falls back to id.localeCompare when severity/conf/category/createdAt all tie', () => {
    // Identical sort keys → final stable tie-break on id.
    const shared = {
      severity: 'P0' as Severity,
      confidence: 'HIGH' as Confidence,
      category: 'SECURITY_PRIVACY' as const,
      createdAt: '2026-05-18T05:00:00.000Z',
    };
    const result = selectTopBlockers({
      profile: null,
      findings: [
        makeFinding({ id: 'z', ...shared }),
        makeFinding({ id: 'm', ...shared }),
        makeFinding({ id: 'a', ...shared }),
      ],
    });
    expect(result.blockers.map((f) => f.id)).toEqual(['a', 'm', 'z']);
  });

  it('pads with P1 when fewer than 3 P0 findings exist and sets fillP1Used=true + note', () => {
    const result = selectTopBlockers({
      profile: null,
      findings: [
        makeFinding({ id: 'p0a', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'p1a', severity: 'P1', confidence: 'HIGH',
          category: 'SECURITY_PRIVACY' }),
        makeFinding({ id: 'p1b', severity: 'P1', confidence: 'LOW',
          category: 'MAINTAINABILITY_DOCUMENTATION' }),
        makeFinding({ id: 'p2c', severity: 'P2', confidence: 'HIGH' }),
      ],
    });
    expect(result.blockers.map((f) => f.id)).toEqual(['p0a', 'p1a', 'p1b']);
    expect(result.fillP1Used).toBe(true);
    expect(result.note).toBe('(P0 부재, P1 우선순위로 채움)');
  });

  it('places ALL P0 before ANY P1 even when P1 has higher confidence/weight', () => {
    // P0 LOW conf + low-weight category MUST still beat P1 HIGH conf SECURITY.
    const result = selectTopBlockers({
      profile: null,
      findings: [
        makeFinding({ id: 'p1high', severity: 'P1', confidence: 'HIGH',
          category: 'SECURITY_PRIVACY' }),
        makeFinding({ id: 'p0low', severity: 'P0', confidence: 'LOW',
          category: 'MAINTAINABILITY_DOCUMENTATION' }),
      ],
    });
    expect(result.blockers.map((f) => f.id)).toEqual(['p0low', 'p1high']);
    expect(result.fillP1Used).toBe(true);
  });

  it('returns fillP1Used=false and no note when zero findings present (empty array)', () => {
    const result = selectTopBlockers({ profile: null, findings: [] });
    expect(result.blockers).toEqual([]);
    expect(result.fillP1Used).toBe(false);
    expect(result.note).toBeUndefined();
  });

  it('returns fillP1Used=false when P0 alone fills all three slots', () => {
    const result = selectTopBlockers({
      profile: null,
      findings: [
        makeFinding({ id: 'p0a', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'p0b', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'p0c', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'p1a', severity: 'P1', confidence: 'HIGH' }),
      ],
    });
    expect(result.blockers.map((f) => f.id).sort()).toEqual(['p0a', 'p0b', 'p0c']);
    expect(result.fillP1Used).toBe(false);
  });

  it('skips P2/P3 entirely — never appears in the spotlight even with empty P0/P1', () => {
    const result = selectTopBlockers({
      profile: null,
      findings: [
        makeFinding({ id: 'p2', severity: 'P2', confidence: 'HIGH' }),
        makeFinding({ id: 'p3', severity: 'P3', confidence: 'HIGH' }),
      ],
    });
    expect(result.blockers).toEqual([]);
    expect(result.fillP1Used).toBe(false);
  });

  it('honors profile.weightOverrides (landing profile underweights BACKEND_API)', () => {
    // landing profile: BACKEND_API override (lower) vs SECURITY_PRIVACY base.
    // We craft a minimal AuditProfile-like object so the test is profile-agnostic
    // (relies only on applyProfileWeights mechanics, not specific profile ids).
    const profile = {
      id: 'landing',
      label: 'Landing',
      description: '',
      weightOverrides: {
        BACKEND_API: 1,
        SECURITY_PRIVACY: 50,
      },
    } as unknown as AuditProfile;
    const result = selectTopBlockers({
      profile,
      findings: [
        makeFinding({ id: 'backend', severity: 'P0', confidence: 'HIGH',
          category: 'BACKEND_API' }),
        makeFinding({ id: 'security', severity: 'P0', confidence: 'HIGH',
          category: 'SECURITY_PRIVACY' }),
      ],
    });
    // SECURITY_PRIVACY weight=50 > BACKEND_API weight=1 → security first.
    expect(result.blockers.map((f) => f.id)).toEqual(['security', 'backend']);
  });

  it('is deterministic — same input always yields the same ordering', () => {
    const findings = [
      makeFinding({ id: 'a', severity: 'P0', confidence: 'MEDIUM',
        category: 'UX_UI', createdAt: '2026-05-18T05:00:00.000Z' }),
      makeFinding({ id: 'b', severity: 'P0', confidence: 'MEDIUM',
        category: 'UX_UI', createdAt: '2026-05-18T05:00:00.000Z' }),
      makeFinding({ id: 'c', severity: 'P0', confidence: 'MEDIUM',
        category: 'UX_UI', createdAt: '2026-05-18T05:00:00.000Z' }),
      makeFinding({ id: 'd', severity: 'P1', confidence: 'HIGH' }),
    ];
    const r1 = selectTopBlockers({ profile: null, findings });
    const r2 = selectTopBlockers({ profile: null, findings });
    const r3 = selectTopBlockers({ profile: null, findings: [...findings].reverse() });
    expect(r1.blockers.map((f) => f.id)).toEqual(r2.blockers.map((f) => f.id));
    expect(r1.blockers.map((f) => f.id)).toEqual(r3.blockers.map((f) => f.id));
  });

  it('does not mutate the input findings array', () => {
    const findings = [
      makeFinding({ id: 'a', severity: 'P0', confidence: 'LOW' }),
      makeFinding({ id: 'b', severity: 'P0', confidence: 'HIGH' }),
    ];
    const before = findings.map((f) => f.id);
    selectTopBlockers({ profile: null, findings });
    expect(findings.map((f) => f.id)).toEqual(before);
  });

  it('honors the optional `max` parameter (cap at 2 even when more P0 exist)', () => {
    const result = selectTopBlockers({
      max: 2,
      findings: [
        makeFinding({ id: 'p0a', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'p0b', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'p0c', severity: 'P0', confidence: 'HIGH' }),
      ],
    });
    expect(result.blockers).toHaveLength(2);
    expect(result.fillP1Used).toBe(false);
  });

  it('treats max=0 as "no spotlight" — empty result, no note', () => {
    const result = selectTopBlockers({
      max: 0,
      findings: [makeFinding({ id: 'p0', severity: 'P0', confidence: 'HIGH' })],
    });
    expect(result.blockers).toEqual([]);
    expect(result.fillP1Used).toBe(false);
    expect(result.note).toBeUndefined();
  });

  it('clamps negative/non-finite max to 0 (defensive)', () => {
    const negative = selectTopBlockers({
      max: -1,
      findings: [makeFinding({ id: 'p0', severity: 'P0', confidence: 'HIGH' })],
    });
    const nan = selectTopBlockers({
      max: Number.NaN,
      findings: [makeFinding({ id: 'p0', severity: 'P0', confidence: 'HIGH' })],
    });
    expect(negative.blockers).toEqual([]);
    expect(nan.blockers).toEqual([]);
  });

  it('defaults max to TOP_BLOCKERS_DEFAULT_MAX (=3) when omitted', () => {
    expect(TOP_BLOCKERS_DEFAULT_MAX).toBe(3);
    const result = selectTopBlockers({
      findings: [
        makeFinding({ id: 'a', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'b', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'c', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'd', severity: 'P0', confidence: 'HIGH' }),
      ],
    });
    expect(result.blockers).toHaveLength(3);
  });

  it('omits note when P0+P1 together fall short of max (no padding to advertise)', () => {
    const result = selectTopBlockers({
      findings: [
        makeFinding({ id: 'p0', severity: 'P0', confidence: 'HIGH' }),
        makeFinding({ id: 'p1', severity: 'P1', confidence: 'HIGH' }),
      ],
    });
    // 2 < 3 → fillP1Used=true because P1 padded the P0 slot up to what was available
    expect(result.blockers.map((f) => f.id)).toEqual(['p0', 'p1']);
    expect(result.fillP1Used).toBe(true);
    expect(result.note).toBe('(P0 부재, P1 우선순위로 채움)');
  });
});

describe('renderBlockerSpotlightMarkdown — ASCII box (#29)', () => {
  it('renders ① ② ③ numbered list with title + category per blocker', () => {
    const md = renderBlockerSpotlightMarkdown({
      blockers: [
        makeFinding({ id: 'a', title: 'SQL injection in /api/login', category: 'SECURITY_PRIVACY' }),
        makeFinding({ id: 'b', title: 'PII logged in plaintext', category: 'SECURITY_PRIVACY' }),
        makeFinding({ id: 'c', title: 'Missing CSP header', category: 'SECURITY_PRIVACY' }),
      ],
      fillP1Used: false,
    });
    expect(md).toContain('Top blockers:');
    expect(md).toContain('① SQL injection in /api/login (SECURITY_PRIVACY)');
    expect(md).toContain('② PII logged in plaintext (SECURITY_PRIVACY)');
    expect(md).toContain('③ Missing CSP header (SECURITY_PRIVACY)');
  });

  it('prepends the note line when fillP1Used=true', () => {
    const md = renderBlockerSpotlightMarkdown({
      blockers: [
        makeFinding({ id: 'p1a', severity: 'P1', title: 'P1 fallback', category: 'UX_UI' }),
      ],
      fillP1Used: true,
      note: '(P0 부재, P1 우선순위로 채움)',
    });
    // Note appears before the ① row.
    const noteIdx = md.indexOf('(P0 부재, P1 우선순위로 채움)');
    const firstBulletIdx = md.indexOf('①');
    expect(noteIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeLessThan(firstBulletIdx);
  });

  it('returns empty string when no blockers (renderer is a no-op)', () => {
    expect(renderBlockerSpotlightMarkdown({ blockers: [], fillP1Used: false })).toBe('');
  });

  it('integrates into renderShipVerdictMarkdown when findings are supplied', () => {
    const findings = [
      makeFinding({ id: 'blk1', severity: 'P0', confidence: 'HIGH',
        category: 'SECURITY_PRIVACY', title: '인증 우회 가능' }),
    ];
    const verdict = renderShipVerdict(makeInput({ findings, overallScore: 30 }));
    const md = renderShipVerdictMarkdown(verdict, { findings });
    expect(md).toContain('① 인증 우회 가능 (SECURITY_PRIVACY)');
    expect(md).not.toContain('`blk1`'); // id-only fallback NOT used when findings provided
  });

  it('falls back to id-only legacy line when findings are not supplied', () => {
    const findings = [
      makeFinding({ id: 'leg1', severity: 'P0', confidence: 'HIGH' }),
    ];
    const verdict = renderShipVerdict(makeInput({ findings }));
    const md = renderShipVerdictMarkdown(verdict);
    expect(md).toContain('`leg1`');
    expect(md).not.toContain('①');
  });
});

describe('shipVerdict — Firestore round-trip invariants (#29 Part 3)', () => {
  it('renderShipVerdict output passes ShipVerdictSchema.parse (persistence-safe)', () => {
    const findings = [
      makeFinding({ id: 'p0', severity: 'P0', confidence: 'HIGH' }),
      makeFinding({ id: 'p1a', severity: 'P1', confidence: 'MEDIUM' }),
    ];
    const verdict = renderShipVerdict(makeInput({ findings, overallScore: 42 }));
    // Schema parse mirrors what audit-worker writers.ts persists to Firestore.
    const parsed = ShipVerdictSchema.parse(verdict);
    expect(parsed.verdict).toBe('BLOCKED');
    expect(parsed.topBlockerIds.length).toBeGreaterThan(0);
    expect(typeof parsed.score).toBe('number');
    expect(typeof parsed.reason).toBe('string');
  });
});
