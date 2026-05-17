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
});
