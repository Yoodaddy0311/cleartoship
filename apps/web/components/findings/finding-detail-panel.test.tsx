// FindingDetailPanel tests — sibling-located on purpose.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
  // cn is the className utility — pass-through join is enough for jsdom asserts.
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/components/common/severity-chip', () => ({
  SeverityChip: ({ severity }: { severity: string }) => <span data-testid="sev">{severity}</span>,
}));

vi.mock('@/components/common/confidence-chip', () => ({
  ConfidenceChip: ({ confidence }: { confidence: string }) => (
    <span data-testid="confidence-chip" aria-label={`신뢰도: ${confidence}`}>
      신뢰도 {confidence}
    </span>
  ),
}));

vi.mock('@/components/evidences/evidence-list', () => ({
  EvidenceList: ({ items }: { items: unknown[] }) => <ul data-testid="evidence-count">count:{items.length}</ul>,
}));

// L-P1-4: finding-detail-panel now delegates the evidence card (collapse +
// truncated banner + list) to <EvidencePanel>. Mock it so this test
// continues to focus on the panel's own composition. The mock surfaces the
// props we care about (item count, truncated flag, ruleId) as test ids so
// the existing assertions can stay close to their original shape.
vi.mock('@/components/evidences/evidence-panel', () => ({
  EvidencePanel: ({
    ruleId,
    items,
    truncated,
  }: {
    ruleId: string;
    items: unknown[];
    truncated?: boolean;
  }) => (
    <div
      data-testid="evidence-panel-mock"
      data-rule-id={ruleId}
      data-truncated={truncated ? 'true' : 'false'}
    >
      <ul data-testid="evidence-count">count:{items.length}</ul>
      {truncated ? (
        <div
          data-testid="evidence-truncated-banner"
          role="status"
          aria-live="polite"
        >
          findings.detail.evidences.truncated
        </div>
      ) : null}
    </div>
  ),
}));

vi.mock('@/lib/format/category', () => ({
  categoryLabel: (c: string) => `cat:${c}`,
}));

vi.mock('@/lib/i18n', () => ({
  t: (k: string) => k,
}));

// T2.6 — the panel now subscribes to the false-positive hook to drive the
// strikethrough treatment + render the toggle button. Tests substitute a
// controlled stub so we don't touch Firestore or the anonymous-auth flow.
const fpHookState = {
  isFalsePositive: false,
  loading: false,
  saving: false,
  error: null as Error | null,
  toggle: vi.fn(),
};

vi.mock('@/lib/feedback/use-false-positive', () => ({
  useFalsePositive: () => fpHookState,
}));

vi.mock('@/components/findings/false-positive-toggle', () => ({
  FalsePositiveToggle: ({ isFalsePositive }: { isFalsePositive: boolean }) => (
    <button data-testid="false-positive-toggle" aria-pressed={isFalsePositive}>
      stub
    </button>
  ),
}));

vi.mock('@/components/findings/action-hint-cell', () => ({
  ActionHintCell: ({
    hint,
    variant,
  }: {
    hint?: { text: string; etaMinutes: number };
    variant?: string;
  }) => (
    <div data-testid="action-hint-cell" data-variant={variant}>
      {hint ? `${hint.text}|${hint.etaMinutes}` : 'empty'}
    </div>
  ),
}));

const { FindingDetailPanel } = await import('./finding-detail-panel.js');

const finding = {
  id: 'f1',
  title: 'XSS in search',
  summary: 'short summary',
  severity: 'P1',
  category: 'security',
  confidence: 'high',
  nonDeveloperExplanation: '비개발자 설명',
  technicalExplanation: '기술 설명',
  impact: ['impact-1', 'impact-2'],
  recommendation: ['rec-1'],
  acceptanceCriteria: ['ac-1', 'ac-2'],
  evidences: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
} as never;

describe('FindingDetailPanel', () => {
  it('renders the title as an h1 with summary', () => {
    render(<FindingDetailPanel finding={finding} />);
    expect(
      screen.getByRole('heading', { name: 'XSS in search', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('short summary')).toBeInTheDocument();
  });

  it('renders severity chip + category + confidence badges', () => {
    render(<FindingDetailPanel finding={finding} />);
    expect(screen.getByTestId('sev')).toHaveTextContent('P1');
    expect(screen.getAllByTestId('badge').map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['cat:security']),
    );
    expect(screen.getByTestId('confidence-chip')).toHaveTextContent('신뢰도 high');
  });

  it('renders impact + recommendation + acceptance + evidence sections', () => {
    render(<FindingDetailPanel finding={finding} />);
    expect(screen.getByText('impact-1')).toBeInTheDocument();
    expect(screen.getByText('rec-1')).toBeInTheDocument();
    expect(screen.getByText('ac-1')).toBeInTheDocument();
    expect(screen.getByTestId('evidence-count')).toHaveTextContent('count:3');
  });

  it('disables the acceptance-criteria checkboxes with a11y labels', () => {
    render(<FindingDetailPanel finding={finding} />);
    const cb = screen.getByRole('checkbox', { name: '수용 기준 1' });
    expect(cb).toBeDisabled();
  });

  it('renders the evidence-truncated warning banner when truncated=true', () => {
    render(<FindingDetailPanel finding={finding} truncated={true} />);
    const banner = screen.getByTestId('evidence-truncated-banner');
    expect(banner).toBeInTheDocument();
    // a11y: status role + polite live region so AT announces without
    // interrupting; never `alert` because evidence truncation is
    // informational rather than blocking.
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    // The user-facing copy comes from the i18n key, and the mock t() returns
    // the key as-is, so we assert on that key.
    expect(banner).toHaveTextContent('findings.detail.evidences.truncated');
  });

  it('does not render the truncated banner when truncated=false', () => {
    render(<FindingDetailPanel finding={finding} truncated={false} />);
    expect(screen.queryByTestId('evidence-truncated-banner')).toBeNull();
  });

  it('does not render the truncated banner when truncated prop is omitted', () => {
    render(<FindingDetailPanel finding={finding} />);
    expect(screen.queryByTestId('evidence-truncated-banner')).toBeNull();
  });

  it('renders the friendly explanation (what/why) for semgrep findings', () => {
    const semgrepFinding = {
      ...(finding as object),
      title: 'Semgrep: javascript.lang.security.audit.eval',
      nonDeveloperExplanation:
        '코드 검사 도구가 잠재적 보안/품질 문제를 발견했습니다. 개발자가 해당 라인을 확인해야 합니다.',
    } as never;
    render(<FindingDetailPanel finding={semgrepFinding} />);
    const block = screen.getByTestId('friendly-explanation');
    expect(block).toBeInTheDocument();
    expect(block).toHaveTextContent('무엇이 문제인가요?');
    expect(block).toHaveTextContent('왜 위험한가요?');
    // Detail (analogy + fixGuide) is hidden until the toggle is clicked.
    expect(screen.queryByTestId('friendly-analogy')).toBeNull();
    expect(screen.queryByTestId('friendly-fix-guide')).toBeNull();
    // The default toggle label is "자세히 보기".
    expect(
      screen.getByRole('button', { name: '자세히 보기' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('reveals analogy + fixGuide after clicking "자세히 보기"', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const semgrepFinding = {
      ...(finding as object),
      title: 'Semgrep: javascript.lang.security.audit.eval',
    } as never;
    render(<FindingDetailPanel finding={semgrepFinding} />);
    fireEvent.click(screen.getByRole('button', { name: '자세히 보기' }));
    expect(screen.getByTestId('friendly-analogy')).toBeInTheDocument();
    expect(screen.getByTestId('friendly-fix-guide')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '간단히 보기' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('falls back to nonDeveloperExplanation for non-semgrep findings (no regression)', () => {
    render(<FindingDetailPanel finding={finding} />);
    expect(screen.queryByTestId('friendly-explanation')).toBeNull();
    expect(screen.getByText('비개발자 설명')).toBeInTheDocument();
  });

  describe('false-positive integration (T2.6)', () => {
    beforeEach(() => {
      fpHookState.isFalsePositive = false;
      fpHookState.loading = false;
      fpHookState.saving = false;
      fpHookState.error = null;
      fpHookState.toggle = vi.fn();
    });

    it('renders the toggle when auditId is provided', () => {
      render(<FindingDetailPanel finding={finding} auditId="run-1" />);
      expect(screen.getByTestId('false-positive-toggle')).toBeInTheDocument();
    });

    it('hides the toggle when auditId is omitted (backwards-compatible)', () => {
      render(<FindingDetailPanel finding={finding} />);
      expect(screen.queryByTestId('false-positive-toggle')).toBeNull();
    });

    it('applies the strikethrough style to title + summary when flagged', () => {
      fpHookState.isFalsePositive = true;
      const { container } = render(
        <FindingDetailPanel finding={finding} auditId="run-1" />,
      );
      const article = screen.getByTestId('finding-detail-panel');
      expect(article).toHaveAttribute('data-state', 'false-positive');

      const heading = screen.getByRole('heading', { name: 'XSS in search', level: 1 });
      expect(heading.className).toMatch(/line-through/);
      expect(heading.className).toMatch(/text-\[color:var\(--color-fg-muted\)\]/);

      // Summary <p> sits as the next sibling-block of the heading
      const summary = container.querySelector('p.text-md');
      expect(summary?.className).toMatch(/line-through/);
    });

    it('keeps the active visual state when unflagged', () => {
      render(<FindingDetailPanel finding={finding} auditId="run-1" />);
      const article = screen.getByTestId('finding-detail-panel');
      expect(article).toHaveAttribute('data-state', 'active');

      const heading = screen.getByRole('heading', { name: 'XSS in search', level: 1 });
      expect(heading.className).not.toMatch(/line-through/);
    });

    it('does not strike-through when auditId is omitted, even if hook returns true', () => {
      // Edge case: hook still wired (panel calls it unconditionally to keep
      // hook order stable across renders), but we treat the absence of
      // auditId as "not enrolled in feedback" so the title stays active.
      fpHookState.isFalsePositive = true;
      render(<FindingDetailPanel finding={finding} />);
      const article = screen.getByTestId('finding-detail-panel');
      expect(article).toHaveAttribute('data-state', 'active');
    });
  });

  describe('actionHint section (L-P0-6)', () => {
    it('renders the panel-variant ActionHintCell when finding.actionHint is present', () => {
      const withHint = {
        ...(finding as object),
        actionHint: {
          text: '환경변수에 시크릿을 옮기세요',
          etaMinutes: 30,
        },
      } as never;
      render(<FindingDetailPanel finding={withHint} />);
      const cell = screen.getByTestId('action-hint-cell');
      expect(cell).toBeInTheDocument();
      expect(cell).toHaveAttribute('data-variant', 'panel');
      expect(cell).toHaveTextContent('환경변수에 시크릿을 옮기세요|30');
    });

    it('hides the actionHint section when finding.actionHint is omitted (backwards-compatible)', () => {
      render(<FindingDetailPanel finding={finding} />);
      expect(screen.queryByTestId('action-hint-cell')).toBeNull();
    });
  });
});
