// DiffView component tests — render the diff and assert the visible facts
// the user reads off the screen (counts, deltas, status labels).
//
// The component is pure presentation, so we feed it RunDiff fixtures and
// assert what the user-facing DOM exposes. We avoid asserting on Tailwind
// classes (those are styling concerns) and stick to text content + testids.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  Card: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
    <section {...rest}>{children}</section>
  ),
  CardBody: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const { DiffView } = await import('./diff-view.js');
const { computeRunDiff } = await import('@cleartoship/shared-types');

import type { AuditReport, Finding } from '@cleartoship/shared-types';

function makeFinding(overrides: Partial<Finding> & { id: string }): Finding {
  return {
    id: overrides.id,
    auditRunId: overrides.auditRunId ?? 'run',
    title: overrides.title ?? '제목',
    category: overrides.category ?? 'SECURITY_PRIVACY',
    severity: overrides.severity ?? 'P1',
    confidence: overrides.confidence ?? 'HIGH',
    status: overrides.status ?? 'OPEN',
    summary: overrides.summary ?? '',
    nonDeveloperExplanation: null,
    technicalExplanation: null,
    impact: null,
    recommendation: null,
    acceptanceCriteria: [],
    tags: [],
    evidenceCount: overrides.evidenceCount ?? 1,
    createdAt: '2026-05-17T00:00:00.000Z',
  };
}

function makeReport(overrides: Partial<AuditReport>): AuditReport {
  return {
    id: 'main',
    auditRunId: overrides.auditRunId ?? 'run',
    readinessScore: overrides.readinessScore ?? 70,
    launchStatus: overrides.launchStatus ?? 'CONDITIONAL',
    categoryScores: overrides.categoryScores ?? [],
    severityCounts: overrides.severityCounts ?? { P0: 0, P1: 0, P2: 0, P3: 0 },
    executiveSummary: '',
    markdown: '',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
}

describe('DiffView', () => {
  it('renders the previous run id in the header', () => {
    const diff = computeRunDiff({
      previousRunId: 'prev-123',
      currentRunId: 'curr-456',
      previousReport: null,
      currentReport: null,
      previousFindings: [],
      currentFindings: [],
    });
    render(<DiffView diff={diff} />);
    expect(screen.getByText(/prev-123/)).toBeInTheDocument();
  });

  it('shows score delta with the proper "previous → current" formatting', () => {
    const diff = computeRunDiff({
      previousRunId: 'p',
      currentRunId: 'c',
      previousReport: makeReport({ readinessScore: 60 }),
      currentReport: makeReport({ readinessScore: 75 }),
      previousFindings: [],
      currentFindings: [],
    });
    render(<DiffView diff={diff} />);
    const panel = screen.getByTestId('diff-score-panel');
    expect(panel).toHaveTextContent('60');
    expect(panel).toHaveTextContent('75');
    expect(screen.getByTestId('diff-score-delta')).toHaveTextContent('Δ +15');
  });

  it('renders "Δ —" when the previous report is missing', () => {
    const diff = computeRunDiff({
      previousRunId: 'p',
      currentRunId: 'c',
      previousReport: null,
      currentReport: makeReport({ readinessScore: 75 }),
      previousFindings: [],
      currentFindings: [],
    });
    render(<DiffView diff={diff} />);
    expect(screen.getByTestId('diff-score-delta')).toHaveTextContent('Δ —');
    expect(screen.getByTestId('diff-score-panel')).toHaveTextContent('N/A');
  });

  it('summarizes totals as +A 신규 / -R 해결 / ~C 변경 / U 동일', () => {
    const diff = computeRunDiff({
      previousRunId: 'p',
      currentRunId: 'c',
      previousReport: null,
      currentReport: null,
      previousFindings: [
        makeFinding({ id: 'same' }),
        makeFinding({ id: 'gone' }),
        makeFinding({ id: 'shift', severity: 'P2' }),
      ],
      currentFindings: [
        makeFinding({ id: 'same' }),
        makeFinding({ id: 'shift', severity: 'P0' }),
        makeFinding({ id: 'new' }),
      ],
    });
    render(<DiffView diff={diff} />);
    const totals = screen.getByTestId('diff-totals-summary');
    expect(totals).toHaveTextContent('+1 신규');
    expect(totals).toHaveTextContent('-1 해결');
    expect(totals).toHaveTextContent('~1 변경');
    expect(totals).toHaveTextContent('1 동일');
  });

  it('lists each finding change with its kind badge', () => {
    const diff = computeRunDiff({
      previousRunId: 'p',
      currentRunId: 'c',
      previousReport: null,
      currentReport: null,
      previousFindings: [
        makeFinding({ id: 'old', title: '제거된 항목' }),
        makeFinding({ id: 'mod', title: '수정된 항목', severity: 'P3' }),
      ],
      currentFindings: [
        makeFinding({ id: 'mod', title: '수정된 항목', severity: 'P0' }),
        makeFinding({ id: 'new', title: '추가된 항목' }),
      ],
    });
    render(<DiffView diff={diff} />);
    expect(screen.getByTestId('diff-finding-added-new')).toHaveTextContent('추가된 항목');
    expect(screen.getByTestId('diff-finding-removed-old')).toHaveTextContent('제거된 항목');
    const changed = screen.getByTestId('diff-finding-changed-mod');
    expect(changed).toHaveTextContent('수정된 항목');
    expect(changed).toHaveTextContent(/변경: .*severity/);
  });

  it('shows the empty-state copy when no findings changed', () => {
    const f = makeFinding({ id: 'stable' });
    const diff = computeRunDiff({
      previousRunId: 'p',
      currentRunId: 'c',
      previousReport: null,
      currentReport: null,
      previousFindings: [f],
      currentFindings: [f],
    });
    render(<DiffView diff={diff} />);
    expect(screen.getByTestId('diff-findings-empty')).toBeInTheDocument();
  });

  it('renders every severity row P0..P3 with previous → current → delta', () => {
    const diff = computeRunDiff({
      previousRunId: 'p',
      currentRunId: 'c',
      previousReport: makeReport({ severityCounts: { P0: 1, P1: 2, P2: 3, P3: 4 } }),
      currentReport: makeReport({ severityCounts: { P0: 0, P1: 5, P2: 3, P3: 1 } }),
      previousFindings: [],
      currentFindings: [],
    });
    render(<DiffView diff={diff} />);
    expect(screen.getByTestId('diff-severity-P0')).toHaveTextContent('1 → 0');
    expect(screen.getByTestId('diff-severity-P0')).toHaveTextContent('-1');
    expect(screen.getByTestId('diff-severity-P1')).toHaveTextContent('+3');
    expect(screen.getByTestId('diff-severity-P2')).toHaveTextContent('±0');
    expect(screen.getByTestId('diff-severity-P3')).toHaveTextContent('-3');
  });

  it('renders category deltas including N/A-only sides', () => {
    const diff = computeRunDiff({
      previousRunId: 'p',
      currentRunId: 'c',
      previousReport: makeReport({
        categoryScores: [
          { category: 'UX_UI', label: 'UX', score: null, summary: null },
          { category: 'SECURITY_PRIVACY', label: 'Sec', score: 50, summary: null },
        ],
      }),
      currentReport: makeReport({
        categoryScores: [
          { category: 'UX_UI', label: 'UX', score: 80, summary: null },
          { category: 'SECURITY_PRIVACY', label: 'Sec', score: 70, summary: null },
        ],
      }),
      previousFindings: [],
      currentFindings: [],
    });
    render(<DiffView diff={diff} />);
    const ux = screen.getByTestId('diff-category-UX_UI');
    // N/A previous → numeric current, delta unresolvable → "—".
    expect(ux).toHaveTextContent('N/A → 80');
    expect(ux).toHaveTextContent('—');
    const sec = screen.getByTestId('diff-category-SECURITY_PRIVACY');
    expect(sec).toHaveTextContent('50 → 70');
    expect(sec).toHaveTextContent('+20');
  });

  it('exposes an accessible name on the diff-view region for screen readers', () => {
    const diff = computeRunDiff({
      previousRunId: 'p',
      currentRunId: 'c',
      previousReport: null,
      currentReport: null,
      previousFindings: [],
      currentFindings: [],
    });
    render(<DiffView diff={diff} />);
    expect(screen.getByLabelText('재감사 diff')).toBeInTheDocument();
  });
});
