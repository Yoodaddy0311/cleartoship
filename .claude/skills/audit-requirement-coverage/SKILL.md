---
name: audit-requirement-coverage
description: >
  Run when an audit references REQUIREMENT_COVERAGE, PRD-vs-implemented features,
  acceptance-criteria coverage, "기획서 대비 구현", or "요구사항이 다 들어갔나".
  Maps a user-supplied PRD / spec against the detected features and produces an
  AI-assisted REQUIREMENT_COVERAGE score — the deterministic pipeline leaves this
  N/A on purpose (it needs to read intent prose and match it to features).
triggers:
  - requirement coverage
  - 요구사항 충족
  - prd vs features
  - 기획서 대비 구현
  - acceptance criteria
  - spec coverage
sources:
  - claude-bughunter benchmarking 2026-05-26
report_count: 0
---

# audit-requirement-coverage

## Purpose

`REQUIREMENT_COVERAGE` is the second category the deterministic audit leaves
N/A by design (roadmap §6): it requires reading a requirements document and
judging whether each stated requirement is actually implemented. This skill
supplies that as an **opt-in** L-layer, building on the existing
`coverageMatrix` (PRD §2.1 / `packages/audit-core/src/coverage-matrix.ts`) when
a PRD was uploaded, and adding language-level judgment the matrix can't do.

## Inputs

- The user-supplied PRD / spec text (audit-start upload) — `null` when none was
  provided, in which case this category **stays N/A** (say so; do not invent
  requirements).
- `report.coverageMatrix[]` — the deterministic claim↔feature mapping, if present.
- `report.categoryScores` + `report.findings` — to confirm a "covered" claim is
  actually working, not just present.
- The repo's detected features (routes, APIs, data model) via the report.

## Workflow

1. If no PRD/spec was supplied → output N/A with the reason "기획서 미제출 —
   요구사항 대조 불가". Stop. (This is the honest default; most vibe-coded
   projects have no PRD.)
2. Extract discrete requirements / acceptance criteria from the PRD (bullet
   lists, "user can ...", "the system shall ..."). Number them.
3. For each requirement, classify against detected features + findings:
   - **Implemented** — a matching route/feature exists and no blocking finding.
   - **Partial** — feature exists but a finding suggests it's incomplete/risky.
   - **Missing** — no matching feature detected.
4. `scoreL` = round(100 × implemented / total), with partials counting 0.5.
   Penalise nothing for requirements the PRD didn't state.

## Output

```jsonc
{
  "category": "REQUIREMENT_COVERAGE",
  "scoreL": 65,
  "confidence": "MEDIUM",
  "origin": "L",                 // "mixed" if coverageMatrix gave a D component
  "narrative": "기획서의 12개 요구사항 중 8개 구현 확인, 2개 부분 구현, 2개 미구현 ...",
  "coverage": { "implemented": 8, "partial": 2, "missing": 2, "total": 12 },
  "sources": ["<uploaded PRD>", "report.coverageMatrix"]
}
```

Cite the specific requirement ↔ feature/file for every "implemented" claim.

## Guardrails

- **No PRD → N/A, never a fabricated score.** Absence of a spec is not a 0; it
  is "not measurable".
- A requirement is only "implemented" with a concrete detected feature to point
  at — presence of a route named like the requirement is evidence; a vague
  guess is not.
- Reconcile with `report.coverageMatrix` rather than contradicting it; the
  matrix is the deterministic anchor (blend D 60% / L 40%, origin 'mixed').
- Default OFF — opt-in only. Token budget ≤ 5K (truncate long PRDs, note it).
