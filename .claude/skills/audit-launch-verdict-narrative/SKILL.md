---
name: audit-launch-verdict-narrative
description: >
  Run when an audit result references the launch verdict, the 7-Question Launch
  Gate, a LaunchGateResult (READY / CONDITIONAL / FIX_FIRST / BLOCK), or a
  founder asks "출시해도 되나?" / "can I ship?". Turns the deterministic gate
  output into a plain-language, non-developer narrative explaining the verdict
  and the most important next step.
triggers:
  - launch verdict
  - 7-question gate
  - launch gate
  - 출시 게이트
  - 출시해도 되나
  - ship readiness verdict
sources:
  - claude-bughunter benchmarking 2026-05-26 (7-Question Gate)
report_count: 0
---

# audit-launch-verdict-narrative

## Purpose

The audit-worker emits a deterministic `launchGate` (`packages/shared-types/src/launch-gate.ts`):
7 yes/no/unknown questions + a 4-state verdict + a one-line rationale. That is
accurate but terse. This skill writes the **why** in language a non-developer
founder understands, and names the single highest-leverage next action.

This is an **L (narrative) layer only** — it never changes the verdict or the
score. The deterministic gate stays the source of truth.

## Inputs (read, do not recompute)

From the persisted `AuditReport`:
- `report.launchGate.verdict` — READY / CONDITIONAL / FIX_FIRST / BLOCK
- `report.launchGate.questions[]` — each `{ id, question, answer, evidence }`
- `report.launchGate.rationale`
- `report.severityCounts.P0` (corroborates a BLOCK)

If `report.launchGate` is absent, say so and stop — there is nothing to narrate
(older runs predate the gate).

## Workflow

1. Read the verdict and the 7 answers. Do **not** re-derive them.
2. Identify the *driving* questions: for BLOCK → the P0 source; for FIX_FIRST →
   the failed foundation questions (Q1–Q3); for CONDITIONAL → the failed minor
   questions (Q5–Q7) or the UNKNOWN ones.
3. Write a 3–5 sentence narrative:
   - Sentence 1: the verdict in plain words ("지금 바로 출시하기엔 막는 요소가
     있어요" for BLOCK, etc.).
   - Sentence 2–3: which specific checks drove it, citing the question evidence.
   - Sentence 4–5: the single highest-leverage next action to move the verdict
     up one level (e.g. "P0 1건만 해결하면 BLOCK → CONDITIONAL").
4. For each UNKNOWN answer, note what input would let the audit answer it
   (e.g. "배포 URL을 입력하면 Q5를 측정할 수 있어요").

## Output

A short Korean narrative (non-developer audience). Optionally a one-line
English summary. **No score.** Always tie each claim back to a specific
question id + its evidence string (honest sourcing).

## Guardrails

- Never assert a category passed/failed beyond what the gate's answers say.
- UNKNOWN ≠ failure — describe it as "측정하지 못함", not "미달".
- Token budget ≤ 3K (the gate result is small; no file reads needed).
