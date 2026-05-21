import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractAppRouterRoutes,
  pickAppRouterFiles,
} from './next-app-router.js';

describe('pickAppRouterFiles', () => {
  it('detects page and route files', () => {
    const tree = [
      'app/page.tsx',
      'app/users/page.tsx',
      'app/users/[id]/page.tsx',
      'app/api/health/route.ts',
      'app/api/users/[id]/route.ts',
    ];
    const picked = pickAppRouterFiles(tree);
    expect(picked).toHaveLength(5);
    expect(picked.filter((f) => !f.isApi)).toHaveLength(3);
    expect(picked.filter((f) => f.isApi)).toHaveLength(2);
  });

  it('finds nested app directories (monorepo)', () => {
    const tree = ['apps/web/app/page.tsx', 'apps/admin/app/dashboard/page.tsx'];
    const picked = pickAppRouterFiles(tree);
    expect(picked).toHaveLength(2);
  });

  it('ignores non-page non-route files inside app/', () => {
    const tree = [
      'app/page.tsx',
      'app/layout.tsx',
      'app/loading.tsx',
      'app/users/profile.tsx',
    ];
    const picked = pickAppRouterFiles(tree);
    expect(picked).toHaveLength(1);
    expect(picked[0]!.relPath).toBe('app/page.tsx');
  });
});

describe('extractAppRouterRoutes', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'app-router-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('builds RouteEntry[] with correct urlPath + segment metadata', async () => {
    const tree = [
      'app/page.tsx',
      'app/users/page.tsx',
      'app/users/[id]/page.tsx',
      'app/(marketing)/about/page.tsx',
      'app/docs/[...slug]/page.tsx',
    ];
    const routes = await extractAppRouterRoutes(tmpDir, tree);
    const byUrl = Object.fromEntries(routes.map((r) => [r.urlPath, r]));

    expect(byUrl['/']).toBeDefined();
    expect(byUrl['/users']).toBeDefined();
    expect(byUrl['/users/[id]']!.hasDynamic).toBe(true);

    // Route group '(marketing)' is dropped from the URL but the static
    // child remains.
    expect(byUrl['/about']).toBeDefined();
    expect(byUrl['/about']!.segments.some((s) => s.kind === 'group')).toBe(true);

    expect(byUrl['/docs/[...slug]']!.hasCatchAll).toBe(true);
  });

  it('extracts exportedMethods for App Router API routes', async () => {
    const apiDir = path.join(tmpDir, 'app', 'api', 'health');
    await fsp.mkdir(apiDir, { recursive: true });
    await fsp.writeFile(
      path.join(apiDir, 'route.ts'),
      `export async function GET() {}
export async function POST() {}
export const DELETE = async () => {};
`,
      'utf8'
    );
    const routes = await extractAppRouterRoutes(tmpDir, ['app/api/health/route.ts']);
    expect(routes).toHaveLength(1);
    const r = routes[0]!;
    expect(r.framework).toBe('next-app-api');
    expect(r.type).toBe('api');
    expect(r.exportedMethods?.sort()).toEqual(['DELETE', 'GET', 'POST']);
  });

  it('tolerates missing route files (returns empty methods)', async () => {
    // The file tree lists a route file but it doesn't exist on disk —
    // simulates a stale fileTree. The extractor must not throw.
    const routes = await extractAppRouterRoutes(tmpDir, [
      'app/api/missing/route.ts',
    ]);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.exportedMethods).toEqual([]);
  });
});
