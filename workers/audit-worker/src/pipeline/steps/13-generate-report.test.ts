// Unit tests for composeOneLineSummary in 13-generate-report.ts.
//
// Focus: ensure the one-line executive summary stays consistent with the
// dashboard header. When launchStatus === 'INDETERMINATE' the message must
// NOT include a numeric readiness score or P-count — the header shows
// "N/A 판단 불가" in that state, and divergent text destroys trust.

import { describe, expect, it } from 'vitest';
import { composeOneLineSummary } from './13-generate-report.js';

describe('composeOneLineSummary', () => {
  const zeroCounts = { P0: 0, P1: 0, P2: 0, P3: 0 } as const;

  it('returns the INDETERMINATE message with no score or P-count when launchStatus is INDETERMINATE', () => {
    const out = composeOneLineSummary(0, zeroCounts, 'INDETERMINATE');
    expect(out).toBe(
      '분석 표면이 부족해 출시 준비도를 산정하지 못했습니다. 도구 설치/배포 URL/PRD 입력을 보강한 뒤 다시 분석해 주세요.',
    );
    expect(out).not.toMatch(/\d+점/);
    expect(out).not.toMatch(/P[0-3]/);
  });

  it('ignores numeric score when launchStatus is INDETERMINATE (header parity)', () => {
    // Even if scoring left a non-zero number on state (stale/partial), the
    // text must not surface it while launchStatus says we cannot judge.
    const out = composeOneLineSummary(33, { P0: 0, P1: 4, P2: 1, P3: 0 }, 'INDETERMINATE');
    expect(out).not.toContain('33');
    expect(out).not.toContain('P1');
  });

  it('uses the "양호" branch when score >= 85 and status is not INDETERMINATE', () => {
    const out = composeOneLineSummary(90, zeroCounts, 'READY');
    expect(out).toBe(
      '이 프로젝트는 출시 준비도 90점으로 양호한 상태입니다. 세부 개선 항목만 확인하세요.',
    );
  });

  it('uses the P0-blocking branch when P0 count > 0 and score < 85', () => {
    const out = composeOneLineSummary(40, { P0: 2, P1: 0, P2: 0, P3: 0 }, 'NOT_READY');
    expect(out).toBe(
      '이 프로젝트는 출시 준비도 40점이며, P0 출시 차단 이슈 2개가 있어 우선 해결이 필요합니다.',
    );
  });

  it('falls back to the P1 branch when score < 85 and no P0', () => {
    const out = composeOneLineSummary(60, { P0: 0, P1: 3, P2: 1, P3: 0 }, 'NEEDS_WORK');
    expect(out).toBe(
      '이 프로젝트는 출시 준비도 60점입니다. P1 이슈 3개부터 차례로 개선하세요.',
    );
  });
});
