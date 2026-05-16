// Progress timeline tests — sibling-located on purpose.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AuditStep } from '@cleartoship/shared-types';

vi.mock('@cleartoship/ui', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@cleartoship/shared-types', () => ({
  AUDIT_STEPS: ['ingest', 'analyze', 'report'] as const,
}));

vi.mock('@/lib/i18n/ko', () => ({
  AUDIT_STEP_LABELS: {
    ingest: '수집',
    analyze: '분석',
    report: '리포트',
  },
}));

const { ProgressTimeline } = await import('./progress-timeline.js');

// The vi.mock above replaces the runtime AUDIT_STEPS with a simplified
// 3-step list, but TypeScript still sees the real UPPER_SNAKE AuditStep
// union. Cast the mock-only string literal so the test compiles.
const MOCK_ANALYZE = 'analyze' as unknown as AuditStep;

describe('ProgressTimeline', () => {
  it('renders all step labels in an ordered list with a11y label', () => {
    render(<ProgressTimeline currentStep={MOCK_ANALYZE} status="RUNNING" />);
    expect(screen.getByLabelText('감사 단계 진행').tagName).toBe('OL');
    expect(screen.getByText('수집')).toBeInTheDocument();
    expect(screen.getByText('분석')).toBeInTheDocument();
    expect(screen.getByText('리포트')).toBeInTheDocument();
  });

  it('marks the current step with aria-current="step"', () => {
    render(<ProgressTimeline currentStep={MOCK_ANALYZE} status="RUNNING" />);
    const current = screen.getByText('분석').closest('li');
    expect(current).toHaveAttribute('aria-current', 'step');
  });

  it('treats every step as done when status is COMPLETED', () => {
    render(<ProgressTimeline currentStep={null} status="COMPLETED" />);
    const items = screen.getAllByRole('listitem');
    items.forEach((li) => {
      expect(li).not.toHaveAttribute('aria-current');
    });
  });
});
