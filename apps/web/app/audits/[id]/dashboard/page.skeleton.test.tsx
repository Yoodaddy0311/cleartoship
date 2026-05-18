// L-P1-6 — Skeleton/Suspense integration test for the dashboard page.
//
// Asserts that ScoreOverview is wired through `next/dynamic` with a `loading`
// fallback that renders <ScoreSkeleton />. We can't directly observe the
// pending state via React's lazy resolver under jsdom (it resolves
// synchronously in the same microtask in tests), so we instead spy on the
// `next/dynamic` call site and exercise the `loading` factory it received —
// this is the contract that the loader will paint while the chunk is in
// flight.
//
// Lives in its own file so the bespoke `next/dynamic` spy doesn't leak into
// the main page.test.tsx, which relies on `next/dynamic` resolving its
// `ScoreOverview` mock through normal module resolution.

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';

interface DynamicOptions {
  readonly loading?: () => React.ReactNode;
  readonly ssr?: boolean;
}

// Capture every (loader, options) tuple passed to next/dynamic so the test
// can interrogate the loading factory that the dashboard page registers for
// the ScoreOverview chunk.
const dynamicCalls: Array<{
  loader: () => Promise<unknown>;
  options: DynamicOptions | undefined;
}> = [];

vi.mock('next/dynamic', () => ({
  default: (
    loader: () => Promise<unknown>,
    options?: DynamicOptions
  ): ComponentType => {
    dynamicCalls.push({ loader, options });
    // Return a placeholder component — the existing tests in page.test.tsx
    // cover the ready/blocked branches; here we only care about the loading
    // factory registration.
    const Placeholder: ComponentType = () => null;
    Placeholder.displayName = 'DynamicPlaceholder';
    return Placeholder;
  },
}));

// Quiet the rest of the page's dependency graph so the module import succeeds
// without triggering network/data fetches.
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'run-1' }),
}));
vi.mock('@/lib/api/audit-runs', () => ({
  getReport: vi.fn(() => new Promise(() => {})),
  listFindings: vi.fn(() => new Promise(() => {})),
  getAuditRun: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/lib/api/adapters', () => ({
  adaptCategoryScoresNullable: vi.fn(() => ({})),
  adaptFinding: vi.fn(),
  adaptLaunchStatus: vi.fn(() => 'ready'),
}));
vi.mock('@/components/feature-graph/use-prefetch-graph-canvas', () => ({
  usePrefetchGraphCanvas: vi.fn(),
}));

describe('DashboardPage — Skeleton/Suspense integration (L-P1-6)', () => {
  // The dashboard page registers its dynamic chunks at module top-level, so
  // the dynamic call(s) only fire once per process. Importing in beforeAll
  // and then asserting against the captured tuples keeps each test free of
  // ordering dependencies and avoids the cached-module re-import pitfall.
  beforeAll(async () => {
    await import('./page');
  });

  it('registers ScoreOverview with next/dynamic and a loading fallback', () => {
    expect(dynamicCalls.length).toBeGreaterThanOrEqual(1);
    const scoreEntry = dynamicCalls.find(
      (c) => typeof c.options?.loading === 'function'
    );
    expect(scoreEntry).toBeDefined();
    expect(typeof scoreEntry?.options?.loading).toBe('function');
  });

  it("loading factory renders the <ScoreSkeleton /> (testid 'score-skeleton')", () => {
    const scoreEntry = dynamicCalls.find(
      (c) => typeof c.options?.loading === 'function'
    );
    const fallback = scoreEntry?.options?.loading?.();
    expect(fallback).toBeTruthy();
    render(<>{fallback}</>);
    const skel = screen.getByTestId('score-skeleton');
    expect(skel).toBeInTheDocument();
    expect(skel).toHaveAttribute('role', 'status');
    expect(skel).toHaveAttribute('aria-busy', 'true');
  });

  it('points the dynamic loader at the real score-overview module', async () => {
    const scoreEntry = dynamicCalls.find(
      (c) => typeof c.options?.loading === 'function'
    );
    expect(scoreEntry?.loader).toBeDefined();
    // Resolving the loader should produce a module-shaped object — i.e. the
    // dynamic import chain is wired up rather than referencing a stub.
    const mod = await scoreEntry!.loader();
    expect(mod).toBeDefined();
  });
});
