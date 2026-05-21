import { describe, it, expect } from 'vitest';
import {
  extractPagesRouterRoutes,
  pickPagesRouterFiles,
} from './next-pages-router.js';

describe('pickPagesRouterFiles', () => {
  it('extracts segments and isApi flag', () => {
    const tree = [
      'pages/index.tsx',
      'pages/about.tsx',
      'pages/users/[id].tsx',
      'pages/api/auth.ts',
    ];
    const picked = pickPagesRouterFiles(tree);
    expect(picked).toHaveLength(4);
    const index = picked.find((f) => f.relPath === 'pages/index.tsx')!;
    expect(index.segments).toEqual([]);
    expect(index.isApi).toBe(false);
    const userId = picked.find((f) => f.relPath === 'pages/users/[id].tsx')!;
    expect(userId.segments).toEqual(['users', '[id]']);
  });

  it('skips Next.js special files', () => {
    const tree = [
      'pages/_app.tsx',
      'pages/_document.tsx',
      'pages/_error.tsx',
      'pages/_middleware.ts',
      'pages/real.tsx',
    ];
    const picked = pickPagesRouterFiles(tree);
    expect(picked.map((f) => f.relPath)).toEqual(['pages/real.tsx']);
  });

  it('skips test files', () => {
    const tree = ['pages/api/health.test.ts', 'pages/api/health.spec.ts', 'pages/api/health.ts'];
    const picked = pickPagesRouterFiles(tree);
    expect(picked.map((f) => f.relPath)).toEqual(['pages/api/health.ts']);
  });

  it('finds nested pages directories (monorepo)', () => {
    const tree = ['apps/web/pages/index.tsx', 'apps/admin/pages/dashboard.tsx'];
    const picked = pickPagesRouterFiles(tree);
    expect(picked).toHaveLength(2);
  });
});

describe('extractPagesRouterRoutes', () => {
  it('maps file tree to RouteEntry[] with framework + type', () => {
    const tree = [
      'pages/index.tsx',
      'pages/about.tsx',
      'pages/users/[id].tsx',
      'pages/api/auth.ts',
    ];
    const routes = extractPagesRouterRoutes('/repo', tree);
    expect(routes).toHaveLength(4);

    const index = routes.find((r) => r.urlPath === '/')!;
    expect(index.framework).toBe('next-pages');
    expect(index.type).toBe('page');
    expect(index.hasDynamic).toBe(false);

    const userId = routes.find((r) => r.urlPath === '/users/[id]')!;
    expect(userId.framework).toBe('next-pages');
    expect(userId.hasDynamic).toBe(true);

    const apiAuth = routes.find((r) => r.urlPath === '/api/auth')!;
    expect(apiAuth.framework).toBe('next-pages-api');
    expect(apiAuth.type).toBe('api');
    expect(apiAuth.exportedMethods).toEqual([]);
  });

  it('handles catch-all routes', () => {
    const tree = ['pages/docs/[...slug].tsx'];
    const routes = extractPagesRouterRoutes('/repo', tree);
    expect(routes[0]!.urlPath).toBe('/docs/[...slug]');
    expect(routes[0]!.hasCatchAll).toBe(true);
    expect(routes[0]!.hasDynamic).toBe(true);
  });
});
