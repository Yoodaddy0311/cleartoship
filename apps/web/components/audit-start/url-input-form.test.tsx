// Behavioural test for <UrlInputForm />.
//
// Covers the four interaction branches that gate audit-run creation:
//   1. submit disabled while anonymous-auth bootstrap is initializing
//   2. zod validation errors surface inline when the GitHub URL is malformed
//   3. ApiHttpError.message from createAuditRun is surfaced in the alert region
//   4. successful createAuditRun navigates to /audits/:id via router.push

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hoisted spies — `useEnsureAnonymousAuth` is re-imported per test via
// vi.mocked() so we can vary its return value.
const pushMock = vi.fn();

vi.mock('@/lib/firebase/auth-init', () => ({
  useEnsureAnonymousAuth: vi.fn(() => ({
    user: { uid: 'anon-1' },
    uid: 'anon-1',
    initializing: false,
    error: null,
  })),
}));

vi.mock('@/lib/api/audit-runs', () => ({
  createAuditRun: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('UrlInputForm', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // `clearAllMocks` resets call history but not `mockReturnValue` overrides
    // from prior tests, so re-pin the default auth state explicitly.
    const { useEnsureAnonymousAuth } = await import('@/lib/firebase/auth-init');
    vi.mocked(useEnsureAnonymousAuth).mockReturnValue({
      user: { uid: 'anon-1' },
      uid: 'anon-1',
      initializing: false,
      error: null,
    } as never);
  });

  it('exports a UrlInputForm React component', async () => {
    const mod = await import('./url-input-form');
    expect(typeof mod.UrlInputForm).toBe('function');
  });

  it('disables submit while auth.initializing is true', async () => {
    const { useEnsureAnonymousAuth } = await import(
      '@/lib/firebase/auth-init'
    );
    vi.mocked(useEnsureAnonymousAuth).mockReturnValue({
      user: null,
      uid: null,
      initializing: true,
      error: null,
    } as never);

    const { UrlInputForm } = await import('./url-input-form');
    render(<UrlInputForm />);

    const submit = screen.getByRole('button', { name: /인증 준비 중/ });
    expect(submit).toBeDisabled();
  });

  it('shows zod validation errors for invalid GitHub URL', async () => {
    const user = userEvent.setup();
    const { UrlInputForm } = await import('./url-input-form');
    render(<UrlInputForm />);

    const repoInput = screen.getByLabelText(/GitHub 저장소 URL/);
    await user.type(repoInput, 'https://example.com/not-github');

    const submit = screen.getByRole('button', { name: '감사 시작' });
    await user.click(submit);

    await waitFor(() => {
      expect(
        screen.getByText(/올바른 GitHub URL을 입력해주세요/)
      ).toBeInTheDocument();
    });
  });

  it('surfaces ApiHttpError message in the inline error region', async () => {
    const user = userEvent.setup();
    const { createAuditRun } = await import('@/lib/api/audit-runs');
    const { ApiHttpError } = await import('@/lib/api/client');
    vi.mocked(createAuditRun).mockRejectedValue(
      new ApiHttpError({
        status: 500,
        code: 'UNKNOWN',
        message: 'Server is on fire',
      })
    );

    const { UrlInputForm } = await import('./url-input-form');
    render(<UrlInputForm />);

    await user.type(
      screen.getByLabelText(/GitHub 저장소 URL/),
      'https://github.com/user/repo'
    );
    await user.click(screen.getByRole('button', { name: '감사 시작' }));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.some((el) => el.textContent === 'Server is on fire')).toBe(
        true
      );
    });
  });

  it('navigates to /audits/:id on successful createAuditRun', async () => {
    const user = userEvent.setup();
    const { createAuditRun } = await import('@/lib/api/audit-runs');
    vi.mocked(createAuditRun).mockResolvedValue({
      auditRunId: 'run-42',
    } as never);

    const { UrlInputForm } = await import('./url-input-form');
    render(<UrlInputForm />);

    await user.type(
      screen.getByLabelText(/GitHub 저장소 URL/),
      'https://github.com/user/repo'
    );
    await user.click(screen.getByRole('button', { name: '감사 시작' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/audits/run-42');
    });
  });
});
