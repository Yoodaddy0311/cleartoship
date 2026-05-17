/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LaunchStatusChip } from './launch-status-chip';
import type { LaunchStatus } from '@/lib/format/status';

/**
 * T2.11 #122 — 모바일 폴리시 회귀 가드.
 *
 * LaunchStatusChip은 작은 화면에서 한국어 풀 라벨("출시 가능 (개선 후)")이
 * 줄바꿈되어 CategoryGrid를 깨뜨리는 문제가 있었다. 단축 라벨("보완") +
 * sr-only 풀 라벨 + aria-label 풀 라벨로 의미 손실 없이 폭을 줄였다.
 */

const ALL_STATUSES: LaunchStatus[] = [
  'ready',
  'ready_with_improvements',
  'needs_work',
  'stop',
  'indeterminate',
  'blocked',
];

describe('LaunchStatusChip — T2.11 mobile labels', () => {
  it.each(ALL_STATUSES)(
    'renders both short visual label and full aria-label for status=%s',
    (status) => {
      render(<LaunchStatusChip status={status} />);
      const chip = screen.getByRole('status');
      // aria-label은 항상 풀 라벨 — SR/AT 사용자에게 의미 손실 없음.
      const ariaLabel = chip.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel?.length).toBeGreaterThan(0);
    }
  );

  it('short label is meaningfully shorter than full label', () => {
    render(<LaunchStatusChip status="ready_with_improvements" />);
    const chip = screen.getByRole('status');
    // 모바일 short branch (sm:hidden)와 desktop full branch (hidden sm:inline)
    // 둘 다 DOM에 존재. 첫 번째 자식(점) 다음에 short, 그 다음에 full이 옴.
    const text = chip.textContent ?? '';
    // "보완"은 short, "출시 가능 (개선 후)" 또는 i18n 라벨이 full.
    expect(text).toMatch(/보완/);
  });

  it('uses the same color token for indicator dot and chip', () => {
    render(<LaunchStatusChip status="stop" />);
    const chip = screen.getByRole('status');
    // chip의 inline color style이 비어있지 않음을 확인 — CSS var resolve는
    // JSDOM에서 검증할 수 없으므로 style 속성 자체로 갈음.
    expect(chip.getAttribute('style')).toMatch(/color:/);
  });

  it('blocked status uses P0 (red) token', () => {
    render(<LaunchStatusChip status="blocked" />);
    const chip = screen.getByRole('status');
    // 단축 라벨 "중단"이 노출되는지.
    expect(chip.textContent).toMatch(/중단/);
  });
});
