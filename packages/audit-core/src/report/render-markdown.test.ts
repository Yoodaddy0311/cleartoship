// Unit tests for renderAuditReportMarkdown — §1 Executive Summary block.
//
// Focus: launchStatus === 'INDETERMINATE' must replace numeric Readiness
// Score and P-counts with "N/A" so the markdown report stays consistent
// with the dashboard header (N/A 판단 불가) and the one-line summary
// (which is already handled in workers/.../13-generate-report.ts).
// Normal branches keep numeric output unchanged.

import { describe, expect, it } from 'vitest';
import type { CategoryScore, Finding, LaunchStatus, Severity } from '@cleartoship/shared-types';
import { renderAuditReportMarkdown, type RenderReportInput } from './render-markdown.js';
import { W1B_CHECKLIST } from '../intent/w1b-checklist.js';
import { W1A_CHECKLIST } from '../intent/w1a-checklist.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    auditRunId: 'r1',
    title: 'sample',
    category: 'BACKEND_API',
    severity: 'P2',
    confidence: 'LOW',
    status: 'OPEN',
    summary: 's',
    nonDeveloperExplanation: null,
    technicalExplanation: null,
    impact: null,
    recommendation: null,
    acceptanceCriteria: [],
    tags: [],
    evidenceCount: 0,
    createdAt: '2026-05-17T00:00:00.000Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<RenderReportInput> = {}): RenderReportInput {
  const counts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const launchStatus: LaunchStatus = 'READY';
  const categoryScores: CategoryScore[] = [];
  const findings: Finding[] = [];
  return {
    projectName: 'demo',
    repoUrl: 'https://github.com/example/demo',
    deployUrl: null,
    commitHash: null,
    analyzedAt: '2026-05-17T00:00:00.000Z',
    techStack: ['typescript'],
    readinessScore: 80,
    launchStatus,
    categoryScores,
    severityCounts: counts,
    findings,
    graphSummary: null,
    oneLineSummary: '한 줄 요약',
    ...overrides,
  };
}

describe('renderAuditReportMarkdown — §1 Executive Summary', () => {
  it('renders numeric score and P-counts on normal branches (READY)', () => {
    const md = renderAuditReportMarkdown(
      makeInput({
        readinessScore: 92,
        launchStatus: 'READY',
        severityCounts: { P0: 0, P1: 2, P2: 5, P3: 7 },
      }),
    );
    expect(md).toContain('Product Readiness Score: 92/100');
    expect(md).toContain('P0 이슈: 0개');
    expect(md).toContain('P1 이슈: 2개');
    expect(md).toContain('P2 이슈: 5개');
    expect(md).toContain('P3 이슈: 7개');
    expect(md).not.toContain('Product Readiness Score: N/A');
  });

  it('replaces score and P-counts with N/A when launchStatus is INDETERMINATE', () => {
    const md = renderAuditReportMarkdown(
      makeInput({
        readinessScore: 33,
        launchStatus: 'INDETERMINATE',
        severityCounts: { P0: 0, P1: 4, P2: 1, P3: 0 },
      }),
    );
    expect(md).toContain('Product Readiness Score: N/A');
    expect(md).toContain('P0 이슈: N/A');
    expect(md).toContain('P1 이슈: N/A');
    expect(md).toContain('P2 이슈: N/A');
    expect(md).toContain('P3 이슈: N/A');
    // Numeric leakage check — must not surface stale numbers.
    expect(md).not.toContain('33/100');
    expect(md).not.toContain('P1 이슈: 4개');
    expect(md).not.toContain('P2 이슈: 1개');
  });

  it('keeps the launchStatus Korean label visible even when INDETERMINATE', () => {
    const md = renderAuditReportMarkdown(
      makeInput({ launchStatus: 'INDETERMINATE' }),
    );
    // The label itself ("판단 불가 (분석 자료 부족)") is information, not
    // a numeric score — header parity allows it.
    expect(md).toContain('판단 불가');
  });

  it('still renders the one-line summary line on INDETERMINATE (separate concern)', () => {
    const md = renderAuditReportMarkdown(
      makeInput({
        launchStatus: 'INDETERMINATE',
        oneLineSummary: '분석 표면이 부족해 출시 준비도를 산정하지 못했습니다.',
      }),
    );
    expect(md).toContain('> 분석 표면이 부족해');
  });

  it('renders the §7 W1-B section header even when no risky findings exist', () => {
    const md = renderAuditReportMarkdown(makeInput({ findings: [] }));
    expect(md).toContain('## 7. W1-B 위험 함수 체크리스트');
    // Header table is present.
    expect(md).toContain('| 체크리스트 ID | 항목 | 건수 | P0 | P1 | P2 | P3 |');
    // Every checklist ID appears as a row with zero counts.
    for (const item of W1B_CHECKLIST) {
      expect(md).toContain(`| ${item.id} |`);
    }
    expect(md).toContain('위험 함수 후보가 감지되지 않았습니다.');
  });

  it('groups W1-B findings by checklist ID and counts by severity', () => {
    const md = renderAuditReportMarkdown(
      makeInput({
        findings: [
          makeFinding({
            id: 'a',
            title: 'login() 권한 미체크',
            severity: 'P1',
            tags: ['risky-function', 'auth', 'W1-B', 'W1-B1'],
          }),
          makeFinding({
            id: 'b',
            title: 'chargeCard() 비가역 결제',
            severity: 'P0',
            tags: ['risky-function', 'payment', 'W1-B', 'W1-B2'],
          }),
          makeFinding({
            id: 'c',
            title: 'deleteUser() 영구 삭제',
            severity: 'P2',
            tags: ['risky-function', 'delete', 'W1-B', 'W1-B3'],
          }),
        ],
      }),
    );
    // Table row counts are present (P0/P1/P2/P3 breakdown).
    expect(md).toContain('| W1-B1 | 인증/세션 처리 함수 | 1 | 0 | 1 | 0 | 0 |');
    expect(md).toContain('| W1-B2 | 결제/금액 처리 함수 | 1 | 1 | 0 | 0 | 0 |');
    expect(md).toContain('| W1-B3 | 하드 삭제 함수 | 1 | 0 | 0 | 1 | 0 |');
    // Detail subsections render only for populated groups.
    expect(md).toContain('### W1-B1 인증/세션 처리 함수');
    expect(md).toContain('- **P1** · login() 권한 미체크');
    expect(md).toContain('### W1-B2 결제/금액 처리 함수');
    expect(md).toContain('### W1-B3 하드 삭제 함수');
    // The empty-state notice must NOT appear when there is at least one match.
    expect(md).not.toContain('위험 함수 후보가 감지되지 않았습니다.');
  });

  it('ignores non-W1-B tags so unrelated findings do not pollute the section', () => {
    const md = renderAuditReportMarkdown(
      makeInput({
        findings: [
          makeFinding({
            id: 'x',
            title: 'unrelated finding',
            tags: ['semgrep', 'security'],
          }),
        ],
      }),
    );
    expect(md).toContain('위험 함수 후보가 감지되지 않았습니다.');
    expect(md).not.toContain('### W1-B1');
  });

  it('renders the fine-grained breakdown sub-section only when fine IDs are tagged', () => {
    const md = renderAuditReportMarkdown(
      makeInput({
        findings: [
          makeFinding({
            id: 'fine-a',
            title: 'loginWithEmail() 세션 검증 누락',
            severity: 'P1',
            // Worker emits BOTH baseline (W1-B1) and fine (W1-B7 = login).
            tags: ['risky-function', 'auth', 'W1-B', 'W1-B1', 'W1-B7'],
          }),
        ],
      }),
    );
    expect(md).toContain('세부 패턴 매칭 (W1-B7+)');
    expect(md).toContain('| W1-B7 |');
  });

  it('does NOT render the fine-grained sub-section when only baseline IDs are tagged', () => {
    const md = renderAuditReportMarkdown(
      makeInput({
        findings: [
          makeFinding({
            id: 'baseline-only',
            title: 'someRandomAuthFn()',
            severity: 'P2',
            tags: ['risky-function', 'auth', 'W1-B', 'W1-B1'],
          }),
        ],
      }),
    );
    expect(md).not.toContain('세부 패턴 매칭');
  });

  it('renders NOT_READY with numeric values (no false INDETERMINATE conflation)', () => {
    const md = renderAuditReportMarkdown(
      makeInput({
        readinessScore: 40,
        launchStatus: 'NOT_READY',
        severityCounts: { P0: 3, P1: 1, P2: 0, P3: 0 },
      }),
    );
    expect(md).toContain('Product Readiness Score: 40/100');
    expect(md).toContain('P0 이슈: 3개');
    expect(md).not.toContain('N/A');
  });

  // T1.2-FU — §1 W1-A launch-readiness checklist table
  it('renders §1 W1-A table with all 5 launch-readiness items', () => {
    const md = renderAuditReportMarkdown(makeInput({ findings: [] }));
    expect(md).toContain('### 출시 준비 체크리스트 (W1-A)');
    expect(md).toContain('| 체크리스트 ID | 항목 | 상태 |');
    for (const item of W1A_CHECKLIST) {
      expect(md).toContain(`| ${item.id} | ${item.label} |`);
    }
  });

  it('§1 W1-A table marks an item FAIL when a W1-A finding with that sub-ID exists', () => {
    const md = renderAuditReportMarkdown(
      makeInput({
        findings: [
          makeFinding({
            id: 'a',
            title: 'README 없음',
            severity: 'P2',
            tags: ['W1-A', 'W1-A1'],
          }),
        ],
      }),
    );
    expect(md).toContain('| W1-A1 | README 존재 | ❌ FAIL |');
    expect(md).toContain('| W1-A2 | package.json 스크립트 정의 | ✅ PASS |');
  });

  it('§1 W1-A table treats absence of W1-A<id> findings as PASS (default-pass model)', () => {
    const md = renderAuditReportMarkdown(makeInput({ findings: [] }));
    for (const item of W1A_CHECKLIST) {
      expect(md).toContain(`| ${item.id} | ${item.label} | ✅ PASS |`);
    }
  });
});
