import { describe, expect, it } from 'vitest';
import { buildImprovementPrd } from './build-prd.js';
import type {
  AuditCategory,
  Finding,
  LaunchStatus,
  Severity,
} from '@cleartoship/shared-types';

function makeFinding(
  overrides: Partial<Finding> & {
    category: AuditCategory;
    severity: Severity;
    title?: string;
  },
): Finding {
  return {
    id: overrides.id ?? 'f-1',
    auditRunId: overrides.auditRunId ?? 'run-1',
    title: overrides.title ?? '제목',
    category: overrides.category,
    severity: overrides.severity,
    confidence: overrides.confidence ?? 'HIGH',
    status: overrides.status ?? 'OPEN',
    summary: overrides.summary ?? '간단 요약',
    nonDeveloperExplanation: overrides.nonDeveloperExplanation ?? null,
    technicalExplanation: overrides.technicalExplanation ?? null,
    impact: overrides.impact ?? null,
    recommendation: overrides.recommendation ?? '권장 조치',
    acceptanceCriteria: overrides.acceptanceCriteria ?? ['수용 기준 1', '수용 기준 2'],
    tags: overrides.tags ?? [],
    evidenceCount: overrides.evidenceCount ?? 0,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
  };
}

const baseInput = {
  projectName: 'TestProject',
  readinessScore: 72,
  launchStatus: 'CONDITIONAL' as LaunchStatus,
  severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
};

describe('buildImprovementPrd — empty findings', () => {
  it('returns a PRD with header and template sections even when no findings', () => {
    const result = buildImprovementPrd({ ...baseInput, findings: [] });
    expect(result.title).toBe('TestProject 개선 PRD');
    expect(result.markdown).toContain('# TestProject 개선 PRD');
    expect(result.markdown).toContain('## 1. 개선 목적');
    expect(result.markdown).toContain('## 2. 현재 상태 요약');
    expect(result.markdown).toContain('## 5. Epic 목록');
    expect(result.markdown).toContain('우선순위 P0/P1 이슈가 없어 별도 Epic이 필요하지 않습니다.');
  });

  it('epicCount is 0 when no findings are provided', () => {
    const result = buildImprovementPrd({ ...baseInput, findings: [] });
    expect(result.epicCount).toBe(0);
  });

  it('includes scoring snapshot rows in markdown', () => {
    const result = buildImprovementPrd({
      ...baseInput,
      readinessScore: 42,
      severityCounts: { P0: 2, P1: 1, P2: 5, P3: 9 },
      launchStatus: 'AT_RISK',
      findings: [],
    });
    expect(result.markdown).toContain('| 종합 점수 | 42/100 |');
    expect(result.markdown).toContain('| P0 이슈 | 2개 |');
    expect(result.markdown).toContain('| P1 이슈 | 1개 |');
    expect(result.markdown).toContain('위험'); // AT_RISK Korean label
  });
});

describe('buildImprovementPrd — P0/P1 filtering', () => {
  it('excludes P2 findings from Epic generation', () => {
    const findings: Finding[] = [
      makeFinding({ category: 'UX_UI', severity: 'P2', title: 'P2 issue' }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    expect(result.epicCount).toBe(0);
    expect(result.markdown).not.toContain('P2 issue');
  });

  it('excludes P3 findings from Epic generation', () => {
    const findings: Finding[] = [
      makeFinding({ category: 'BACKEND_API', severity: 'P3', title: 'P3 issue' }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    expect(result.epicCount).toBe(0);
    expect(result.markdown).not.toContain('P3 issue');
  });

  it('includes only P0/P1 findings in Epic sections', () => {
    const findings: Finding[] = [
      makeFinding({ category: 'SECURITY_PRIVACY', severity: 'P0', title: 'P0 critical' }),
      makeFinding({ category: 'UX_UI', severity: 'P1', title: 'P1 important' }),
      makeFinding({ category: 'UX_UI', severity: 'P2', title: 'P2 nice' }),
      makeFinding({ category: 'UX_UI', severity: 'P3', title: 'P3 polish' }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    expect(result.markdown).toContain('P0 critical');
    expect(result.markdown).toContain('P1 important');
    expect(result.markdown).not.toContain('P2 nice');
    expect(result.markdown).not.toContain('P3 polish');
  });
});

describe('buildImprovementPrd — Epic grouping by category', () => {
  it('groups multiple P0 findings of the same category into one Epic', () => {
    const findings: Finding[] = [
      makeFinding({ category: 'SECURITY_PRIVACY', severity: 'P0', title: 'A' }),
      makeFinding({ category: 'SECURITY_PRIVACY', severity: 'P0', title: 'B' }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    expect(result.epicCount).toBe(1);
    expect(result.markdown).toContain('[P0] SECURITY_PRIVACY 보완');
  });

  it('creates separate Epics per category at the same severity', () => {
    const findings: Finding[] = [
      makeFinding({ category: 'SECURITY_PRIVACY', severity: 'P0', title: 'A' }),
      makeFinding({ category: 'BACKEND_API', severity: 'P0', title: 'B' }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    expect(result.epicCount).toBe(2);
    expect(result.markdown).toContain('[P0] SECURITY_PRIVACY 보완');
    expect(result.markdown).toContain('[P0] BACKEND_API 보완');
  });

  it('orders P0 Epics before P1 Epics', () => {
    const findings: Finding[] = [
      makeFinding({ category: 'UX_UI', severity: 'P1', title: 'P1 first added' }),
      makeFinding({ category: 'SECURITY_PRIVACY', severity: 'P0', title: 'P0 added later' }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    const p0Idx = result.markdown.indexOf('[P0] SECURITY_PRIVACY 보완');
    const p1Idx = result.markdown.indexOf('[P1] UX_UI 개선');
    expect(p0Idx).toBeGreaterThan(-1);
    expect(p1Idx).toBeGreaterThan(-1);
    expect(p0Idx).toBeLessThan(p1Idx);
  });

  it('numbers Epics sequentially starting at 1', () => {
    const findings: Finding[] = [
      makeFinding({ category: 'SECURITY_PRIVACY', severity: 'P0', title: 'A' }),
      makeFinding({ category: 'BACKEND_API', severity: 'P1', title: 'B' }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    expect(result.markdown).toContain('Epic 1 —');
    expect(result.markdown).toContain('Epic 2 —');
  });
});

describe('buildImprovementPrd — markdown validity', () => {
  it('renders acceptance criteria as a markdown checklist', () => {
    const findings: Finding[] = [
      makeFinding({
        category: 'UX_UI',
        severity: 'P1',
        acceptanceCriteria: ['로그인 폼이 표시된다', '에러 메시지가 노출된다'],
      }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    expect(result.markdown).toContain('- [ ] 로그인 폼이 표시된다');
    expect(result.markdown).toContain('- [ ] 에러 메시지가 노출된다');
  });

  it('renders recommendation when provided', () => {
    const findings: Finding[] = [
      makeFinding({
        category: 'UX_UI',
        severity: 'P1',
        recommendation: 'tailwind class 변경',
      }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    expect(result.markdown).toContain('tailwind class 변경');
  });

  it('starts the document with a level-1 heading', () => {
    const result = buildImprovementPrd({ ...baseInput, findings: [] });
    expect(result.markdown.split('\n')[0]).toBe('# TestProject 개선 PRD');
  });

  it('includes the bibe-coding meta-prompt block with severity-tagged items', () => {
    const findings: Finding[] = [
      makeFinding({ category: 'SECURITY_PRIVACY', severity: 'P0' }),
      makeFinding({ category: 'UX_UI', severity: 'P1' }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    expect(result.markdown).toContain('## 통합 지시문 (바이브 코딩 도구용)');
    expect(result.markdown).toContain('- [P0] [P0] SECURITY_PRIVACY 보완');
    expect(result.markdown).toContain('- [P1] [P1] UX_UI 개선');
  });

  it('contains no findings.title section without a heading', () => {
    const findings: Finding[] = [
      makeFinding({ category: 'UX_UI', severity: 'P1', title: 'Title here' }),
    ];
    const result = buildImprovementPrd({ ...baseInput, findings });
    // Title should appear under a #### sub-heading
    expect(result.markdown).toMatch(/#### \d+\. Title here/);
  });
});

describe('buildImprovementPrd — return shape', () => {
  it('returns exactly { title, markdown, epicCount }', () => {
    const result = buildImprovementPrd({ ...baseInput, findings: [] });
    expect(Object.keys(result).sort()).toEqual(['epicCount', 'markdown', 'title']);
    expect(typeof result.title).toBe('string');
    expect(typeof result.markdown).toBe('string');
    expect(typeof result.epicCount).toBe('number');
  });
});
