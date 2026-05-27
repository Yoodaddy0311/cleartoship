# Autopilot Session Report — Audit Quality Roadmap (Phases 1–3)

**Session**: ap-20260527-audit-quality-roadmap
**Mode**: default autopilot (Phase 0–6), thorough build, parallel sub-agents + per-phase cross-check
**Date**: 2026-05-27
**Branch**: `feat/audit-quality-phase1` (4 commits ahead of `main` @ b2d50a3)
**PRD**: `docs/PRD/audit-quality-roadmap-2026-05-26.md`

## 1. Summary

Implemented all three phases of the Audit Quality Roadmap (Claude-BugHunter
benchmarking). The user's ground-truth complaint — "너무 N/A가 많은거 아니야?
LLM을 쓰고 있는데" (7 of 12 categories N/A) — is resolved:

| Coverage | Before | After Phase 1 | After Phase 2 | After Phase 3 |
|---|---|---|---|---|
| Measured categories | 5/12 (42%) | 9/12 (75%) | 11/12 (92%, all D) | 12/12 (opt-in L for the last 2) |

The deterministic audit-worker now scores FEATURE_GRAPH, FUNCTIONAL_FLOW,
DATA_MODEL (Phase 1.3 inventory baselines), FRONTEND_CODE, MAINTAINABILITY
(Phase 2 Pattern Library), and emits a 7-Question Launch Gate verdict
(Phase 1.1). The two genuinely language-dependent categories (PRODUCT_INTENT,
REQUIREMENT_COVERAGE) are addressed by an opt-in Claude Code skill bundle
(Phase 3) that keeps the LLM **out** of the reproducible runtime pipeline.

## 2. Phase table

| Phase | Status | Output | Verify |
|---|---|---|---|
| 0 INTAKE | DONE | PRD already existed (#56) + prior-session memory read | — |
| 1 PLAN | DONE | decomposed into 1.1 / 1.2 / 1.3; identified shared-file (calculate-scores) coupling + PR-A4-fix tension | — |
| 2 EXECUTE | DONE | Phase 1 (gate + baselines + CVE), Phase 2 (Pattern Library), Phase 3 (skills). 4 sub-agents used for independent work | per-package CI |
| 3 CROSS_CHECK | DONE | read & re-verified every sub-agent file; ran CVE script on fixture; verified pattern docs ↔ code ID parity; proved web "failures" were pre-existing flakiness | — |
| 4 VERIFY | DONE | type-check 6/6; lint clean; shared-types 203 / audit-core 607 / worker 302 tests green; web green single-threaded | green |
| 5 IMPROVE | DONE | honest scope reconciliation (PR-A4-fix), dropped non-deterministic patterns rather than faking them, generalized baseline→pattern precedence | — |
| 6 REPORT | DONE | this file | — |

## 3. Commits (on `feat/audit-quality-phase1`, **pushed → PR #57**)

| SHA | Scope |
|---|---|
| `f2f572a` | Phase 1.1 + 1.3 — inventory baseline scoring + 7-Question Launch Gate (shared-types, audit-core, worker, web) |
| `4af4616` | Phase 1.2 — OSV/CISA KEV coverage refresh (Python stdlib script + weekly workflow) |
| `4f9e2a8` | Phase 2 — Pattern Library: score model + FRONTEND_CODE + MAINTAINABILITY detectors + docs |
| `222acd0` | Phase 3 — L-bucket skill bundle (4 skills) + architecture/contract doc |
| `b85a41a` | session report (this file) |
| `7a28028` | Phase 3 — D+L score blend (`blendScores`, §6.5) |
| `58f1417` | Phase 3 — async enrichment opt-in path (§6.6): `aiEnhanced` flag + enrichment schemas + `applyEnrichment` + form checkbox + dashboard merge |
| `0cc8eac` | Phase 3 — enrichment runner Cloud Run job (`workers/enrichment-worker`) + `functions` trigger + infra deploy |

PR: https://github.com/Yoodaddy0311/cleartoship/pull/57

## 4. What shipped, by phase

### Phase 1 — Quick Wins
- **1.3 Inventory→baseline** (`packages/audit-core/src/scoring/inventory-scoring.ts`): FEATURE_GRAPH 50/70 (route count), FUNCTIONAL_FLOW 50 (pages+dynamic), DATA_MODEL 60/75 (entity count). Reconciled with PR-A4-fix — a **modest floor** ("structure detected, quality not yet assessed"), never a free 100; findings only lower it; PRODUCT_INTENT/REQUIREMENT_COVERAGE deliberately untouched. Opt-in via the existing `inventories` input → 100% back-compat (76 prior calculate-scores tests unchanged).
- **1.1 7-Question Launch Gate** (`shared-types/launch-gate.ts` + `audit-core/launch-gate/seven-question-gate.ts`): pure `evaluateLaunchGate` → READY / CONDITIONAL / FIX_FIRST / BLOCK with one-NO-can-drive precedence and UNKNOWN ≠ NO. Wired worker step12→state→step13; `LaunchVerdictChip` renders below ScoreOverview (WCAG: glyph + sr-only label, not colour-alone).
- **1.2 CVE/KEV refresh** (`scripts/refresh-osv-coverage.py`): stdlib-only, non-blocking, honest about KEV being vendor-indexed (no fabricated ecosystem join). Weekly workflow pushes to `chore/cve-coverage` (avoids triggering deploy.yml on main).

### Phase 2 — Pattern Library
- `patterns/score-from-patterns.ts` — baseline 50 + Σ matched impacts, clamped, confidence by pattern count, origin 'D'.
- `frontend-code-patterns.ts` (9 patterns) + `maintainability-patterns.ts` (13 patterns) — deterministic over file tree + W1-A markers only. Both honestly **defer** content-based metrics (a11y/responsive; LOC/complexity/coverage/commit-quality) rather than fake them.
- `docs/audit-patterns/{frontend-code,maintainability}.md` — per-pattern specs.
- `calculateScores` gains `patternScores` (pattern wins over inventory baseline; applies only to otherwise-N/A categories); worker runs detectors in step12.

### Phase 3 — L-bucket skill bundle
- `docs/skills/audit-l-bucket-architecture.md` — D/L separation, input/output contract, D+L blend (60/40, origin 'mixed', conflict ⚠️), cost model (default OFF, opt-in, token budget, cache), and explicitly-queued runtime wiring.
- 4 skills under `.claude/skills/`: `audit-product-intent` (+ progressive-disclosure `references/stage-signals.md`), `audit-requirement-coverage`, `audit-pattern-explainer`, `audit-launch-verdict-narrative`. CBH description-keyword auto-trigger format; frontmatter YAML-validated.

## 5. Cross-check evidence

- **CVE script**: independently ran on a 3-entry fixture → exit 0, correct 7-day window filtering (excluded a 2020 entry), report + sentinel written, stdlib-only confirmed.
- **UI chip**: read the component + the dashboard wiring; confirmed guarded render + report.launchGate data path.
- **Pattern detectors**: read both modules in full; confirmed pure/immutable/path-only; pattern doc IDs match code (9 FE, 13 MNT) exactly.
- **Web test "failures"**: 7 failures in the full parallel `pnpm -r test` were proven **pre-existing flakiness** — every failing file passes in isolation, the failures hit files I never touched (categories/feature-graph pages), the errors are env-dependent (`ECONNREFUSED`/`firestore offline`), and the full web suite passes **exit 0 single-threaded**.

## 6. Verification (final)

- `pnpm -r type-check` → 6/6 packages Done.
- lint → clean (`--max-warnings=0`) on shared-types, audit-core, audit-worker, web.
- Tests: shared-types **203**, audit-core **607** (+47 new), audit-worker **302**, web green (serial).

## 7. Queued / remaining work (honest)

Phase 3 runtime wiring chosen model = **async enrichment job** (operator
decision, 2026-05-27) — now **fully built**: opt-in flag → schemas →
`applyEnrichment` blend → dashboard merge + badge → **`workers/enrichment-worker`
Cloud Run job** (orchestrator + Anthropic provider w/ prompt caching + skill
loader + Firestore I/O + Dockerfile, 34 tests) → **`functions` onAuditRunCompleted**
trigger (executes the job, 14 tests) → `infra/scripts/06-deploy-enrichment.sh`
+ `deploy.yml`.

Remaining = **operator GCP prereqs only** (one-time, not code; see
`docs/skills/audit-l-bucket-architecture.md` §"Enrichment job runner — BUILT"):
1. Create `ANTHROPIC_API_KEY` in Secret Manager.
2. Create the `enrichment-worker-runtime` SA + grant `roles/datastore.user` +
   `roles/secretmanager.secretAccessor`.
3. Grant the functions runtime SA `roles/run.developer` on the job (after first
   deploy creates it).

Optional future polish (not blocking):
- **Phase 2 enrichment**: FEATURE_GRAPH/FUNCTIONAL_FLOW/DATA_MODEL use Phase 1.3
  baselines; could be upgraded to full Pattern Library detectors like
  FRONTEND_CODE/MNT.
- **LSP re-enable** (§10 L6): SYMBOL_INVENTORY still disabled (PR #54).

## 8. Next action

- Review + merge **PR #57**.
- Run the operator GCP prereqs above, then deploy (push to `main` runs
  `deploy.yml`, which now includes the enrichment job).
