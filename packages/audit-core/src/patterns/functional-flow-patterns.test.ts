import { describe, it, expect } from 'vitest';
import type {
  RouteEntry,
  RouteFramework,
  RouteInventory,
} from '@cleartoship/shared-types';
import {
  scoreFunctionalFlow,
  type FunctionalFlowSignals,
} from './functional-flow-patterns.js';

/**
 * Build a minimal RouteEntry from a urlPath. `type` and `framework` are derived
 * sensibly; `dynamic`/`hasCatchAll` come from bracket syntax in the path.
 */
function route(
  urlPath: string,
  type: RouteEntry['type'] = 'page',
  sourceFile?: string,
): RouteEntry {
  const hasDynamic = /\[[^\]]+\]/.test(urlPath);
  const hasCatchAll = /\[\.\.\./.test(urlPath);
  const framework: RouteFramework =
    type === 'api' ? 'next-app-api' : 'next-app';
  return {
    urlPath,
    framework,
    type,
    sourceFile: sourceFile ?? `app${urlPath === '/' ? '' : urlPath}/page.tsx`,
    segments: [],
    hasDynamic,
    hasCatchAll,
  };
}

/** Assemble a RouteInventory and recompute counts from the given routes. */
function inventory(routes: ReadonlyArray<RouteEntry>): RouteInventory {
  const pages = routes.filter((r) => r.type === 'page').length;
  const apis = routes.filter((r) => r.type === 'api').length;
  const dynamic = routes.filter((r) => r.hasDynamic).length;
  return {
    routes: [...routes],
    counts: { pages, apis, dynamic, byFramework: {} },
    hasNextJs: routes.length > 0,
    isEmpty: routes.length === 0,
  };
}

function run(
  routes: ReadonlyArray<RouteEntry>,
  extra: Partial<Omit<FunctionalFlowSignals, 'routeInventory'>> = {},
) {
  return scoreFunctionalFlow({ routeInventory: inventory(routes), ...extra });
}

/** A rich SaaS app: auth + onboarding + dynamic + api + account + error. */
const RICH: ReadonlyArray<RouteEntry> = [
  route('/'),
  route('/login'),
  route('/welcome'),
  route('/dashboard'),
  route('/projects/[id]'),
  route('/account/settings'),
  route('/api/projects', 'api'),
  route('/error', 'page', 'app/error.tsx'),
];

/** A flat brochure: only static marketing pages, no dynamic, no api. */
const FLAT: ReadonlyArray<RouteEntry> = [
  route('/'),
  route('/about'),
  route('/features'),
  route('/contact'),
];

describe('scoreFunctionalFlow', () => {
  it('returns null when there are no pages at all', () => {
    // API-only repo has no navigable flow surface.
    const r = run([route('/api/health', 'api')]);
    expect(r).toBeNull();
  });

  it('returns null on a fully empty inventory', () => {
    const r = run([]);
    expect(r).toBeNull();
  });

  it('scores a rich app high (75–100) with origin D', () => {
    const r = run(RICH);
    expect(r).not.toBeNull();
    expect(r!.score).toBeGreaterThanOrEqual(75);
    expect(r!.score).toBeLessThanOrEqual(100);
    expect(r!.origin).toBe('D');
  });

  it('is HIGH confidence (≥5 patterns evaluated)', () => {
    expect(run(RICH)!.confidence).toBe('HIGH');
  });

  it('scores a flat brochure lower than a rich app, in the 40–50 band', () => {
    const flat = run(FLAT)!;
    const rich = run(RICH)!;
    expect(flat.score).toBeLessThan(rich.score);
    expect(flat.score).toBeGreaterThanOrEqual(40);
    expect(flat.score).toBeLessThanOrEqual(50);
  });

  it('flags FF-flat-only (RISK) for static-only pages', () => {
    const r = run(FLAT)!;
    const risk = r.matched.find((m) => m.patternId === 'FF-flat-only');
    expect(risk).toBeDefined();
    expect(risk!.scoreImpact).toBeLessThan(0);
  });

  it('does NOT flag FF-flat-only when dynamic routes exist', () => {
    const r = run([route('/'), route('/posts/[slug]')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-flat-only')).toBe(false);
  });

  it('does NOT flag FF-flat-only when an API route exists', () => {
    const r = run([route('/'), route('/api/x', 'api')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-flat-only')).toBe(false);
  });

  it('matches FF-dynamic-flow when dynamic routes are present', () => {
    const r = run([route('/'), route('/users/[id]')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-dynamic-flow')).toBe(true);
  });

  it('matches FF-api-backed when API routes are present', () => {
    const r = run([route('/'), route('/api/data', 'api')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-api-backed')).toBe(true);
  });

  it('matches FF-auth-flow via a login route path', () => {
    const r = run([route('/'), route('/login')])!;
    const auth = r.matched.find((m) => m.patternId === 'FF-auth-flow');
    expect(auth).toBeDefined();
    expect(auth!.evidence).toContain('route');
  });

  it('matches FF-auth-flow via hasAuthGuard even with no auth path', () => {
    const r = run([route('/'), route('/home')], { hasAuthGuard: true })!;
    const auth = r.matched.find((m) => m.patternId === 'FF-auth-flow');
    expect(auth).toBeDefined();
    expect(auth!.evidence).toContain('auth_guard');
  });

  it('does NOT match FF-auth-flow with neither path nor guard', () => {
    const r = run([route('/'), route('/about')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-auth-flow')).toBe(false);
  });

  it('matches FF-onboarding for a welcome/onboarding route', () => {
    const r = run([route('/'), route('/getting-started')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-onboarding')).toBe(true);
  });

  it('matches FF-checkout for commerce paths', () => {
    const cart = run([route('/'), route('/cart')])!;
    const pricing = run([route('/'), route('/pricing')])!;
    expect(cart.matched.some((m) => m.patternId === 'FF-checkout')).toBe(true);
    expect(pricing.matched.some((m) => m.patternId === 'FF-checkout')).toBe(true);
  });

  it('matches FF-account for post-auth surface paths', () => {
    const r = run([route('/'), route('/profile')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-account')).toBe(true);
  });

  it('detects FF-error-handling via an error route urlPath', () => {
    const r = run([route('/'), route('/error', 'page', 'app/error.tsx')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-error-handling')).toBe(true);
  });

  it('detects FF-error-handling via a not-found sourceFile basename', () => {
    // urlPath is "/" but the source file is the Next.js not-found convention.
    const r = run([route('/'), route('/x', 'page', 'app/not-found.tsx')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-error-handling')).toBe(true);
  });

  it('does case-insensitive matching on flow paths', () => {
    const r = run([route('/'), route('/Login'), route('/Checkout')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-auth-flow')).toBe(true);
    expect(r.matched.some((m) => m.patternId === 'FF-checkout')).toBe(true);
  });

  it('does not infer auth from an API-only auth path (page surface required)', () => {
    // /api/auth is an API route, not a navigable auth page.
    const r = run([route('/'), route('/api/auth', 'api')])!;
    expect(r.matched.some((m) => m.patternId === 'FF-auth-flow')).toBe(false);
  });
});
