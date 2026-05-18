# ADR — BUSINESS_READINESS tie-break policy for categoryScores ordering

**ID**: 2026-05-18-business-readiness-tie-break
**Date**: 2026-05-18
**Status**: Accepted
**Authors**: backend (W3.CLN.4)
**Scope**: `packages/audit-core/src/scoring/calculate-scores.ts`
**Related PRD**: `docs/PRD/sprint4-execution-plan-2026-05-18.md` §3.4 W3.CLN.4 (Phase 4.5 cleanup, Sharpen §A.4.4)

---

## Context

Sprint 4 Wave 2 introduced the 10-block Insight stack, including a new
`CategoryGrid` (§C.6) that renders all 12 audit categories — 11 base
categories plus `BUSINESS_READINESS` (T2.8 / UPG-06). Prior to this change
`calculateScores` returned `categoryScores` in `CATEGORY_META` declaration
order. With `BUSINESS_READINESS` now in the list, ordering becomes
user-visible in two surfaces:

1. The dashboard's 2×6 grid — users read top-left to bottom-right.
2. The markdown report's "영역별 점수" table — readers scan top to bottom.

Sharpen PRD §A.4.4 flags this as a cleanup gap: weight-0 categories
(`PRODUCT_INTENT`, `REQUIREMENT_COVERAGE`, `BUSINESS_READINESS`) and
score-tied categories produce a non-deterministic visual ordering
depending only on declaration position. In particular, a `BUSINESS_READINESS`
score of 100 (Pricing/Legal/Onboarding all green) was displayed *before* a
technical category at the same score, which violates the editorial intent:
the dashboard exists to surface **technical** launch risk first; business
readiness is a meta layer.

Three options were considered before this decision (see "Alternatives").

## Decision

`calculateScores` sorts its `categoryScores` output with a 4-tier
deterministic comparator `compareCategoryScoresWithTieBreak`, exported
from the same module so UI consumers and the markdown renderer share a
single source of truth.

Sort order (each tier breaks ties for the prior tier):

1. **score desc** — `null` (N/A) is treated as `-1` so unmeasured
   categories sink below any numeric score. Highest score first.
2. **category weight desc** — among tied scores, heavier-weight
   categories (SECURITY_PRIVACY 15, BACKEND_API 15, UX_UI 15) surface
   before lighter ones (LAUNCH_READINESS 10, MAINTAINABILITY 5,
   weight-0 categories).
3. **BUSINESS_READINESS sentinel** — when scores and weights still tie,
   `BUSINESS_READINESS` is forced to come **after** any non-business
   category. This is the focus of this ADR.
4. **CATEGORY_META declaration order** — the deterministic final
   fallback, preserving the spec-intended progression
   (PRODUCT_INTENT → MAINTAINABILITY_DOCUMENTATION).

The comparator is a pure function operating on `CategoryScore` shape
(`{ category, score, label, summary }`) and has no dependency on
`Finding` or `Severity` data — UI components can re-apply it on
post-filtered subsets without re-running scoring.

## Consequences

**Positive**

- Dashboard CategoryGrid (§C.6) and markdown report agree on ordering;
  drift between surfaces is eliminated.
- `BUSINESS_READINESS` always sits below technical categories of equal
  score, matching editorial intent ("tech risk first").
- The comparator is pure and exported, so future consumers
  (e.g. a CSV export, a CategoryGrid filter) can reuse it.
- Existing tests pass unchanged — they use `.find()` for category
  lookup, not index-based access.

**Negative / accepted trade-offs**

- The "scores" used for ordering are post-rounding integers; pre-rounding
  fractional differences may collapse to ties. This is intentional —
  users see rounded scores, so ordering should match what they see.
- N/A (null score) categories all collapse to the bottom of the list
  regardless of weight. Acceptable: an N/A category has no signal, so
  its position is informational only.
- Adding a new category to the `BUSINESS_READINESS` bucket later (e.g.
  a future `OPERATIONS_READINESS`) would need a similar sentinel; the
  comparator is small enough that this is a localised change.

## Alternatives considered

**A. Sort by declaration order only (status quo).**
Rejected: `BUSINESS_READINESS` at position 12 of `CATEGORY_META` would
appear last only on full ties, but a low-scoring technical category
could push it earlier in the visible grid — exactly the inversion this
ADR prevents.

**B. Sort by severity weight of contained findings.**
Rejected: this couples category ordering to dynamic finding data,
making the visual order unstable run-to-run and violating the
predictability requirement for the dashboard (R-GATE-2 visual baseline).

**C. Hard-pin BUSINESS_READINESS to the absolute last position.**
Rejected: a BUSINESS_READINESS score of 40 must still surface ahead of
a healthy 100 in the "what needs attention" reading order. Demoting it
only on **tie** preserves the score-desc primary ordering.

## References

- `packages/audit-core/src/scoring/calculate-scores.ts` —
  `compareCategoryScoresWithTieBreak` export + sort site.
- `packages/audit-core/src/scoring/calculate-scores.test.ts` —
  tie-break suite (`describe('calculateScores — tie-break ordering
  (W3.CLN.4)')`).
- `packages/audit-core/src/scoring/checklist-mapping.ts` — CATEGORY_META
  declaration order (BUSINESS_READINESS at index 11).
- Sharpen PRD §A.4.4, Sprint 4 plan §3.4 W3.CLN.4.
- `03_audit_checklist_scoring_rubric.md` §1.2 (weight=100 invariant).
