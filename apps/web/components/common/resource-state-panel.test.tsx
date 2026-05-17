// Behavioural tests for <ResourceStatePanel /> — renders each non-ready
// AuditResourceState variant. We pass props directly (no mocks) and assert
// rendered text + accessibility roles. The `.test.tsx` glob is matched to
// jsdom by `environmentMatchGlobs` in vitest.config.ts.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResourceStatePanel, PartialResultBanner } from './resource-state-panel';

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

  it('falls back to the generic pending body when emptyContext is omitted (regression guard)', () => {
    // The default branch must stay intact for existing call sites that mount
    // ResourceStatePanel without context — otherwise we change rendered copy
    // on every audit detail page.
    render(
      <ResourceStatePanel
        state={{ status: 'pending', runStatus: 'RUNNING' }}
        auditId={AUDIT_ID}
      />
    );
    expect(
      screen.getByText(/완료되면 결과가 자동으로 표시됩니다/)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('empty-context-message')).toBeNull();
  });
});

describe('ResourceStatePanel — pending variant with emptyContext', () => {
  it('renders unsupported-framework guidance with the detected framework name', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'pending', runStatus: 'RUNNING' }}
        auditId={AUDIT_ID}
        emptyContext={{
          reason: 'unsupported-framework',
          detectedFramework: 'Remix',
        }}
      />
    );
    const message = screen.getByTestId('empty-context-message');
    expect(message).toHaveTextContent(/Next\.js \/ Vite/);
    expect(message).toHaveTextContent(/Remix/);
    expect(screen.getByText(/다음에 할 수 있는 일/)).toBeInTheDocument();
  });

  it('falls back to "알 수 없음" when detectedFramework is omitted', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'pending', runStatus: 'RUNNING' }}
        auditId={AUDIT_ID}
        emptyContext={{ reason: 'unsupported-framework' }}
      />
    );
    expect(screen.getByTestId('empty-context-message')).toHaveTextContent(
      /감지된 프레임워크: 알 수 없음/
    );
  });

  it('renders no-deploy-url guidance with a "새 감사" CTA', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'pending', runStatus: 'RUNNING' }}
        auditId={AUDIT_ID}
        emptyContext={{ reason: 'no-deploy-url' }}
      />
    );
    expect(screen.getByTestId('empty-context-message')).toHaveTextContent(
      /배포 URL이 없어서 성능\/접근성 측정은 생략됐어요/
    );
    expect(screen.getByRole('link', { name: /새 감사를 시작/ })).toHaveAttribute(
      'href',
      '/audits/new'
    );
  });

  it('renders pipeline-not-reached guidance with a progress-screen CTA', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'pending', runStatus: 'RUNNING' }}
        auditId={AUDIT_ID}
        emptyContext={{ reason: 'pipeline-not-reached' }}
      />
    );
    expect(screen.getByTestId('empty-context-message')).toHaveTextContent(
      /아직 이 단계에 도달하지 않았어요/
    );
    expect(screen.getByRole('link', { name: /진행 화면/ })).toHaveAttribute(
      'href',
      `/audits/${AUDIT_ID}`
    );
  });

  it('falls back to the generic pending body for reason="unknown"', () => {
    render(
      <ResourceStatePanel
        state={{ status: 'pending', runStatus: 'RUNNING' }}
        auditId={AUDIT_ID}
        emptyContext={{ reason: 'unknown' }}
      />
    );
    expect(
      screen.getByText(/완료되면 결과가 자동으로 표시됩니다/)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('empty-context-message')).toBeNull();
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

// S6-03: PartialResultBanner — surfaces missing-tool degradation in a
// non-developer-friendly two-row layout (summary + collapsible details +
// optional deploy-URL hint for lighthouse-class tools).
describe('PartialResultBanner — warn variant', () => {
  it('renders nothing when toolNames is empty', () => {
    const { container } = render(<PartialResultBanner toolNames={[]} />);
    // Empty toolNames → no DOM output at all.
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('partial-result-banner')).toBeNull();
  });

  it('renders the summary count with the number of skipped tools', () => {
    render(
      <PartialResultBanner toolNames={['semgrep', 'osv-scanner', 'lighthouse']} />
    );
    const banner = screen.getByTestId('partial-result-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId('partial-result-summary')).toHaveTextContent(
      /3개 검사가 이번 분석에서 빠졌어요/
    );
  });

  it('uses role="status" (informational), not "alert"', () => {
    render(<PartialResultBanner toolNames={['semgrep']} />);
    const banner = screen.getByTestId('partial-result-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });

  it('expands per-tool friendly descriptions inside <details>', () => {
    render(
      <PartialResultBanner toolNames={['semgrep', 'osv-scanner', 'gitleaks']} />
    );
    expect(
      screen.getByText(/코드 패턴 검사 \(semgrep\)/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/의존성 보안 검사 \(osv-scanner\)/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/시크릿 검사 \(gitleaks\)/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/분석 환경 설정 문제이며 결과 신뢰도에 큰 영향이 없습니다/)
    ).toBeInTheDocument();
  });

  it('renders the deploy-URL hint when lighthouse is among the skipped tools', () => {
    render(<PartialResultBanner toolNames={['lighthouse']} />);
    const hint = screen.getByTestId('partial-result-deploy-hint');
    expect(hint).toHaveTextContent(/배포 URL을 입력하시면/);
    expect(hint).toHaveTextContent(
      /사이트 성능\/접근성도 측정해드릴게요/
    );
    expect(screen.getByRole('link', { name: /새 감사/ })).toHaveAttribute(
      'href',
      '/audits/new'
    );
  });

  it('renders the deploy-URL hint for the lighthouse-axe variant too', () => {
    render(<PartialResultBanner toolNames={['lighthouse-axe']} />);
    expect(
      screen.getByTestId('partial-result-deploy-hint')
    ).toBeInTheDocument();
  });

  it('omits the deploy-URL hint when no lighthouse-class tool is missing', () => {
    render(<PartialResultBanner toolNames={['semgrep', 'gitleaks']} />);
    expect(screen.queryByTestId('partial-result-deploy-hint')).toBeNull();
  });

  it('falls back to the raw tool name for unknown tools', () => {
    render(<PartialResultBanner toolNames={['mystery-tool']} />);
    // Unknown tools render their raw name (no friendly label wrapper).
    expect(screen.getByText(/mystery-tool/)).toBeInTheDocument();
  });
});
