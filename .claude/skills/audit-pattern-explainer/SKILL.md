---
name: audit-pattern-explainer
description: >
  Run when a user asks why a category got its score, what a Pattern Library
  finding means, "왜 이 점수가 나왔어?", or wants a plain-language explanation of
  a FRONTEND_CODE / MAINTAINABILITY / FEATURE_GRAPH / DATA_MODEL / FUNCTIONAL_FLOW
  category score. Explains the deterministic pattern evidence in non-developer
  terms and suggests concrete improvements.
triggers:
  - pattern library
  - why this score
  - 왜 이 점수
  - explain category score
  - pattern finding
  - 패턴 설명
sources:
  - claude-bughunter benchmarking 2026-05-26 (hunt-*.md pattern docs)
report_count: 0
---

# audit-pattern-explainer

## Purpose

Phase 2 scores the structural categories from a deterministic **Pattern
Library** (`packages/audit-core/src/patterns/`, documented in
`docs/audit-patterns/*.md`). Each category's score = baseline 50 + matched
pattern impacts. This skill explains, per category, *which patterns matched*,
*why that produced the score*, and *what concrete change would raise it* — in
language a non-developer founder understands.

L (narrative) layer only — it never changes the score.

## Inputs (read, do not recompute)

- `report.categoryScores[]` — the `category`, `score`, and `origin` ('D' for
  pattern-scored categories).
- The matching pattern doc under `docs/audit-patterns/<category>.md` — the
  source of truth for what each pattern means and its score impact.
- (Optional) the repo's file tree, to confirm which pattern signals are present
  before claiming them.

## Workflow

1. Identify the category the user is asking about (or iterate all D-scored
   structural ones: FRONTEND_CODE, MAINTAINABILITY_DOCUMENTATION, FEATURE_GRAPH,
   FUNCTIONAL_FLOW, DATA_MODEL).
2. Open `docs/audit-patterns/<category>.md`. Read the pattern table + score
   formula. **Do not invent patterns** — only explain ones documented there.
3. Map the category's numeric score to the likely matched/unmatched patterns
   (baseline 50 + impacts). State which healthy patterns are present and which
   high-impact patterns are missing.
4. For each missing high-impact pattern, give one concrete, scoped action
   ("`components/` 디렉터리로 UI를 분리하면 +6", "테스트 디렉터리를 추가하면
   +16, 없으면 -18 페널티도 사라져요").

## Output

A per-category Korean explanation: "이 점수는 왜 나왔나" + "어떻게 올리나".
Cite the pattern id + impact from the doc for every claim. **No score change.**

## Guardrails

- Patterns are deterministic *path/marker* signals — never claim a pattern
  measured code quality it cannot see (e.g. don't say "코드 복잡도가 높다" — the
  Pattern Library does not read file contents). The docs note these deferrals.
- If a category is N/A (`score === null`), explain *why it could not be
  measured* and what input/tool would un-N/A it, instead of fabricating a score.
- Token budget ≤ 5K per category.
