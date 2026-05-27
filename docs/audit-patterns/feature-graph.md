# Audit Pattern Library — Feature Graph

> Implements Audit Quality Roadmap §5.2 / §5.3 for the **FEATURE_GRAPH** category.
> Code: `packages/audit-core/src/patterns/feature-graph-patterns.ts`
> Scoring engine: `packages/audit-core/src/patterns/score-from-patterns.ts`

## Overview

**What it measures** — the structural richness and connectedness of a project's
feature graph: how many routes it exposes, whether it has a backend/API surface,
whether routes are parameterized (dynamic), how deep the page-tree hierarchy
goes, and — crucially — whether the pages are *connected* by navigation
(Link/router) edges or sit isolated. A mixed App+Pages router convention is a
small positive signal of a maturing Next.js codebase.

**Why it matters** — Phase 1.3 (`inventory-scoring.ts`) gave FEATURE_GRAPH a
coarse inventory *baseline* (50 by 1–5 routes, 70 by >5 routes). That baseline is
**superseded by this Pattern Library whenever routes are present**: raw route
count alone can't tell a flat 6-page brochure from a deep, dynamic, connected
app. This module weighs the *shape* of the graph (depth, API surface, dynamic
routes, Link-edge connectivity) so a rich connected app lands ~75–90 while a
tiny flat one stays near the 50 baseline (~50–56).

**Scoring logic** — every pattern is a deterministic check over
`state.routeInventory` plus two optional feature counts the worker already has
(`featureNodeCount` = `detectedFeatures.length`, `featureEdgeCount` = sum of
`detectedFeatures[].edges.length`). No file-content reading, no LLM, no network,
so the score origin is always `'D'` (deterministic). If there is **no graph at
all** (zero routes AND zero feature nodes), the scorer returns `null` and the
category honestly stays `N/A` ("no feature graph detected") instead of emitting
a misleading 50.

Signal source (`FeatureGraphSignals`):
- `routeInventory` — `state.routeInventory` (primary source: routes + counts).
- `featureNodeCount?` — `detectedFeatures.length` (graph existence gate only).
- `featureEdgeCount?` — sum of `detectedFeatures[].edges.length` (connectivity).

## Patterns

The category is gated by graph existence: zero routes AND zero feature nodes →
`null` (N/A). Page-tree depth is computed per route from `segments` (route groups
excluded) or, as a fallback, from the normalised `urlPath` split on `/`.

### Pattern 1: FG-route-count
**When to suspect**: a navigable surface exists; more routes = a richer product.
**Test (deterministic signal)**: `routeInventory.routes.length`.
**Validation**: matched when count ≥ 1. Impact scales: `1–5` → modest, `> 5` → rich.
**Score impact**: +6 / +14

### Pattern 2: FG-api-surface
**When to suspect**: the product has its own backend, not just static pages.
**Test (deterministic signal)**: `counts.apis > 0`.
**Validation**: matched when at least one API route exists.
**Score impact**: +8

### Pattern 3: FG-dynamic-routes
**When to suspect**: routes are parameterized (`/users/[id]`) → data-driven pages.
**Test (deterministic signal)**: `counts.dynamic > 0`.
**Validation**: matched when at least one dynamic route exists.
**Score impact**: +6

### Pattern 4: FG-page-depth
**When to suspect**: a deep page tree implies a richer feature hierarchy than a flat list.
**Test (deterministic signal)**: max segment depth across routes (groups excluded; root `/` = 0).
**Validation**: matched when depth ≥ 2. Impact scales: depth `2` → small, `≥ 3` → deep.
**Score impact**: +4 / +8

### Pattern 5: FG-graph-edges
**When to suspect**: pages are connected by navigation (the §4.3 "Link edges" signal).
**Test (deterministic signal)**: `featureEdgeCount` (Link/nav edges between feature nodes).
**Validation**: matched when edge count > 0. Impact scales: `1–2` → +4, `3–7` → +8, `≥ 8` → +12.
**Score impact**: +4 / +8 / +12

### Pattern 6: FG-multi-framework
**When to suspect**: a codebase mixes App Router + Pages Router (migrating/maturing).
**Test (deterministic signal)**: `Object.keys(counts.byFramework).length > 1`.
**Validation**: matched when more than one route convention is present.
**Score impact**: +4

### Pattern 7: FG-disconnected (RISK)
**When to suspect**: many pages exist but none are linked → a likely disconnected graph (orphan pages).
**Test (deterministic signal)**: `counts.pages ≥ 5` AND `featureEdgeCount === 0`.
**Validation**: matched (negative) only when both hold. A small page surface or any edges → never matched (avoids false positives on simple or genuinely linked apps).
**Score impact**: −10

## Score formula

```
score = clamp( 50
  + FG-route-count       (+6 | +14 by count)
  + FG-api-surface        +8
  + FG-dynamic-routes     +6
  + FG-page-depth        (+4 | +8 by depth)
  + FG-graph-edges       (+4 | +8 | +12 by edge count)
  + FG-multi-framework    +4
  + FG-disconnected      -10   (risk, only when ≥5 pages and 0 edges)
, 0, 100 )
```

Unmatched patterns contribute 0 (absence is neutral; the risk pattern models the
penalty explicitly). Confidence is `HIGH` because 7 patterns are always
evaluated for any repo that has a graph.

**Calibration**
- Rich connected app (>5 routes + APIs + dynamic + 3-deep tree + 9 edges):
  `50 + 14 + 8 + 6 + 8 + 12 = 98 → clamped` — lands in the 75–90+ "healthy" band
  even with a subset of these signals.
- Tiny flat app (one shallow `/` page, no API/dynamic/edges):
  `50 + 6 = 56` — the "thin/flat" band (only `FG-route-count`'s modest tier
  applies; every graph-shape positive is absent).
- Disconnected smell (≥5 unlinked pages): `50 + 14 − 10 = 54` minus any missing
  positives — pulled down below a connected equivalent, surfacing the orphan-page
  risk.
