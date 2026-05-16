// Behavioural tests for <DevPipelineBanner /> — the banner is only visible in
// non-production enqueue modes. We assert hidden/visible branches, ARIA roles
// for assistive tech, and that consumer-supplied `className` reaches the
// outer element. `.test.tsx` resolves to jsdom via vitest.config.ts.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DevPipelineBanner } from './dev-pipeline-banner';

describe('DevPipelineBanner — hidden states', () => {
  it('renders nothing when mode is cloud-tasks (production normal)', () => {
    const { container } = render(<DevPipelineBanner mode="cloud-tasks" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when mode is null (unknown / not loaded yet)', () => {
    const { container } = render(<DevPipelineBanner mode={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DevPipelineBanner — direct-worker (dev shortcut)', () => {
  it('renders an info status banner with Korean copy and role=status', () => {
    render(<DevPipelineBanner mode="direct-worker" />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(/개발 모드/);
    expect(status).toHaveTextContent(/워커 직접 호출/);
    expect(status).toHaveTextContent(/Cloud Tasks 우회/);
    // No alert role — this is informational, not blocking.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('DevPipelineBanner — stub (worker unconfigured)', () => {
  it('renders an assertive alert banner with Korean warning copy', () => {
    render(<DevPipelineBanner mode="stub" />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent(/워커 미연결/);
    expect(alert).toHaveTextContent(/환경변수 미설정/);
    expect(alert).toHaveTextContent(/Audit 실행 안 됨/);
    // role=status belongs only to the direct-worker variant.
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('DevPipelineBanner — className passthrough', () => {
  it('applies the consumer className to the outer element (direct-worker)', () => {
    render(
      <DevPipelineBanner mode="direct-worker" className="custom-margin-class" />
    );
    expect(screen.getByRole('status')).toHaveClass('custom-margin-class');
  });

  it('applies the consumer className to the outer element (stub)', () => {
    render(<DevPipelineBanner mode="stub" className="my-test-hook" />);
    expect(screen.getByRole('alert')).toHaveClass('my-test-hook');
  });
});
