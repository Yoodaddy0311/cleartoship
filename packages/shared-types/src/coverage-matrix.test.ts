// L-P0-6 — Coverage Matrix entry + ActionHint + ShipVerdict schema tests.
//
// Sibling-located on purpose: the review-gate hook only treats `<name>.test.ts`
// adjacent to `<name>.ts` as proof-of-coverage. Tests under `__tests__/` are
// fine for vitest but invisible to the gate.
//
// Tests cover the three L-P0-6 schema additions:
//   1. ActionHintSchema (text + etaMinutes literal union + optional referenceUrl
//      + `.strict()` unknown-field rejection)
//   2. ShipVerdictSchema (verdict enum + topBlockerIds cap=3 + confidence
//      + `.strict()` unknown-field rejection)
//   3. CoverageMatrixEntrySchema + CoverageEvidenceSchema discriminated union
// Plus AuditReportSchema forward-compat for the two new optional fields.

import { describe, it, expect } from 'vitest';
import {
  ActionHintSchema,
  ShipVerdictSchema,
  FindingSchema,
  AuditReportSchema,
  type Finding,
} from './domain.js';
import {
  CoverageEvidenceSchema,
  CoverageMatrixEntrySchema,
  CoverageStatusSchema,
} from './coverage-matrix.js';

const ISO = '2026-05-18T05:00:00.000Z';

function makeFinding(over: Partial<Finding> = {}): Finding {
  return {
    id: 'f-1',
    auditRunId: 'run-1',
    title: 'Sample finding',
    category: 'SECURITY_PRIVACY',
    severity: 'P1',
    confidence: 'HIGH',
    status: 'OPEN',
    summary: 'summary',
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

function baseReport(over: Record<string, unknown> = {}) {
  return {
    id: 'main' as const,
    auditRunId: 'run-1',
    readinessScore: 80,
    launchStatus: 'READY' as const,
    categoryScores: [],
    severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    executiveSummary: 'exec',
    markdown: '# report',
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// ActionHintSchema
// ---------------------------------------------------------------------------

describe('ActionHintSchema', () => {
  it.each([5, 30, 60, 240] as const)('accepts the documented etaMinutes literal %s', (eta) => {
    const parsed = ActionHintSchema.parse({
      text: 'CSP 헤더 한 줄 추가',
      etaMinutes: eta,
    });
    expect(parsed.etaMinutes).toBe(eta);
  });

  it('rejects an etaMinutes value outside the 5|30|60|240 ladder', () => {
    const result = ActionHintSchema.safeParse({ text: 'do x', etaMinutes: 15 });
    expect(result.success).toBe(false);
  });

  it('rejects text longer than 200 characters (one-line UI guarantee)', () => {
    const result = ActionHintSchema.safeParse({
      text: 'x'.repeat(201),
      etaMinutes: 5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts an optional referenceUrl when it is a valid URL', () => {
    const parsed = ActionHintSchema.parse({
      text: 'redirect_uri whitelist 적용',
      etaMinutes: 30,
      referenceUrl: 'https://example.com/docs/oauth',
    });
    expect(parsed.referenceUrl).toBe('https://example.com/docs/oauth');
  });

  it('rejects a malformed referenceUrl', () => {
    const result = ActionHintSchema.safeParse({
      text: 'do x',
      etaMinutes: 5,
      referenceUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields under .strict() (dictionary/schema drift guard)', () => {
    const result = ActionHintSchema.safeParse({
      text: 'do x',
      etaMinutes: 5,
      // Unknown key — must be rejected by `.strict()`.
      severity: 'P0',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ShipVerdictSchema
// ---------------------------------------------------------------------------

describe('ShipVerdictSchema', () => {
  it.each(['READY', 'READY_WITH_CAVEATS', 'NEEDS_WORK', 'BLOCKED'] as const)(
    'accepts verdict=%s with score / reason / confidence',
    (verdict) => {
      const parsed = ShipVerdictSchema.parse({
        verdict,
        reason: '근거 한 줄',
        score: 75,
        topBlockerIds: [],
        confidence: 'HIGH',
      });
      expect(parsed.verdict).toBe(verdict);
    },
  );

  it('rejects an unknown verdict literal', () => {
    const result = ShipVerdictSchema.safeParse({
      verdict: 'SHIP_IT',
      reason: 'r',
      score: 50,
      topBlockerIds: [],
      confidence: 'HIGH',
    });
    expect(result.success).toBe(false);
  });

  it('rejects topBlockerIds when more than 3 ids are supplied', () => {
    const result = ShipVerdictSchema.safeParse({
      verdict: 'NEEDS_WORK',
      reason: 'r',
      score: 40,
      topBlockerIds: ['f-1', 'f-2', 'f-3', 'f-4'],
      confidence: 'MEDIUM',
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 3 topBlockerIds (boundary)', () => {
    const parsed = ShipVerdictSchema.parse({
      verdict: 'NEEDS_WORK',
      reason: 'r',
      score: 40,
      topBlockerIds: ['f-1', 'f-2', 'f-3'],
      confidence: 'MEDIUM',
    });
    expect(parsed.topBlockerIds).toHaveLength(3);
  });

  it('rejects a score outside the 0..100 inclusive range', () => {
    const result = ShipVerdictSchema.safeParse({
      verdict: 'READY',
      reason: 'r',
      score: 101,
      topBlockerIds: [],
      confidence: 'HIGH',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a reason longer than 300 characters (one-paragraph UI cap)', () => {
    const result = ShipVerdictSchema.safeParse({
      verdict: 'READY',
      reason: 'x'.repeat(301),
      score: 50,
      topBlockerIds: [],
      confidence: 'HIGH',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields under .strict() (forward-drift guard)', () => {
    const result = ShipVerdictSchema.safeParse({
      verdict: 'READY',
      reason: 'r',
      score: 50,
      topBlockerIds: [],
      confidence: 'HIGH',
      // Unknown key — must be rejected by `.strict()`. Catches accidental
      // embedding of full Finding objects (legacy `topBlockers`) instead of ids.
      topBlockers: [],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CoverageMatrixEntrySchema + CoverageEvidenceSchema discriminated union
// ---------------------------------------------------------------------------

describe('CoverageStatusSchema', () => {
  it('exposes exactly the three documented statuses in spec order', () => {
    expect(CoverageStatusSchema.options).toEqual(['fulfilled', 'partial', 'unclear']);
  });
});

describe('CoverageEvidenceSchema (discriminated union)', () => {
  it('parses a file evidence variant', () => {
    const parsed = CoverageEvidenceSchema.parse({
      type: 'file',
      path: 'auth/signup.tsx',
    });
    expect(parsed).toEqual({ type: 'file', path: 'auth/signup.tsx' });
  });

  it('parses a finding evidence variant', () => {
    const parsed = CoverageEvidenceSchema.parse({
      type: 'finding',
      findingId: 'CC-SEC-006',
    });
    expect(parsed.type === 'finding' && parsed.findingId).toBe('CC-SEC-006');
  });

  it('rejects an llm evidence variant with confidence > 1', () => {
    const result = CoverageEvidenceSchema.safeParse({ type: 'llm', confidence: 1.2 });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown evidence type literal', () => {
    const result = CoverageEvidenceSchema.safeParse({ type: 'gemini', confidence: 0.9 });
    expect(result.success).toBe(false);
  });
});

describe('CoverageMatrixEntrySchema', () => {
  it('parses a fulfilled claim with single file evidence (no recommendation)', () => {
    const parsed = CoverageMatrixEntrySchema.parse({
      claim: '이메일/비밀번호 회원가입',
      status: 'fulfilled',
      evidence: [{ type: 'file', path: 'auth/signup.tsx' }],
      confidence: 'HIGH',
    });
    expect(parsed.status).toBe('fulfilled');
    expect(parsed.recommendation).toBeUndefined();
  });

  it('defaults evidence to [] when the key is omitted', () => {
    const parsed = CoverageMatrixEntrySchema.parse({
      claim: 'Stripe 월구독 결제',
      status: 'unclear',
      recommendation: '결제 통합 또는 PRD 수정',
      confidence: 'LOW',
    });
    expect(parsed.evidence).toEqual([]);
  });

  it('rejects a claim longer than 500 chars (spec cap)', () => {
    const result = CoverageMatrixEntrySchema.safeParse({
      claim: 'x'.repeat(501),
      status: 'unclear',
      confidence: 'LOW',
    });
    expect(result.success).toBe(false);
  });

  it('round-trips a partial entry with file + finding evidence', () => {
    const parsed = CoverageMatrixEntrySchema.parse({
      claim: 'Google OAuth 로그인',
      status: 'partial',
      evidence: [
        { type: 'file', path: 'auth/oauth.tsx' },
        { type: 'finding', findingId: 'CC-SEC-006' },
      ],
      recommendation: 'redirect_uri whitelist 적용',
      confidence: 'MEDIUM',
    });
    expect(parsed.evidence).toHaveLength(2);
    expect(parsed.recommendation).toContain('whitelist');
  });
});

// ---------------------------------------------------------------------------
// FindingSchema.actionHint integration + AuditReportSchema forward-compat
// ---------------------------------------------------------------------------

describe('FindingSchema.actionHint integration', () => {
  it('accepts a finding with no actionHint key (legacy doc forward-compat)', () => {
    const parsed = FindingSchema.parse(makeFinding());
    expect(parsed.actionHint).toBeUndefined();
  });

  it('round-trips a finding with an attached actionHint', () => {
    const parsed = FindingSchema.parse(
      makeFinding({
        actionHint: { text: 'redirect_uri whitelist 적용', etaMinutes: 30 },
      }),
    );
    expect(parsed.actionHint?.etaMinutes).toBe(30);
  });
});

describe('AuditReportSchema forward-compat (shipVerdict + coverageMatrix)', () => {
  it('parses a report with neither shipVerdict nor coverageMatrix (current shape)', () => {
    const parsed = AuditReportSchema.parse(baseReport());
    expect(parsed.shipVerdict).toBeUndefined();
    expect(parsed.coverageMatrix).toBeUndefined();
  });

  it('round-trips a report with shipVerdict attached', () => {
    const parsed = AuditReportSchema.parse(
      baseReport({
        shipVerdict: {
          verdict: 'READY_WITH_CAVEATS',
          reason: 'P1 finding 2건 잔존, 사용자 데이터 위협은 없음',
          score: 82,
          topBlockerIds: ['b-1'],
          confidence: 'HIGH',
        },
      }),
    );
    expect(parsed.shipVerdict?.verdict).toBe('READY_WITH_CAVEATS');
    expect(parsed.shipVerdict?.topBlockerIds).toHaveLength(1);
  });

  it('round-trips a report with coverageMatrix attached (mixed statuses)', () => {
    const parsed = AuditReportSchema.parse(
      baseReport({
        coverageMatrix: [
          {
            claim: '이메일/비밀번호 회원가입',
            status: 'fulfilled',
            evidence: [{ type: 'file', path: 'auth/signup.tsx' }],
            confidence: 'HIGH',
          },
          {
            claim: 'Stripe 결제',
            status: 'unclear',
            recommendation: '결제 통합 또는 PRD 수정',
            confidence: 'LOW',
          },
        ],
      }),
    );
    expect(parsed.coverageMatrix).toHaveLength(2);
    expect(parsed.coverageMatrix?.[0]?.status).toBe('fulfilled');
  });
});
