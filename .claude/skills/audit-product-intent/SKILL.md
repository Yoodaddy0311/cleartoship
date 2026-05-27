---
name: audit-product-intent
description: >
  Run when an audit references PRODUCT_INTENT, product intent inference, README
  claim verification, "이 프로젝트가 뭘 하려는 건지", or stage-keyword
  (MVP / Alpha / Beta / Production) consistency. Reads the repo's README +
  CHANGELOG + GitHub metadata and produces an AI-assisted PRODUCT_INTENT score
  with a non-developer narrative — the deterministic pipeline leaves this
  category N/A on purpose (it needs language judgment).
triggers:
  - product intent
  - 제품 의도
  - readme claim
  - stage keyword
  - MVP beta production
  - 이 프로젝트가 뭘
sources:
  - claude-bughunter benchmarking 2026-05-26
references:
  - references/stage-signals.md
report_count: 0
---

# audit-product-intent

## Purpose

`PRODUCT_INTENT` is one of the two categories the deterministic audit
**intentionally** leaves N/A (see roadmap §6) — judging whether a project's
stated intent is clear and matches reality needs language understanding, not
file markers. This skill supplies that L-judgment as an **opt-in** layer: it
reads the project's own words and produces a `scoreL` + narrative.

## Inputs

- `report.inventorySignals.repoMetadata` — whether a GitHub description/topics
  exist (a corroborating signal, not proof of clarity).
- The repo's `README.md` (and `README.*`), `CHANGELOG.md`, and any
  `docs/PRD/*` — read directly in the Claude Code session.
- `report.categoryScores` for LAUNCH_READINESS / measured categories — to
  cross-check whether the README's stage claim matches measured reality.

## Workflow

1. Read the README (first ~5K tokens — respect the budget). Extract: the stated
   purpose, target user, and any **stage keyword** (MVP / Alpha / Beta /
   Production / "production-ready"). See `references/stage-signals.md`.
2. Read CHANGELOG / releases if present — a project claiming "Production" with
   no releases and a v0.0.x is a claim/reality mismatch.
3. Judge two things:
   - **Clarity** — can a new reader state what the product does and for whom in
     one sentence from the README? (0 = no README/unclear, 100 = crisp.)
   - **Claim consistency** — does the stated stage match measured reality
     (LAUNCH_READINESS, presence of tests/CI, deploy reachability)?
4. Produce `scoreL` (0–100): high clarity + consistent claim → 70–85; clear but
   over-claiming stage → cap ~55 + ⚠️; no/unclear README → 20–40.

## Output

```jsonc
{
  "category": "PRODUCT_INTENT",
  "scoreL": 70,
  "confidence": "MEDIUM",       // HIGH only if it agrees with a D signal
  "origin": "L",                 // "mixed" if a deterministic component exists
  "narrative": "이 프로젝트는 ... 를 위한 ... 입니다 (README 기준). 다만 ...",
  "sources": ["README.md", "CHANGELOG.md"]
}
```

Always cite the exact file + section you read. Blend with any D score per
`docs/skills/audit-l-bucket-architecture.md` (D 60% / L 40%, origin 'mixed').

## Guardrails

- **Honesty**: never claim intent the README does not state. "README 없음" →
  low score + say so, do not infer intent from code.
- A stage over-claim (README says "Production", reality says otherwise) is a
  **DOWNGRADE + ⚠️**, never a silent pass (Claude-BugHunter gate discipline).
- Default OFF — only runs on explicit opt-in. Token budget ≤ 5K.
