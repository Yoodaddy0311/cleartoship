import { describe, it, expect } from 'vitest';
import { buildRouteInventory } from './build-route-inventory.js';

describe('buildRouteInventory', () => {
  it('returns EMPTY_ROUTE_INVENTORY for an empty tree', async () => {
    const inv = await buildRouteInventory('/repo', []);
    expect(inv.isEmpty).toBe(true);
    expect(inv.routes).toEqual([]);
    expect(inv.hasNextJs).toBe(false);
  });

  it('aggregates App + Pages router into one inventory', async () => {
    const tree = [
      'app/page.tsx',
      'app/users/[id]/page.tsx',
      'app/api/health/route.ts',
      'pages/legacy.tsx',
      'pages/api/old.ts',
    ];
    const inv = await buildRouteInventory('/repo', tree);
    expect(inv.isEmpty).toBe(false);
    expect(inv.hasNextJs).toBe(true);
    expect(inv.counts.pages).toBe(3);
    expect(inv.counts.apis).toBe(2);
    expect(inv.counts.dynamic).toBe(1);
    expect(Object.keys(inv.counts.byFramework).sort()).toEqual([
      'next-app',
      'next-app-api',
      'next-pages',
      'next-pages-api',
    ]);
  });

  it('dedupes overlapping App + Pages routes (App wins)', async () => {
    const tree = [
      'app/users/page.tsx', // /users (App)
      'pages/users.tsx', //    /users (Pages — should lose)
    ];
    const inv = await buildRouteInventory('/repo', tree);
    expect(inv.counts.pages).toBe(1);
    expect(inv.routes[0]!.framework).toBe('next-app');
  });
});
