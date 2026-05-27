# Audit Pattern Library — Functional Flow

> Implements Audit Quality Roadmap §5.2 / §5.3 / §7.1 for the **FUNCTIONAL_FLOW** category.
> Code: `packages/audit-core/src/patterns/functional-flow-patterns.ts`
> Scoring engine: `packages/audit-core/src/patterns/score-from-patterns.ts`

## Overview

**What it measures** — how rich a project's navigable *flow surface* looks: does
it have parameterized (stateful) pages, server-backed API routes, an
authentication flow, first-run onboarding, a commerce/checkout funnel, a
post-auth account surface, and graceful error/not-found handling? More of these
signals means a more complete product experience rather than a thin static site.

**Why it matters** — FUNCTIONAL_FLOW previously got only the coarse Phase 1.3
inventory *baseline* (a flat 50 when pages + dynamic routes existed, in
`inventory-scoring.ts`). That number could not distinguish a four-page brochure
from a full SaaS app with auth, billing, and dashboards. This Pattern-Library
score **supersedes that baseline** with a deterministic, per-pattern breakdown
so the founder sees *which* flows are present.

**Honesty caveat (important)** — every pattern here is a **URL-path heuristic**.
A route named `/checkout` implies a checkout *intent*; it is **not proof the
checkout flow actually works**. This category rates how complete the flow surface
*looks* from route names + counts, not whether any individual flow is correct or
bug-free. Treat it as "the product appears to have these flows," never as "these
flows pass." Functional correctness is out of scope for a No-LLM, no-content-read
deterministic pass.

**Scoring logic** — every pattern is inferable from the route inventory's URL
paths + counts (+ one optional `hasAuthGuard` flag the worker derives from
`detectedFeatures`). No file-content reading, no LLM, no network — so the score
origin is always `'D'` (deterministic). If the repo has **no pages at all**, the
scorer returns `null` and the category honestly stays `N/A` ("no navigable flow
surface") instead of emitting a misleading 50.

Signal source (`FunctionalFlowSignals`):
- `routeInventory` — `state.routeInventory` (`RouteInventory`): `routes[].urlPath`,
  `routes[].sourceFile`, and `counts.{ pages, apis, dynamic }` (primary source).
- `hasAuthGuard?` — `true` when `detectedFeatures` contains an `auth_guard` node.

Flow-path matching is **case-insensitive** and (except where the count is used
directly) restricted to `type === 'page'` routes, since flows are navigable by a
user. Error detection also inspects the route's `sourceFile` basename to catch
the Next.js `error.tsx` / `not-found.tsx` conventions whose `urlPath` is not
descriptive.

## Patterns

The category returns `null` (N/A) when `counts.pages === 0`: a repo with no pages
has no navigable flow to score.

### Pattern 1: FF-dynamic-flow
**When to suspect**: the product has parameterized, stateful pages (detail views, per-entity routes).
**Test (deterministic signal)**: `counts.dynamic > 0`.
**Validation**: matched when at least one dynamic route exists.
**Score impact**: +12

### Pattern 2: FF-api-backed
**When to suspect**: flows are backed by server actions / data endpoints, not purely static.
**Test (deterministic signal)**: `counts.apis > 0`.
**Validation**: matched when at least one API route exists.
**Score impact**: +10

### Pattern 3: FF-auth-flow
**When to suspect**: the product gates content behind authentication.
**Test (deterministic signal)**: `hasAuthGuard === true` OR a **page** `urlPath` matches `(login|signin|sign-in|auth|register)` (case-insensitive).
**Validation**: matched when either holds. (An `/api/auth` route alone does NOT match — a navigable auth page or the guard flag is required.)
**Score impact**: +12

### Pattern 4: FF-onboarding
**When to suspect**: there is a first-run / setup experience for new users.
**Test (deterministic signal)**: a **page** `urlPath` matches `(onboard|welcome|getting-started|signup|sign-up|setup)`.
**Validation**: matched when such a page exists.
**Score impact**: +8

### Pattern 5: FF-checkout
**When to suspect**: there is a commerce / conversion funnel.
**Test (deterministic signal)**: a **page** `urlPath` matches `(checkout|cart|payment|billing|pricing|subscribe)`.
**Validation**: matched when such a page exists.
**Score impact**: +10

### Pattern 6: FF-account
**When to suspect**: there is a post-auth surface (settings, profile, dashboard).
**Test (deterministic signal)**: a **page** `urlPath` matches `(account|profile|settings|dashboard)`.
**Validation**: matched when such a page exists.
**Score impact**: +8

### Pattern 7: FF-error-handling
**When to suspect**: the app handles errors / missing routes gracefully.
**Test (deterministic signal)**: any route whose `urlPath` OR `sourceFile` basename matches `(error|not-found|404|500)` (catches Next.js `error.tsx` / `not-found.tsx`).
**Validation**: matched when such a route exists.
**Score impact**: +8

### Pattern 8: FF-flat-only (RISK)
**When to suspect**: the project is a thin brochure — static pages only, no stateful or server-backed flow.
**Test (deterministic signal)**: `counts.dynamic === 0` AND `counts.apis === 0` AND `counts.pages > 0`.
**Validation**: matched (negative) when all conditions hold.
**Score impact**: −10

## Score formula

```
score = clamp( 50
  + FF-dynamic-flow     +12
  + FF-api-backed       +10
  + FF-auth-flow        +12
  + FF-onboarding        +8
  + FF-checkout         +10
  + FF-account           +8
  + FF-error-handling    +8
  + FF-flat-only        -10   (risk)
, 0, 100 )
```

Unmatched patterns contribute 0 (absence is neutral; the risk pattern models the
penalty explicitly). Confidence is `HIGH` because 8 patterns are always evaluated
for any repo with pages.

**Calibration**
- Rich app (auth + dynamic + api + account, e.g. a SaaS dashboard): `50 + 12 + 10
  + 12 + 8 = 92`, rising toward a clamped 100 once onboarding / checkout / error
  signals are added — lands in the 75–90+ "rich product" band.
- Flat brochure (static pages only, no dynamic, no API): `50 − 10 = 40` — in the
  40–50 "thin / brochure-only" band.
- Baseline (pages exist but no other signal yet evaluated): 50.

Remember the honesty caveat above: these bands describe how *complete the flow
surface looks*, not whether the flows are implemented correctly.
