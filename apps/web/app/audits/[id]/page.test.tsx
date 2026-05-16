// Behavioural test for the audit-progress page.
//
// Drives the three render branches by mocking `useAuditRunPolling`. The
// COMPLETED-redirect branch additionally asserts that the next/navigation
// `useRouter().push` mock was invoked with the dashboard path after the 600ms
// celebrate delay.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// Hoisted router push spy so each `useRouter()` call returns the same object.
const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/components/audit-progress/use-audit-run-polling', () => ({
  useAuditRunPolling: vi.fn(() => ({ data: null, loading: true, error: null })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

// Stub the timeline component; its details aren't part of this page's contract.
vi.mock('@/components/audit-progress/progress-timeline', () => ({
  ProgressTimeline: () => <div data-stub="progress-timeline" />,
}));

describe('AuditProgressPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('shows loading state while data is null and loading=true', async () => {
    const { useAuditRunPolling } = await import(
      '@/components/audit-progress/use-audit-run-polling'
    );
    vi.mocked(useAuditRunPolling).mockReturnValue({
      data: null,
      loading: true,
      error: null,
    });

    const { default: AuditProgressPage } = await import('./page');
    render(<AuditProgressPage params={{ id: 'run-1' }} />);

    // "진행 중" can appear in both the visible Progress label and aria-label;
    // assert ≥1 match rather than the brittle singular `getByText`.
    expect(screen.getAllByText(/진행 중/).length).toBeGreaterThan(0);
  });

  it('redirects to /audits/:id/dashboard when status === COMPLETED', async () => {
    vi.useFakeTimers();
    try {
      const { useAuditRunPolling } = await import(
        '@/components/audit-progress/use-audit-run-polling'
      );
      vi.mocked(useAuditRunPolling).mockReturnValue({
        data: {
          id: 'run-1',
          status: 'COMPLETED',
          progress: 100,
          currentStep: null,
        } as never,
        loading: false,
        error: null,
      });

      const { default: AuditProgressPage } = await import('./page');
      render(<AuditProgressPage params={{ id: 'run-1' }} />);

      // The page schedules a 600ms setTimeout before pushing.
      act(() => {
        vi.advanceTimersByTime(700);
      });

      expect(pushMock).toHaveBeenCalledWith('/audits/run-1/dashboard');
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders fetch-error panel when error !== null && data === null', async () => {
    const { useAuditRunPolling } = await import(
      '@/components/audit-progress/use-audit-run-polling'
    );
    vi.mocked(useAuditRunPolling).mockReturnValue({
      data: null,
      loading: false,
      error: 'boom',
    });

    const { default: AuditProgressPage } = await import('./page');
    render(<AuditProgressPage params={{ id: 'run-1' }} />);

    expect(
      screen.getByText(/진행 상태를 불러오지 못했습니다/)
    ).toBeInTheDocument();
  });
});
