// Behavioural tests for <ResourceStatePanel /> — renders each non-ready
// AuditResourceState variant. We pass props directly (no mocks) and assert
// rendered text + accessibility roles. The `.test.tsx` glob is matched to
// jsdom by `environmentMatchGlobs` in vitest.config.ts.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResourceStatePanel } from './resource-state-panel';

const AUDIT_ID = 'run-abc';

describe('ResourceStatePanel — loading variant', () => {
  it('renders skeleton placeholders and no card heading', () => {
    const { container } = render(
      <ResourceStatePanel state={{ status: 'loading' }} auditId={AUDIT_ID} />
    );
    // No h2 heading should appear in the loading variant.
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    // Two skeleton elements (aria-hidden divs) are rendered.
    const skeletons = container.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ResourceStatePanel — pending variant', () => {
  it('renders default Korean pending message and progress link to /audits/:id', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'pending', runStatus: 'RUNNING' }}
        auditId={AUDIT_ID}
      />
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /분석이 아직 진행 중입니다/ })
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /진행 화면/ });
    expect(link).toHaveAttribute('href', `/audits/${AUDIT_ID}`);
  });

  it('honors the pendingLabel override when provided', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'pending', runStatus: 'PENDING' }}
        auditId={AUDIT_ID}
        pendingLabel="리포트가 곧 준비됩니다."
      />
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /리포트가 곧 준비됩니다/ })
    ).toBeInTheDocument();
  });
});

describe('ResourceStatePanel — unauthorized variant', () => {
  it('renders 401/403 messaging with a /login link', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'unauthorized' }}
        auditId={AUDIT_ID}
      />
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /로그인이 필요합니다/ })
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /로그인/ });
    expect(link).toHaveAttribute('href', '/login');
  });
});

describe('ResourceStatePanel — not-found variant', () => {
  it('renders 404 messaging with a /audits/new CTA', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'not-found' }}
        auditId={AUDIT_ID}
      />
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /해당 감사 결과를 찾을 수 없습니다/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /새 감사를 시작/ })).toHaveAttribute(
      'href',
      '/audits/new'
    );
  });
});

describe('ResourceStatePanel — failed variant', () => {
  it('renders cancelled message when runStatus=CANCELLED', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'failed', runStatus: 'CANCELLED' }}
        auditId={AUDIT_ID}
      />
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /감사가 취소되었습니다/ })
    ).toBeInTheDocument();
  });

  it('renders failed message and exposes message text when supplied', () => {
    render(
      <ResourceStatePanel
        state={{
          status: 'failed',
          runStatus: 'FAILED',
          message: 'worker exited with code 137',
        }}
        auditId={AUDIT_ID}
      />
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /감사가 실패되었습니다/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/worker exited with code 137/)).toBeInTheDocument();
  });
});

describe('ResourceStatePanel — generic error variant', () => {
  it('renders the error fallback with the provided message', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'error', message: 'network down' }}
        auditId={AUDIT_ID}
      />
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /데이터를 불러오는 중 오류가 발생했습니다/,
      })
    ).toBeInTheDocument();
    expect(screen.getByText('network down')).toBeInTheDocument();
  });
});
