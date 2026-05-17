// T2.5-FU #139 — diff route behavioural tests.
//
// Mocks the data-fetching API surface and verifies the four branches:
//   1. previousRunId missing → "no baseline" empty state
//   2. previousRunId present → DiffView mounts and computes a real diff
//   3. previous report is 404 (BLOCKED prior run) → still renders DiffView,
//      previousScore=null but currentScore/currFindings flow through
//   4. error from getAuditRun bubbles to ResourceStatePanel

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ApiHttpError } from '@/lib/api/client';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'run-2' }),
}));

vi.mock('@/lib/api/audit-runs', () => ({
  getAuditRun: vi.fn(),
  getReport: vi.fn(),
  listFindings: vi.fn(),
}));

describe('DiffPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "no baseline" empty state when run.previousRunId is missing', async () => {
    const { getAuditRun, getReport, listFindings } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-2',
      partialResultTools: [],
    } as never);
    // Will explode if called — the page must short-circuit on no-baseline.
    vi.mocked(getReport).mockRejectedValue(new Error('should not be called'));
    vi.mocked(listFindings).mockRejectedValue(
      new Error('should not be called')
    );

    const { default: DiffPage } = await import('./page');
    render(<DiffPage />);

    await waitFor(() => {
      expect(screen.getByTestId('diff-no-baseline')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/첫 감사라 비교 대상이 없습니다/)
    ).toBeInTheDocument();
    expect(vi.mocked(getReport)).not.toHaveBeenCalled();
    expect(vi.mocked(listFindings)).not.toHaveBeenCalled();
  });

  it('renders DiffView with computed diff when previousRunId is present', async () => {
    const { getAuditRun, getReport, listFindings } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-2',
      partialResultTools: [],
      previousRunId: 'run-1',
    } as never);
    vi.mocked(getReport).mockImplementation(async (id: string) => {
      if (id === 'run-1') {
        return {
          readinessScore: 60,
          launchStatus: 'NEEDS_WORK',
          executiveSummary: 'prev',
          categoryScores: [],
          severityCounts: { P0: 1, P1: 0, P2: 0, P3: 0 },
        } as never;
      }
      return {
        readinessScore: 80,
        launchStatus: 'READY',
        executiveSummary: 'curr',
        categoryScores: [],
        severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
      } as never;
    });
    vi.mocked(listFindings).mockImplementation(async (id: string) => {
      if (id === 'run-1') {
        return {
          findings: [
            {
              id: 'f-old',
              title: 'Old finding resolved',
              category: 'SECURITY_PRIVACY',
              severity: 'P1',
              confidence: 'HIGH',
              status: 'OPEN',
              summary: 's',
              recommendation: 'r',
              evidenceCount: 0,
            },
          ],
          nextCursor: null,
        } as never;
      }
      return {
        findings: [
          {
            id: 'f-new',
            title: 'New finding appeared',
            category: 'FRONTEND_CODE',
            severity: 'P2',
            confidence: 'HIGH',
            status: 'OPEN',
            summary: 's',
            recommendation: 'r',
            evidenceCount: 0,
          },
        ],
        nextCursor: null,
      } as never;
    });

    const { default: DiffPage } = await import('./page');
    render(<DiffPage />);

    await waitFor(() => {
      expect(screen.getByTestId('diff-view')).toBeInTheDocument();
    });
    // Previous run id is rendered in the diff header.
    expect(screen.getByTestId('diff-view')).toHaveTextContent(/run-1/);
    // Both finding-change rows are present (one added, one removed).
    expect(screen.getByTestId('diff-finding-added-f-new')).toBeInTheDocument();
    expect(
      screen.getByTestId('diff-finding-removed-f-old')
    ).toBeInTheDocument();
    // Verified fetcher hit the previous run too — both reports + both
    // findings pages, not just the current run.
    expect(vi.mocked(getReport)).toHaveBeenCalledWith('run-1');
    expect(vi.mocked(getReport)).toHaveBeenCalledWith('run-2');
    expect(vi.mocked(listFindings)).toHaveBeenCalledWith('run-1', {
      limit: 200,
    });
    expect(vi.mocked(listFindings)).toHaveBeenCalledWith('run-2', {
      limit: 200,
    });
  });

  it('tolerates 404 on previous report (BLOCKED prior run) and still mounts DiffView', async () => {
    const { getAuditRun, getReport, listFindings } = await import(
      '@/lib/api/audit-runs'
    );
    vi.mocked(getAuditRun).mockResolvedValue({
      id: 'run-2',
      partialResultTools: [],
      previousRunId: 'run-1',
    } as never);
    vi.mocked(getReport).mockImplementation(async (id: string) => {
      if (id === 'run-1') {
        throw new ApiHttpError({ status: 404, code: 'NOT_FOUND', message: 'not found' });
      }
      return {
        readinessScore: 80,
        launchStatus: 'READY',
        executiveSummary: 'curr',
        categoryScores: [],
        severityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
      } as never;
    });
    vi.mocked(listFindings).mockImplementation(async (id: string) => {
      if (id === 'run-1') {
        throw new ApiHttpError({ status: 404, code: 'NOT_FOUND', message: 'not found' });
      }
      return { findings: [], nextCursor: null } as never;
    });

    const { default: DiffPage } = await import('./page');
    render(<DiffPage />);

    await waitFor(() => {
      expect(screen.getByTestId('diff-view')).toBeInTheDocument();
    });
    // previousScore is N/A; the diff view renders it as 'N/A → 80' via
    // ScoreDeltaPanel — anchor on the score-panel testid + content.
    expect(screen.getByTestId('diff-score-panel')).toHaveTextContent(/N\/A/);
    expect(screen.getByTestId('diff-score-panel')).toHaveTextContent(/80/);
  });

  it('surfaces fetch errors via ResourceStatePanel', async () => {
    const { getAuditRun } = await import('@/lib/api/audit-runs');
    vi.mocked(getAuditRun).mockRejectedValue(new Error('boom'));

    const { default: DiffPage } = await import('./page');
    render(<DiffPage />);

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생/)).toBeInTheDocument();
    });
  });
});
