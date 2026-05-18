// L-P1-3 — renderNarrative unit tests. Sprint 4 Wave 2 Batch B.
//
// Coverage matrix:
//   - 7 LaunchStatus literals × 2 locales (ko/en) = 14 base cases.
//   - 2 edge cases: empty topConcerns (no citation), max-length boundary.
//   - Total: 16 tests as required by the L-P1-3 spec.

import { describe, expect, it } from 'vitest';
import type { Concern, FCSResult, LaunchStatus } from '@cleartoship/shared-types';
import { renderNarrative } from './render-narrative.js';

const CONCERN_A: Concern = {
  findingId: 'CC-SEC-001',
  severity: 'P0',
  confidence: 'HIGH',
  impact: 12,
  ruleFamily: 'auth/oauth-redirect',
};
const CONCERN_B: Concern = {
  findingId: 'CC-PAY-014',
  severity: 'P1',
  confidence: 'MEDIUM',
  impact: 6,
  ruleFamily: 'payment/webhook-idempotency',
};
const CONCERN_C: Concern = {
  findingId: 'CC-UX-022',
  severity: 'P1',
  confidence: 'LOW',
  impact: 3,
  ruleFamily: 'ux/cta-contrast',
};

function makeResult(over: Partial<FCSResult> = {}): FCSResult {
  return {
    score: 72,
    lower: 64,
    upper: 80,
    uncertainty: 8,
    status: 'CONDITIONAL',
    topConcerns: [CONCERN_A, CONCERN_B],
    rationale: 'placeholder rationale (one-sentence)',
    ...over,
  };
}

const ALL_STATUSES: LaunchStatus[] = [
  'READY',
  'CONDITIONAL',
  'NEEDS_WORK',
  'AT_RISK',
  'NOT_READY',
  'INDETERMINATE',
  'BLOCKED',
];

// Per-status keywords that MUST appear (locale-specific). Lets the test be
// brittle enough to catch wrong-branch dispatch without coupling to exact wording.
const KO_KEYWORDS: Record<LaunchStatus, RegExp> = {
  READY: /양호/,
  CONDITIONAL: /조건부/,
  NEEDS_WORK: /보완/,
  AT_RISK: /위험/,
  NOT_READY: /부적합/,
  INDETERMINATE: /분석 표면이 부족/,
  BLOCKED: /클론 또는 스캔/,
};
const EN_KEYWORDS: Record<LaunchStatus, RegExp> = {
  READY: /healthy shape/,
  CONDITIONAL: /caveats/,
  NEEDS_WORK: /polish/,
  AT_RISK: /risk signals/,
  NOT_READY: /not yet fit to ship/,
  INDETERMINATE: /too thin to assert/,
  BLOCKED: /aborted during clone or scan/,
};

describe('renderNarrative — KO status branches', () => {
  it.each(ALL_STATUSES)(
    'ko / %s → produces 3-sentence body with status-specific phrasing',
    (status) => {
      const out = renderNarrative({
        fcs: makeResult({ status }),
        locale: 'ko',
      });
      // 3 sentences → at least 3 period-ish terminators.
      const sentenceEndings = out.match(/[.다요세]/g) ?? [];
      expect(sentenceEndings.length).toBeGreaterThanOrEqual(3);
      expect(out).toMatch(KO_KEYWORDS[status]);
      expect(out.length).toBeLessThanOrEqual(180);
    },
  );
});

describe('renderNarrative — EN status branches', () => {
  it.each(ALL_STATUSES)(
    'en / %s → produces 3-sentence body with status-specific phrasing',
    (status) => {
      const out = renderNarrative({
        fcs: makeResult({ status }),
        locale: 'en',
      });
      // Period count ≥ 3 → exactly the 3 sentence terminators (S1/S2/S3).
      const dots = out.match(/\./g) ?? [];
      expect(dots.length).toBeGreaterThanOrEqual(3);
      expect(out).toMatch(EN_KEYWORDS[status]);
      expect(out.length).toBeLessThanOrEqual(300);
    },
  );
});

describe('renderNarrative — edge cases', () => {
  it('empty topConcerns → S2 fallback wording (no rule-family citation)', () => {
    const ko = renderNarrative({
      fcs: makeResult({ topConcerns: [] }),
      locale: 'ko',
    });
    const en = renderNarrative({
      fcs: makeResult({ topConcerns: [] }),
      locale: 'en',
    });
    expect(ko).toMatch(/핵심 우려 사항은 없습니다|식별된 핵심 우려 사항은 없/);
    expect(en).toMatch(/No top concerns/);
    // None of the rule-family slugs should leak into the empty-concerns body.
    expect(ko).not.toMatch(/auth\/oauth-redirect/);
    expect(en).not.toMatch(/auth\/oauth-redirect/);
  });

  it('respects max length (ko ≤180, en ≤300) even with 3 concerns supplied', () => {
    // Force the longest S2 path: 2 cited concerns + 1 ignored.
    const fcs = makeResult({
      topConcerns: [CONCERN_A, CONCERN_B, CONCERN_C],
      status: 'NEEDS_WORK',
    });
    const ko = renderNarrative({ fcs, locale: 'ko' });
    const en = renderNarrative({ fcs, locale: 'en' });
    expect(ko.length).toBeLessThanOrEqual(180);
    expect(en.length).toBeLessThanOrEqual(300);
    // S2 must cite only 2 ruleFamily values (third is dropped).
    expect(ko).toContain('auth/oauth-redirect');
    expect(ko).toContain('payment/webhook-idempotency');
    expect(ko).not.toContain('ux/cta-contrast');
    expect(en).toContain('auth/oauth-redirect');
    expect(en).toContain('payment/webhook-idempotency');
    expect(en).not.toContain('ux/cta-contrast');
  });
});
