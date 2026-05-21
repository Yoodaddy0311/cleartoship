// Top-level entry point for PR-A3: build the unified RouteInventory from
// a cloned repo's file tree.
//
// Aggregates Next.js App Router + Pages Router extractors, dedupes by
// (urlPath, type), counts pages/apis/dynamic, and reports per-framework
// totals. Designed to be called once per audit from a worker step (today:
// `step05-detect-features` or `step10-generate-feature-graph` — wired in
// the worker module, not here).
//
// Returns the EMPTY_ROUTE_INVENTORY when no recognised routes exist —
// the UI uses that to render "라우트 없음" instead of a misleading N/A.

import {
  EMPTY_ROUTE_INVENTORY,
  type RouteEntry,
  type RouteFramework,
  type RouteInventory,
} from '@cleartoship/shared-types';
import { extractAppRouterRoutes } from './next-app-router.js';
import { extractPagesRouterRoutes } from './next-pages-router.js';

function key(e: RouteEntry): string {
  return `${e.type}:${e.urlPath}`;
}

export async function buildRouteInventory(
  clonePath: string,
  fileTree: ReadonlyArray<string>
): Promise<RouteInventory> {
  const appRoutes = await extractAppRouterRoutes(clonePath, fileTree);
  const pagesRoutes = extractPagesRouterRoutes(clonePath, fileTree);

  // Dedupe across the two routers — if a repo has BOTH `app/users/page.tsx`
  // and `pages/users.tsx`, the App Router wins per Next.js's runtime
  // precedence. Iterate App routes first so the dedup map locks them in.
  const merged = new Map<string, RouteEntry>();
  for (const e of [...appRoutes, ...pagesRoutes]) {
    const k = key(e);
    if (!merged.has(k)) merged.set(k, e);
  }
  const routes = Array.from(merged.values());

  if (routes.length === 0) return EMPTY_ROUTE_INVENTORY;

  // Counts.
  const counts = {
    pages: 0,
    apis: 0,
    dynamic: 0,
    byFramework: {} as Partial<Record<RouteFramework, number>>,
  };
  for (const r of routes) {
    if (r.type === 'page') counts.pages += 1;
    else counts.apis += 1;
    if (r.hasDynamic) counts.dynamic += 1;
    counts.byFramework[r.framework] = (counts.byFramework[r.framework] ?? 0) + 1;
  }

  return {
    routes,
    counts: {
      pages: counts.pages,
      apis: counts.apis,
      dynamic: counts.dynamic,
      // Zod's schema accepts `Record<RouteFramework, number>` but we only set
      // the keys we actually counted — Partial-cast at the boundary so type
      // matches.
      byFramework: counts.byFramework as Record<RouteFramework, number>,
    },
    hasNextJs: true,
    isEmpty: false,
  };
}
