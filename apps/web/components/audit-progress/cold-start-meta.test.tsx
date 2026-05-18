// Tests for ColdStartMeta — pure ETA/poll helpers + render integration.

import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { AuditStep } from '@cleartoship/shared-types';

vi.mock('@cleartoship/ui', () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('@cleartoship/shared-types', () => ({
  AUDIT_STEPS: [
    'VALIDATE_INPUT',
    'CLONE_REPO',
    'RUN_STATIC_ANALYSIS',
    'GENERATE_REPORT',
    'CLEANUP',
  ] as const,
}));

const {
  ColdStartMeta,
  estimateRemainingSec,
  nextPollDelayMs,
} = await import('./cold-start-meta.js');

const CLONE = 'CLONE_REPO' as unknown as AuditStep;
const CLEANUP = 'CLEANUP' as unknown as AuditStep;

describe('estimateRemainingSec', () => {
  it('returns null for terminal states', () => {
    expect(estimateRemainingSec(CLONE, 'COMPLETED', undefined, 0)).toBeNull();
    expect(estimateRemainingSec(CLONE, 'FAILED', undefined, 0)).toBeNull();
    expect(estimateRemainingSec(CLONE, 'CANCELLED', undefined, 0)).toBeNull();
  });

  it('returns cold-start budget when no current step yet', () => {
    expect(estimateRemainingSec(null, 'PENDING', undefined, 0)).toBe(30);
  });

  it('shrinks remaining time as elapsed grows', () => {
    const startedAt = '2026-05-17T00:00:00.000Z';
    const baseline = estimateRemainingSec(CLONE, 'RUNNING', startedAt, Date.parse(startedAt));
    const later = estimateRemainingSec(
      CLONE,
      'RUNNING',
      startedAt,
      Date.parse(startedAt) + 60_000,
    );
    expect(baseline).toBeGreaterThan(0);
    expect(later).toBeLessThan(baseline!);
  });

  it('returns small remainder on near-final step (CLEANUP)', () => {
    const remaining = estimateRemainingSec(CLEANUP, 'RUNNING', undefined, 0);
    expect(remaining).toBeGreaterThanOrEqual(1);
    expect(remaining).toBeLessThanOrEqual(5);
  });
});

describe('nextPollDelayMs', () => {
  it('uses 2s cadence in the first 30 seconds', () => {
    expect(nextPollDelayMs(0)).toBe(2_000);
    expect(nextPollDelayMs(15_000)).toBe(2_000);
    expect(nextPollDelayMs(29_999)).toBe(2_000);
  });

  it('backs off to 5s after the 30s threshold', () => {
    expect(nextPollDelayMs(30_001)).toBe(5_000);
    expect(nextPollDelayMs(120_000)).toBe(5_000);
  });
});

describe('ColdStartMeta rendering', () => {
  afterEach(() => cleanup());

  it('renders ETA, auto-refresh hint, and manual refresh button while running', () => {
    render(
      <ColdStartMeta
        currentStep={null}
        status="PENDING"
        startedAtIso={undefined}
        mountedAtMs={0}
        onManualRefresh={() => {}}
        nowMs={500}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/예상 완료/)).toBeInTheDocument();
    expect(screen.getByText(/자동 갱신/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /새로고침/ })).toBeInTheDocument();
  });

  it('returns null when status is terminal (no DOM noise after completion)', () => {
    const { container } = render(
      <ColdStartMeta
        currentStep={CLEANUP}
        status="COMPLETED"
        startedAtIso={undefined}
        mountedAtMs={0}
        onManualRefresh={() => {}}
        nowMs={0}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('invokes onManualRefresh on button click', () => {
    const onRefresh = vi.fn();
    render(
      <ColdStartMeta
        currentStep={null}
        status="PENDING"
        startedAtIso={undefined}
        mountedAtMs={0}
        onManualRefresh={onRefresh}
        nowMs={0}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
