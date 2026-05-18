/// <reference types="@testing-library/jest-dom" />
// L-P1-6 — Skeleton placeholder behavioural tests.
//
// Scope per skeleton (3 describe blocks, one per Suspense fallback):
//   1. data-testid renders on the root wrapper (Suspense fallback contract).
//   2. a11y: role="status" + aria-busy="true" + non-empty aria-label (i18n).
//   3. wraps `@cleartoship/ui` Skeleton primitive children (animate-pulse
//      class — same shimmer surface the rest of the app uses).

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ShipVerdictSkeleton,
  ScoreSkeleton,
  NarrativeSkeleton,
} from './index';
import { t } from '@/lib/i18n';

describe('ShipVerdictSkeleton — L-P1-6', () => {
  it('renders its data-testid root so callers can target the Suspense fallback', () => {
    render(<ShipVerdictSkeleton />);
    expect(screen.getByTestId('ship-verdict-skeleton')).toBeInTheDocument();
  });

  it('exposes role=status + aria-busy=true + a non-empty i18n aria-label', () => {
    render(<ShipVerdictSkeleton locale="ko" />);
    const root = screen.getByTestId('ship-verdict-skeleton');
    expect(root).toHaveAttribute('role', 'status');
    expect(root).toHaveAttribute('aria-busy', 'true');
    expect(root).toHaveAttribute('aria-label', t('skeleton.loading.aria', 'ko'));
  });

  it('renders @cleartoship/ui Skeleton primitives (animate-pulse children)', () => {
    const { container } = render(<ShipVerdictSkeleton />);
    const pulses = container.querySelectorAll('.animate-pulse');
    // 1 large pill + 2 sub-text lines = 3 primitive children minimum.
    expect(pulses.length).toBeGreaterThanOrEqual(3);
  });
});

describe('ScoreSkeleton — L-P1-6', () => {
  it('renders its data-testid root so callers can target the Suspense fallback', () => {
    render(<ScoreSkeleton />);
    expect(screen.getByTestId('score-skeleton')).toBeInTheDocument();
  });

  it('exposes role=status + aria-busy=true + a non-empty i18n aria-label', () => {
    render(<ScoreSkeleton locale="en" />);
    const root = screen.getByTestId('score-skeleton');
    expect(root).toHaveAttribute('role', 'status');
    expect(root).toHaveAttribute('aria-busy', 'true');
    expect(root).toHaveAttribute('aria-label', t('skeleton.loading.aria', 'en'));
  });

  it('renders a circular gauge placeholder (rounded-full) + label primitive', () => {
    const { container } = render(<ScoreSkeleton />);
    // Gauge is the only rounded-full Skeleton primitive in this skeleton.
    expect(container.querySelector('.animate-pulse.rounded-full')).not.toBeNull();
    // Total Skeleton primitives = 2 (gauge + label).
    expect(container.querySelectorAll('.animate-pulse').length).toBe(2);
  });
});

describe('NarrativeSkeleton — L-P1-6', () => {
  it('renders its data-testid root so callers can target the Suspense fallback', () => {
    render(<NarrativeSkeleton />);
    expect(screen.getByTestId('narrative-skeleton')).toBeInTheDocument();
  });

  it('exposes role=status + aria-busy=true + a non-empty i18n aria-label', () => {
    render(<NarrativeSkeleton locale="ko" />);
    const root = screen.getByTestId('narrative-skeleton');
    expect(root).toHaveAttribute('role', 'status');
    expect(root).toHaveAttribute('aria-busy', 'true');
    expect(root).toHaveAttribute('aria-label', t('skeleton.loading.aria', 'ko'));
  });

  it('renders 3 line placeholders mirroring the 3-sentence narrative shape', () => {
    const { container } = render(<NarrativeSkeleton />);
    expect(container.querySelectorAll('.animate-pulse').length).toBe(3);
  });
});
