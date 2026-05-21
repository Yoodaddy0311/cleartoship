// Source-driven extraction Phase A3 — Route AST inventory (PRD §3.3).
//
// Structured snapshot of every page + API route in the audited repo, derived
// directly from the file tree without LLM. Today's `detect-features` step
// already discovers pages via file-glob heuristics, but the result is buried
// inside the wider `detectedFeatures` array and lacks segment-level
// information (dynamic params, route groups, catch-all). PR-A3 surfaces a
// dedicated `state.routeInventory` so the scoring step + the upcoming UI
// (feature graph view) can render an accurate "23 pages, 17 API endpoints,
// 4 of them dynamic" inventory.
//
// MVP coverage:
//   - Next.js App Router  (`app/**/page.tsx`, `app/**/route.ts`)
//   - Next.js Pages Router (`pages/**/*.tsx`, `pages/api/**/*.ts`)
//
// Phase-2 follow-up (PR-A3b):
//   - Express / Fastify / Hono handler AST scan (needs ts-morph dep)
//   - Vue / Remix / SvelteKit route extraction
//   - Import-graph + edge inference (<Link>, router.push, fetch)
//
// The Bucket is **D** (Deterministic). File-glob only — zero network, zero
// LLM, sub-second wall-clock for repos under 100K files.

import { z } from 'zod';

/**
 * Which framework convention the route came from. UI / scoring may want to
 * weight `app` higher than `pages` (App Router is the newer Next.js default)
 * or treat `unknown` as a partial signal that needs follow-up parsing.
 */
export const RouteFrameworkSchema = z.enum([
  'next-app', // Next.js App Router (app/**/page.tsx)
  'next-pages', // Next.js Pages Router (pages/**/*.tsx)
  'next-app-api', // Next.js App Router API (app/**/route.ts)
  'next-pages-api', // Next.js Pages Router API (pages/api/**/*.ts)
  // Reserved for PR-A3b:
  'express',
  'fastify',
  'hono',
  'unknown',
]);
export type RouteFramework = z.infer<typeof RouteFrameworkSchema>;

export const RouteSegmentKindSchema = z.enum([
  'static', // /users
  'dynamic', // /users/[id]
  'catchAll', // /docs/[...slug]
  'optionalCatchAll', // /docs/[[...slug]]
  'group', // /(marketing) — Next.js route group, not URL-visible
]);
export type RouteSegmentKind = z.infer<typeof RouteSegmentKindSchema>;

export const RouteSegmentSchema = z.object({
  /** Raw segment text as it appears in the file path, sans brackets. */
  name: z.string(),
  kind: RouteSegmentKindSchema,
});
export type RouteSegment = z.infer<typeof RouteSegmentSchema>;

export const RouteEntrySchema = z.object({
  /**
   * URL-style path for the route, normalised across conventions:
   *   app/users/[id]/page.tsx  → "/users/[id]"
   *   pages/users/[id].tsx     → "/users/[id]"
   *   app/(marketing)/about/page.tsx → "/about"  (groups are dropped)
   *   pages/index.tsx          → "/"
   * Trailing slash is omitted (except the root "/").
   */
  urlPath: z.string(),
  /** Detected framework convention. */
  framework: RouteFrameworkSchema,
  /** API vs page — drives counts in the report. */
  type: z.enum(['page', 'api']),
  /** Source file relative to the cloned repo root. */
  sourceFile: z.string(),
  /** Per-segment metadata so the UI can highlight dynamic / catch-all paths. */
  segments: z.array(RouteSegmentSchema),
  /** Convenience flags derived from segments. */
  hasDynamic: z.boolean(),
  hasCatchAll: z.boolean(),
  /**
   * For App Router API routes: which HTTP methods the file exports
   * (GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD). Unknown for non-App-Router or
   * when the file couldn't be statically read; empty array means we tried
   * and found no exports.
   */
  exportedMethods: z.array(z.string()).optional(),
});
export type RouteEntry = z.infer<typeof RouteEntrySchema>;

export const RouteInventorySchema = z.object({
  /** All discovered routes, deduplicated by `urlPath + type`. */
  routes: z.array(RouteEntrySchema),
  /**
   * Per-framework counts so the UI can render the "23 pages (App Router) +
   * 5 pages (Pages Router) + 17 API endpoints" breakdown without
   * re-aggregating downstream.
   */
  counts: z.object({
    pages: z.number().int().nonnegative(),
    apis: z.number().int().nonnegative(),
    dynamic: z.number().int().nonnegative(),
    byFramework: z.record(RouteFrameworkSchema, z.number().int().nonnegative()),
  }),
  /** `true` when at least one Next.js route was found. */
  hasNextJs: z.boolean(),
  /**
   * `true` when the repo has no recognised routes at all. UI uses this to
   * surface "이 프로젝트는 라우트 없음" instead of an N/A.
   */
  isEmpty: z.boolean(),
});
export type RouteInventory = z.infer<typeof RouteInventorySchema>;

export const EMPTY_ROUTE_INVENTORY: RouteInventory = {
  routes: [],
  counts: {
    pages: 0,
    apis: 0,
    dynamic: 0,
    byFramework: {},
  },
  hasNextJs: false,
  isEmpty: true,
};
