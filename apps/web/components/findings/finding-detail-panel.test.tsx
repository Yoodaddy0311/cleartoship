// FindingDetailPanel tests — sibling-located on purpose.

import { describe, it, expect, vi } from 'vitest';
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

vi.mock('@/components/evidences/evidence-list', () => ({
  EvidenceList: ({ items }: { items: unknown[] }) => <ul data-testid="evidence-count">count:{items.length}</ul>,
}));

vi.mock('@/lib/format/category', () => ({
  categoryLabel: (c: string) => `cat:${c}`,
}));

vi.mock('@/lib/i18n', () => ({
  t: (k: string) => k,
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
      expect.arrayContaining(['cat:security', '신뢰도 high']),
    );
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
});
