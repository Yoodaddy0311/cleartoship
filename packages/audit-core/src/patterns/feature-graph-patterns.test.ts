import { describe, it, expect } from 'vitest';
import type {
  RouteInventory,
  RouteEntry,
  RouteFramework,
  RouteSegment,
} from '@cleartoship/shared-types';
import {
  scoreFeatureGraph,
  type FeatureGraphSignals,
} from './feature-graph-patterns.js';

/**
 * Build one RouteEntry whose urlPath depth derives from `urlPath`.
 * Segments mirror the path so `routeDepth` works via either source.
 */
function makeRoute(
  urlPath: string,
  type: 'page' | 'api',
  framework: RouteFramework,
  hasDynamic = false,
): RouteEntry {
  const parts = urlPath.split('/').filter((s) => s.length > 0);
  const segments: RouteSegment[] = parts.map((name) => ({
    name,
    kind: name.startsWith('[') ? 'dynamic' : 'static',
  }));
  return {
    urlPath,
    framework,
    type,
    sourceFile: `app${urlPath === '/' ? '' : urlPath}/${type === 'api' ? 'route.ts' : 'page.tsx'}`,
    segments,
    hasDynamic,
    hasCatchAll: false,
  };
}

interface BuildOpts {
  readonly pages?: ReadonlyArray<string>; // urlPaths of page routes
  readonly apis?: ReadonlyArray<string>; // urlPaths of api routes
  readonly dynamicPaths?: ReadonlyArray<string>; // page urlPaths flagged dynamic
  readonly frameworks?: ReadonlyArray<RouteFramework>; // override per-route framework
}

/** Build a RouteInventory from page/api urlPaths with derived counts. */
function makeInventory(opts: BuildOpts = {}): RouteInventory {
  const {
    pages = [],
    apis = [],
    dynamicPaths = [],
    frameworks,
  } = opts;
  const dynSet = new Set(dynamicPaths);
  const pageRoutes = pages.map((p, i) =>
    makeRoute(p, 'page', frameworks?.[i] ?? 'next-app', dynSet.has(p)),
  );
  const apiRoutes = apis.map((p) =>
    makeRoute(p, 'api', 'next-app-api', dynSet.has(p)),
  );
  const routes = [...pageRoutes, ...apiRoutes];
  const byFramework: Record<string, number> = {};
  for (const r of routes) {
    byFramework[r.framework] = (byFramework[r.framework] ?? 0) + 1;
  }
  const dynamic = routes.filter((r) => r.hasDynamic).length;
  return {
    routes,
    counts: {
      pages: pageRoutes.length,
      apis: apiRoutes.length,
      dynamic,
      byFramework: byFramework as RouteInventory['counts']['byFramework'],
    },
    hasNextJs: routes.length > 0,
    isEmpty: routes.length === 0,
  };
}

function run(
  inventory: RouteInventory,
  extra: Partial<Omit<FeatureGraphSignals, 'routeInventory'>> = {},
) {
  return scoreFeatureGraph({ routeInventory: inventory, ...extra });
}

/** A rich, connected app: many deep routes + APIs + dynamic + edges. */
const RICH = makeInventory({
  pages: [
    '/',
    '/dashboard',
    '/dashboard/projects',
    '/dashboard/projects/[id]',
    '/settings/profile',
    '/blog/[slug]',
  ],
  apis: ['/api/users', '/api/projects/[id]'],
  dynamicPaths: ['/dashboard/projects/[id]', '/blog/[slug]', '/api/projects/[id]'],
});

/** A tiny flat app: one shallow page, nothing else. */
const FLAT = makeInventory({ pages: ['/'] });

describe('scoreFeatureGraph', () => {
  it('returns null when there is no graph at all (no routes, no nodes)', () => {
    expect(run(makeInventory())).toBeNull();
  });

  it('returns a score (not null) when feature nodes exist but no routes', () => {
    const r = run(makeInventory(), { featureNodeCount: 4, featureEdgeCount: 3 });
    expect(r).not.toBeNull();
    expect(r!.origin).toBe('D');
  });

  it('scores a rich connected app high (≥70)', () => {
    const r = run(RICH, { featureNodeCount: 6, featureEdgeCount: 9 })!;
    expect(r).not.toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.origin).toBe('D');
  });

  it('scores a tiny flat app low (≤56, no graph-shape positives)', () => {
    const r = run(FLAT)!;
    // Only FG-route-count (modest +6) matches: 50 + 6 = 56.
    expect(r.score).toBeLessThanOrEqual(56);
    expect(r.score).toBeLessThan(run(RICH, { featureEdgeCount: 9 })!.score);
  });

  it('is HIGH confidence (≥5 patterns always evaluated)', () => {
    expect(run(RICH, { featureEdgeCount: 5 })!.confidence).toBe('HIGH');
  });

  it('matches FG-route-count with rich impact for >5 routes', () => {
    const r = run(RICH)!;
    const p = r.matched.find((m) => m.patternId === 'FG-route-count');
    expect(p).toBeDefined();
    expect(p!.scoreImpact).toBe(14);
    expect(p!.evidence).toContain('rich surface');
  });

  it('matches FG-route-count with modest impact for 1–5 routes', () => {
    const r = run(makeInventory({ pages: ['/', '/about'] }))!;
    const p = r.matched.find((m) => m.patternId === 'FG-route-count');
    expect(p!.scoreImpact).toBe(6);
  });

  it('matches FG-api-surface only when apis > 0', () => {
    const withApi = run(makeInventory({ pages: ['/'], apis: ['/api/x'] }))!;
    const without = run(makeInventory({ pages: ['/'] }))!;
    expect(withApi.matched.some((m) => m.patternId === 'FG-api-surface')).toBe(true);
    expect(without.matched.some((m) => m.patternId === 'FG-api-surface')).toBe(false);
  });

  it('matches FG-dynamic-routes only when dynamic > 0', () => {
    const dyn = run(
      makeInventory({ pages: ['/u/[id]'], dynamicPaths: ['/u/[id]'] }),
    )!;
    const noDyn = run(makeInventory({ pages: ['/u'] }))!;
    expect(dyn.matched.some((m) => m.patternId === 'FG-dynamic-routes')).toBe(true);
    expect(noDyn.matched.some((m) => m.patternId === 'FG-dynamic-routes')).toBe(false);
  });

  it('matches FG-page-depth with deep impact for a ≥3-segment tree', () => {
    const deep = run(makeInventory({ pages: ['/a/b/c'] }))!;
    const p = deep.matched.find((m) => m.patternId === 'FG-page-depth');
    expect(p).toBeDefined();
    expect(p!.scoreImpact).toBe(8);
  });

  it('does NOT match FG-page-depth for a flat one-segment tree', () => {
    const flat = run(makeInventory({ pages: ['/about'] }))!;
    expect(flat.matched.some((m) => m.patternId === 'FG-page-depth')).toBe(false);
  });

  it('scales FG-graph-edges impact by edge count', () => {
    const few = run(RICH, { featureEdgeCount: 2 })!;
    const many = run(RICH, { featureEdgeCount: 10 })!;
    const fewEdge = few.matched.find((m) => m.patternId === 'FG-graph-edges')!;
    const manyEdge = many.matched.find((m) => m.patternId === 'FG-graph-edges')!;
    expect(fewEdge.scoreImpact).toBe(4);
    expect(manyEdge.scoreImpact).toBe(12);
    expect(many.score).toBeGreaterThan(few.score);
  });

  it('does NOT match FG-graph-edges when edge count is zero/absent', () => {
    const r = run(makeInventory({ pages: ['/', '/a'] }))!;
    expect(r.matched.some((m) => m.patternId === 'FG-graph-edges')).toBe(false);
  });

  it('matches FG-multi-framework only when >1 convention is present', () => {
    const mixed = run(
      makeInventory({
        pages: ['/a', '/b'],
        frameworks: ['next-app', 'next-pages'],
      }),
    )!;
    const single = run(makeInventory({ pages: ['/a', '/b'] }))!;
    expect(mixed.matched.some((m) => m.patternId === 'FG-multi-framework')).toBe(true);
    expect(single.matched.some((m) => m.patternId === 'FG-multi-framework')).toBe(false);
  });

  it('flags FG-disconnected (RISK) for ≥5 pages with 0 edges', () => {
    const r = run(
      makeInventory({ pages: ['/a', '/b', '/c', '/d', '/e'] }),
      { featureEdgeCount: 0 },
    )!;
    const risk = r.matched.find((m) => m.patternId === 'FG-disconnected');
    expect(risk).toBeDefined();
    expect(risk!.scoreImpact).toBeLessThan(0);
  });

  it('does NOT flag FG-disconnected when edges connect the pages', () => {
    const r = run(
      makeInventory({ pages: ['/a', '/b', '/c', '/d', '/e'] }),
      { featureEdgeCount: 4 },
    )!;
    expect(r.matched.some((m) => m.patternId === 'FG-disconnected')).toBe(false);
  });

  it('does NOT flag FG-disconnected for a small page surface with no edges', () => {
    const r = run(makeInventory({ pages: ['/a', '/b'] }))!;
    expect(r.matched.some((m) => m.patternId === 'FG-disconnected')).toBe(false);
  });
});
