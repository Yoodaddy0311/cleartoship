// FindingsTable tests — sort cycle + URL param sync (W2.C7.1).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// next/navigation: stateful searchParams so router.replace updates flow back
// through useSearchParams() on the next render. Mirrors the real Next runtime
// closely enough for our integration test without a full app router.
let currentSearch = '';
const replaceMock = vi.fn((url: string) => {
  const qIx = url.indexOf('?');
  currentSearch = qIx === -1 ? '' : url.slice(qIx + 1);
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => '/audits/run-1/findings',
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

// Lightweight UI surface — we only need the children to render.
vi.mock('@cleartoship/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/i18n', () => ({
  t: (k: string) => k,
}));

vi.mock('@/lib/format/severity', () => ({
  SEVERITY_ORDER: ['P0', 'P1', 'P2', 'P3'] as const,
  severityLabel: (s: string) => `sev:${s}`,
}));

vi.mock('@/lib/format/category', () => ({
  ALL_CATEGORIES: ['PRODUCT_INTENT', 'SECURITY_PRIVACY'] as const,
  categoryLabel: (c: string) => `cat:${c}`,
}));

vi.mock('@/components/common/severity-chip', () => ({
  SeverityChip: ({ severity }: { severity: string }) => (
    <span data-testid={`sev-chip-${severity}`}>{severity}</span>
  ),
}));

vi.mock('@/components/common/confidence-chip', () => ({
  ConfidenceChip: ({ confidence }: { confidence: string }) => (
    <span data-testid={`conf-chip-${confidence}`}>{confidence}</span>
  ),
}));

vi.mock('./action-hint-cell', () => ({
  ActionHintCell: () => <span data-testid="action-hint" />,
}));

const { FindingsTable } = await import('./findings-table.js');

// Three findings spanning every dimension — enough to assert ordering swaps.
const FINDINGS = [
  {
    id: 'f1',
    title: 'Finding 1',
    summary: 's1',
    category: 'PRODUCT_INTENT',
    severity: 'P2',
    confidence: 'medium',
    nonDeveloperExplanation: '',
    technicalExplanation: '',
    impact: [],
    recommendation: [],
    acceptanceCriteria: [],
    evidences: [],
  },
  {
    id: 'f2',
    title: 'Finding 2',
    summary: 's2',
    category: 'SECURITY_PRIVACY',
    severity: 'P0',
    confidence: 'low',
    nonDeveloperExplanation: '',
    technicalExplanation: '',
    impact: [],
    recommendation: [],
    acceptanceCriteria: [],
    evidences: [],
  },
  {
    id: 'f3',
    title: 'Finding 3',
    summary: 's3',
    category: 'PRODUCT_INTENT',
    severity: 'P3',
    confidence: 'high',
    nonDeveloperExplanation: '',
    technicalExplanation: '',
    impact: [],
    recommendation: [],
    acceptanceCriteria: [],
    evidences: [],
  },
] as never;

function rowTitlesInOrder(): string[] {
  // First column always holds <a>{title}</a> — read all anchor text to derive
  // the visual sort order without depending on internal row test-ids.
  const rows = screen.getAllByRole('row').slice(1); // drop header row
  return rows.map((r) => within(r).getAllByRole('link')[0]!.textContent ?? '');
}

describe('FindingsTable', () => {
  beforeEach(() => {
    currentSearch = '';
    replaceMock.mockClear();
  });

  it('cycles severity sort none → desc → asc → none on repeated header clicks and reflects aria-sort', () => {
    render(<FindingsTable auditId="run-1" findings={FINDINGS} />);

    // Default sort (no `?sort=`) puts P0 first via the default tie-breaker
    // chain. aria-sort starts as 'none' because the user has not picked a col.
    const severityHeader = screen.getByTestId('sortable-header-severity');
    expect(severityHeader).toHaveAttribute('aria-sort', 'none');
    expect(rowTitlesInOrder()).toEqual(['Finding 2', 'Finding 1', 'Finding 3']);

    const trigger = within(severityHeader).getByRole('button');

    // 1st click → desc (P0 first). aria-sort = descending.
    fireEvent.click(trigger);
    expect(severityHeader).toHaveAttribute('aria-sort', 'descending');
    expect(rowTitlesInOrder()).toEqual(['Finding 2', 'Finding 1', 'Finding 3']);

    // 2nd click → asc (P3 first).
    fireEvent.click(trigger);
    expect(severityHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(rowTitlesInOrder()).toEqual(['Finding 3', 'Finding 1', 'Finding 2']);

    // 3rd click → none (back to default order).
    fireEvent.click(trigger);
    expect(severityHeader).toHaveAttribute('aria-sort', 'none');
    expect(rowTitlesInOrder()).toEqual(['Finding 2', 'Finding 1', 'Finding 3']);
  });

  it('writes filter + sort state back to the URL via router.replace (URL param sync)', () => {
    render(<FindingsTable auditId="run-1" findings={FINDINGS} />);

    // Click the severity header → desc — should call router.replace with
    // ?sort=severity:desc on the same pathname.
    const trigger = within(screen.getByTestId('sortable-header-severity')).getByRole(
      'button',
    );
    fireEvent.click(trigger);

    expect(replaceMock).toHaveBeenCalled();
    const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall.startsWith('/audits/run-1/findings')).toBe(true);
    expect(lastCall).toContain('sort=severity%3Adesc');

    // Toggle a severity chip → severities should serialize into the URL too.
    // The P0 chip in the filter sidebar uses aria-pressed; click it.
    const p0Chip = screen.getByRole('button', { name: 'P0' });
    fireEvent.click(p0Chip);

    const afterFilter = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(afterFilter).toContain('sev=P0');
    // Sort param survives across the filter change (no clobber).
    expect(afterFilter).toContain('sort=severity%3Adesc');
  });
});
