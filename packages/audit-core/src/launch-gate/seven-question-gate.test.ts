import { describe, it, expect } from 'vitest';
import {
  evaluateLaunchGate,
  LAUNCH_GATE_PASS_THRESHOLD,
  type LaunchGateEvidence,
} from './seven-question-gate.js';
import type { LaunchQuestionId } from '@cleartoship/shared-types';

/** All-passing evidence; override per test to exercise one failure path. */
function fullPass(overrides: Partial<LaunchGateEvidence> = {}): LaunchGateEvidence {
  return {
    hasReadme: true,
    hasLicense: true,
    hasCiConfig: true,
    hasTests: true,
    p0Count: 0,
    deployUrlReachable: true,
    uxScore: 90,
    securityScore: 90,
    businessScore: 90,
    ...overrides,
  };
}

function answerOf(result: ReturnType<typeof evaluateLaunchGate>, id: LaunchQuestionId) {
  return result.questions.find((q) => q.id === id)!.answer;
}

describe('evaluateLaunchGate — structure', () => {
  it('returns exactly 7 questions in Q1..Q7 order', () => {
    const r = evaluateLaunchGate(fullPass());
    expect(r.questions).toHaveLength(7);
    expect(r.questions.map((q) => q.id)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']);
  });

  it('every question carries non-empty evidence', () => {
    const r = evaluateLaunchGate(fullPass());
    for (const q of r.questions) {
      expect(q.evidence.length).toBeGreaterThan(0);
    }
  });

  it('rationale includes the YES/NO/미확인 tally and verdict label', () => {
    const r = evaluateLaunchGate(fullPass());
    expect(r.rationale).toContain('7개 출시 질문');
    expect(r.rationale).toContain('출시 준비 완료');
  });
});

describe('evaluateLaunchGate — verdicts', () => {
  it('all YES → READY', () => {
    expect(evaluateLaunchGate(fullPass()).verdict).toBe('READY');
  });

  it('a P0 finding → Q4 NO → BLOCK', () => {
    const r = evaluateLaunchGate(fullPass({ p0Count: 1 }));
    expect(answerOf(r, 'Q4')).toBe('NO');
    expect(r.verdict).toBe('BLOCK');
  });

  it('BLOCK takes precedence over a missing foundation', () => {
    // P0 present AND no README — Q4 wins.
    const r = evaluateLaunchGate(fullPass({ p0Count: 2, hasReadme: false }));
    expect(r.verdict).toBe('BLOCK');
  });

  it('missing README → Q1 NO → FIX_FIRST', () => {
    const r = evaluateLaunchGate(fullPass({ hasReadme: false }));
    expect(answerOf(r, 'Q1')).toBe('NO');
    expect(r.verdict).toBe('FIX_FIRST');
  });

  it('missing license → Q2 NO → FIX_FIRST', () => {
    expect(evaluateLaunchGate(fullPass({ hasLicense: false })).verdict).toBe('FIX_FIRST');
  });

  it('missing CI or tests → Q3 NO → FIX_FIRST', () => {
    expect(evaluateLaunchGate(fullPass({ hasCiConfig: false })).verdict).toBe('FIX_FIRST');
    expect(evaluateLaunchGate(fullPass({ hasTests: false })).verdict).toBe('FIX_FIRST');
  });

  it('README claim contradicting reality → Q1 NO → FIX_FIRST', () => {
    const r = evaluateLaunchGate(fullPass({ readmeClaimVerified: false }));
    expect(answerOf(r, 'Q1')).toBe('NO');
    expect(r.verdict).toBe('FIX_FIRST');
  });

  it('foundation failure outranks a minor failure', () => {
    // No README (foundation) AND low security (minor) → FIX_FIRST, not CONDITIONAL.
    const r = evaluateLaunchGate(fullPass({ hasReadme: false, securityScore: 40 }));
    expect(r.verdict).toBe('FIX_FIRST');
  });

  it('low security score → Q6 NO → CONDITIONAL', () => {
    const r = evaluateLaunchGate(fullPass({ securityScore: 60 }));
    expect(answerOf(r, 'Q6')).toBe('NO');
    expect(r.verdict).toBe('CONDITIONAL');
  });

  it('low business score → Q7 NO → CONDITIONAL', () => {
    expect(evaluateLaunchGate(fullPass({ businessScore: 50 })).verdict).toBe('CONDITIONAL');
  });

  it('unreachable deploy → Q5 NO → CONDITIONAL', () => {
    const r = evaluateLaunchGate(fullPass({ deployUrlReachable: false }));
    expect(answerOf(r, 'Q5')).toBe('NO');
    expect(r.verdict).toBe('CONDITIONAL');
  });
});

describe('evaluateLaunchGate — UNKNOWN is not NO', () => {
  it('reachable deploy but unmeasured UX → Q5 UNKNOWN, no NO → CONDITIONAL', () => {
    const r = evaluateLaunchGate(fullPass({ uxScore: null }));
    expect(answerOf(r, 'Q5')).toBe('UNKNOWN');
    expect(r.verdict).toBe('CONDITIONAL');
  });

  it('unmeasured security → Q6 UNKNOWN, no NO → CONDITIONAL', () => {
    const r = evaluateLaunchGate(fullPass({ securityScore: null }));
    expect(answerOf(r, 'Q6')).toBe('UNKNOWN');
    expect(r.verdict).toBe('CONDITIONAL');
  });

  it('unmeasured business → Q7 UNKNOWN → CONDITIONAL (not READY, not BLOCK)', () => {
    const r = evaluateLaunchGate(fullPass({ businessScore: null }));
    expect(answerOf(r, 'Q7')).toBe('UNKNOWN');
    expect(r.verdict).toBe('CONDITIONAL');
  });
});

describe('evaluateLaunchGate — score threshold boundaries', () => {
  it(`score exactly at the threshold (${LAUNCH_GATE_PASS_THRESHOLD}) is YES`, () => {
    const r = evaluateLaunchGate(
      fullPass({ securityScore: LAUNCH_GATE_PASS_THRESHOLD, businessScore: LAUNCH_GATE_PASS_THRESHOLD, uxScore: LAUNCH_GATE_PASS_THRESHOLD }),
    );
    expect(answerOf(r, 'Q6')).toBe('YES');
    expect(answerOf(r, 'Q7')).toBe('YES');
    expect(answerOf(r, 'Q5')).toBe('YES');
    expect(r.verdict).toBe('READY');
  });

  it(`score just below the threshold (${LAUNCH_GATE_PASS_THRESHOLD - 1}) is NO`, () => {
    const r = evaluateLaunchGate(fullPass({ securityScore: LAUNCH_GATE_PASS_THRESHOLD - 1 }));
    expect(answerOf(r, 'Q6')).toBe('NO');
    expect(r.verdict).toBe('CONDITIONAL');
  });

  it('reachable deploy with UX below threshold → Q5 NO', () => {
    const r = evaluateLaunchGate(fullPass({ uxScore: 69 }));
    expect(answerOf(r, 'Q5')).toBe('NO');
  });
});

describe('evaluateLaunchGate — evidence detail', () => {
  it('records the P0 count in Q4 evidence', () => {
    const r = evaluateLaunchGate(fullPass({ p0Count: 3 }));
    expect(r.questions.find((q) => q.id === 'Q4')!.evidence).toContain('P0 3건');
  });

  it('surfaces CONTRIBUTING as bonus evidence when present', () => {
    const r = evaluateLaunchGate(fullPass({ hasContributing: true }));
    expect(r.questions.find((q) => q.id === 'Q2')!.evidence).toContain('CONTRIBUTING 발견');
  });

  it('notes an unmeasured security score in Q6 evidence', () => {
    const r = evaluateLaunchGate(fullPass({ securityScore: null }));
    expect(r.questions.find((q) => q.id === 'Q6')!.evidence.join(' ')).toContain('미측정');
  });
});
