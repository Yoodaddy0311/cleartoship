# Migration — Add FCS field

| Field | Value |
|---|---|
| **Status** | step 1–4 ✅ DONE / step 5 ⏳ PENDING |
| **Owner** | backend-dev (step 1–4) + devops (step 5) |
| **Migration ID** | 2026-05-19-add-fcs-field |
| **Created** | 2026-05-19 (Sprint 4 Wave 1) |
| **Step 5 target** | 2026-06-18 (30-day cleanup gate after Wave 1 merge) |
| **Related PRD** | `docs/PRD/sprint4-execution-plan-2026-05-18.md` §3.2 + `docs/PRD/finalize-launch-sharpen-2026-05-18.md` §B.1 |

---

## Background

Founder Confidence Score (FCS) is a single 0–100 metric with an uncertainty
interval, a 7-enum `LaunchStatus`, up to 3 ranked concerns, and a one-sentence
rationale produced by `audit-core`. It is Sharpen PRD §B.1 (option scored
9.05/10) and ships in Sprint 4 Wave 1.

This migration introduces FCS as an **optional, additive** field on the audit
result, then promotes it to required after a 30-day hardening window.

---

## 5-Step Plan

### Step 1 — Schema add (2026-05-19, ✅ DONE in Wave 1)

- **What**: `FCSResult` + `Concern` zod schemas, both `.strict()`.
- **Where**: `packages/shared-types/src/fcs.ts` (new — kept separate from
  `domain.ts` to preserve TDZ-safe import order; re-exported via
  `packages/shared-types/src/index.ts`).
- **Commit**: PR #1 — `feat(fcs): Wave 1 USP-1 — Founder Confidence Score`.
- **Risk**: zod enum ordering can trigger TDZ on cross-package import.
- **Rollback**: delete `fcs.ts` + remove the `index.ts` re-export line. No
  downstream consumers existed at this commit, so revert is risk-free.
- **Smoke**: `pnpm --filter @cleartoship/shared-types test` — schema valid /
  invalid (4 cases).

### Step 2 — Cross-package sync (2026-05-19, ✅ DONE in Wave 1)

- **What**: `computeFCS` implementation + integration in scoring pipeline.
- **Where**:
  - `packages/audit-core/src/fcs/compute-fcs.ts` (new).
  - `packages/audit-core/src/scoring/calculate-scores.ts` (edit — line 6
    import, line 13 compute import, lines 248/274 call site).
  - `workers/audit-worker` auto-syncs through the `audit-core` re-export — no
    direct change in the worker.
- **Commit**: PR #1 W1.B1.2 + W1.B1.3.
- **Risk**: cross-package mutation of zod schemas can break TDZ-safe import
  order; isolated package tests will pass while a full-workspace run fails.
- **Mitigation**: PR template requires `pnpm test` across `shared-types`,
  `audit-core`, and `audit-worker` simultaneously (Sprint 4 PRD §5.1 R-GATE-1).
- **Rollback**: drop the FCS field from `calculate-scores.ts` emit. The
  `compute-fcs.ts` module becomes dead but does not affect runtime.
- **Smoke**: `pnpm -r test` — full 3-package suite green (Wave 1 baseline:
  429 in audit-core + worker tests + 1627 web tests).

### Step 3 — Backfill strategy (2026-05-19 → 2026-06-17, 🔄 PASSIVE)

- **What**: legacy Firestore `auditRuns/*` documents keep `fcs = null`. Only
  newly enqueued runs compute FCS.
- **Where**: `apps/web/lib/audit-runs/` writer layer — no migration script
  runs over existing documents.
- **Policy**: **passive backfill**. When a user re-audits the same repo, the
  fresh run naturally carries an `fcs` object.
- **Risk**: during the 30-day window UI must tolerate `fcs == null` (covered
  in step 4).
- **Rollback**: no action required — old documents are unchanged.
- **Smoke**: read an existing run → `fcs` returns `null` / `undefined`
  without a parse error; read a new run → `fcs` object parses cleanly.

### Step 4 — UI fallback (2026-05-19, ✅ DONE in Wave 1)

- **What**: when `fcs == null` the dashboard falls back to the existing
  `ScoreGauge`. When `fcs` is present the new `FounderConfidenceScore`
  component renders the uncertainty bar + top concerns.
- **Where**: `apps/web/components/founder-confidence-score.tsx` (null guard
  is internal). Caller sites pass `fcs ?? null` and branch on presence.
- **Commit**: PR #1 W1.B1.7.
- **Risk**: a single run viewed twice with different `fcs` presence can
  trigger a hydration mismatch.
- **Mitigation**: `fcs` is resolved on the server component during fetch and
  passed down as a prop, so SSR and client render agree by construction.
- **Rollback**: remove the branch and render `ScoreGauge` unconditionally.
- **Smoke**: visit `/audits/<old-id>` (fallback) and `/audits/<new-id>`
  (gauge) — both must render without console errors.

### Step 5 — Cleanup gate (2026-06-18, ⏳ PENDING)

- **What**: promote `FCSResult` to **required**. Backfill any legacy
  documents that still hold `fcs = null` before the schema flip.
- **Where**: `packages/shared-types/src/fcs.ts` (optional → required). The
  audit-run result object adds `fcs: FCSResult` (no longer `fcs?`).
- **Preconditions**:
  1. Step 4 UI fallback has been live for 7 days with no Cloud Monitoring
     latency or error-rate regression.
  2. `apps/web/lib/audit-runs/backfill-fcs.ts` is written, dry-run is clean,
     and the actual backfill reports 100% coverage in the Firestore count
     query.
  3. ADR `docs/ADR/2026-06-18-fcs-required-promotion.md` is approved
     (decision, impact, rollback plan).
- **Commit**: TBD — likely Sprint 5 or Sprint 6.
- **Risk**: a single legacy document without `fcs` fails the required
  `zod.parse` and blocks every `auditRuns` read after the schema flip.
- **Mitigation**:
  - Backfill must hit 100% before the schema is promoted.
  - 7-day monitoring buffer after step 4 ships.
  - Rollback path: revert `fcs:` to `fcs?:` and redeploy within 24h.
- **Rollback**: schema flips back to optional, UI fallback re-activates,
  deploy.

---

## Smoke-test checklist (all steps)

- [ ] `pnpm --filter @cleartoship/shared-types test` — schema valid/invalid.
- [ ] `pnpm --filter @cleartoship/audit-core test` — `compute-fcs.test.ts`
      + `calculate-scores.test.ts` updated branches.
- [ ] `pnpm --filter @cleartoship/audit-worker test` — pipeline emit
      includes `fcs` when input is well-formed.
- [ ] `pnpm --filter web test` — `founder-confidence-score.test.tsx` covers
      null and present cases.
- [ ] Local audit run → Firestore document carries `fcs` payload.
- [ ] Read-round-trip preserves `fcs` shape (no extra/missing fields).
- [ ] `/audits/<id>` page shows FCS gauge + uncertainty bar + ≤ 3 concerns.
- [ ] Legacy `/audits/<old-id>` renders `ScoreGauge` fallback without error.

---

## Cross-references

- Sprint 4 PRD: `docs/PRD/sprint4-execution-plan-2026-05-18.md` §3.2.
- Sharpen PRD: `docs/PRD/finalize-launch-sharpen-2026-05-18.md` §B.1.
- Risk gates: Sprint 4 PRD §5.1 R-GATE-1 (TDZ) + §5.4 R-GATE-4 (optional →
  required promotion).
- Code entry points:
  - `packages/shared-types/src/fcs.ts`
  - `packages/audit-core/src/fcs/compute-fcs.ts`
  - `packages/audit-core/src/scoring/calculate-scores.ts` (lines 6, 13, 248,
    274)
  - `apps/web/components/founder-confidence-score.tsx`
