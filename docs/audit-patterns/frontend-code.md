# Audit Pattern Library — Frontend Code

> Implements Audit Quality Roadmap §5.2 / §5.3 for the **FRONTEND_CODE** category.
> Code: `packages/audit-core/src/patterns/frontend-code-patterns.ts`
> Scoring engine: `packages/audit-core/src/patterns/score-from-patterns.ts`

## Overview

**What it measures** — the structural health of a project's frontend code: are
there reusable components, are they organized (a `components/` dir, custom
hooks), is styling modular (CSS modules / Tailwind) rather than one giant global
stylesheet, is there a design-system signal (Storybook / stories), and are
components tested? It also flags two risk smells (global-CSS-only, monolithic
pages).

**Why it matters** — FRONTEND_CODE was previously `N/A` (no pipeline step
produced a score). A vibe-coded UI that is one 2,000-line `App.jsx` with a single
`styles.css` is materially less ship-ready than a componentized, typed, tested
frontend. This category surfaces that difference deterministically.

**Scoring logic** — every pattern is inferable from the cloned repo's **file
tree (POSIX paths) alone** — no file-content reading, no LLM, no network. So the
score origin is always `'D'` (deterministic). Two optional corroborating counts
(`componentFeatureCount`, `pageCount`) are used only where the path tree cannot
express the signal. If the repo has **no** component/JSX/SFC files at all, the
scorer returns `null` and the category honestly stays `N/A` ("no frontend
detected") instead of emitting a misleading 50.

Signal source (`FrontendCodeSignals`):
- `fileTree` — `state.fileTree`, repo-relative POSIX paths (primary source).
- `componentFeatureCount?` — count of `detectedFeatures` with `type === 'component'`.
- `pageCount?` — `routeInventory.counts.pages`.

## Patterns

A component **source file** = `*.tsx` / `*.jsx` / `*.vue` / `*.svelte`, excluding
`*.test.*`, `*.spec.*`, `*.stories.*`, Next.js route files
(`page`/`layout`/`route`/`template`/`loading`/`error`/`not-found`), and anything
under `pages/`. This shared definition gates the whole category: zero component
files → `null` (N/A).

### Pattern 1: FE-component-files
**When to suspect**: a frontend exists at all; more reusable components is healthier.
**Test (deterministic signal)**: count component source files (definition above).
**Validation**: matched when count > 0. Impact scales: `< 4` → small, `4–11` → mid, `≥ 12` → large.
**Score impact**: +6 / +10 / +14

### Pattern 2: FE-components-dir
**When to suspect**: components are grouped, not scattered ad-hoc.
**Test (deterministic signal)**: any path segment equals `components` (e.g. `src/components/...`).
**Validation**: matched when such a directory exists.
**Score impact**: +6

### Pattern 3: FE-hooks
**When to suspect**: logic is extracted into reusable React hooks rather than inlined.
**Test (deterministic signal)**: a file named `use[A-Z]*.{ts,tsx}` OR a `hooks/` directory.
**Validation**: matched when either is present.
**Score impact**: +6

### Pattern 4: FE-typescript-adoption
**When to suspect**: typed frontend is more maintainable than loose JS.
**Test (deterministic signal)**: `.tsx` files outnumber `.jsx` files OR a `tsconfig.json` exists.
**Validation**: matched when either condition holds.
**Score impact**: +8

### Pattern 5: FE-css-modularity
**When to suspect**: scoped/utility styling instead of one global stylesheet.
**Test (deterministic signal)**: any `*.module.{css,scss,sass,less}` OR a `tailwind.config.*`.
**Validation**: matched when either is present.
**Score impact**: +8

### Pattern 6: FE-design-system
**When to suspect**: the team invests in a documented, reusable UI layer.
**Test (deterministic signal)**: a `.storybook/` dir, any `*.stories.*` file, or a `ui/` / `design-system/` dir.
**Validation**: matched when any is present.
**Score impact**: +7

### Pattern 7: FE-test-colocation
**When to suspect**: components are tested, not just shipped.
**Test (deterministic signal)**: any `*.test.{tsx,jsx}` or `*.spec.{tsx,jsx}` file.
**Validation**: matched when such a file exists.
**Score impact**: +7

### Pattern 8: FE-global-css-only (RISK)
**When to suspect**: frontend exists but styling is one global stylesheet — a "one big CSS file" smell.
**Test (deterministic signal)**: ≥1 global stylesheet (`globals`/`styles`/`main`/`index`/`app`.{css,scss,…}), AND zero CSS modules, AND no Tailwind, AND ≤2 global stylesheets total.
**Validation**: matched (negative) when all conditions hold.
**Score impact**: −8

### Pattern 9: FE-monolithic-components (RISK)
**When to suspect**: a large page surface is served by very few components → pages are doing everything inline.
**Test (deterministic signal)**: `pageCount` supplied AND `pageCount ≥ 6` AND component files `< pageCount / 2`.
**Validation**: matched (negative) only when `pageCount` is available and the ratio holds. Absent `pageCount` → never matched (avoids false positives).
**Score impact**: −6

## Score formula

```
score = clamp( 50
  + FE-component-files       (+6 | +10 | +14 by count)
  + FE-components-dir         +6
  + FE-hooks                  +6
  + FE-typescript-adoption    +8
  + FE-css-modularity         +8
  + FE-design-system          +7
  + FE-test-colocation        +7
  + FE-global-css-only        -8   (risk)
  + FE-monolithic-components  -6   (risk, only if pageCount known)
, 0, 100 )
```

Unmatched patterns contribute 0 (absence is neutral; the risk patterns model the
penalty explicitly). Confidence is `HIGH` because ≥5 patterns are always
evaluated for any repo with frontend code.

**Calibration**
- Healthy modern frontend (React + TS + components/ + hooks + CSS modules/Tailwind
  + stories + tests): `50 + 10 + 6 + 6 + 8 + 8 + 7 + 7 = 102 → clamped 100`
  (lands in the 70–85+ "healthy" band even with a subset of these signals).
- Bare frontend (a couple JSX components + one global stylesheet, no TS): `50 + 6
  − 8 = 48` — in the 40–55 "bare/messy" band.
