# Audit L-Bucket — Skill Architecture & Contract

**Phase 3 of the Audit Quality Roadmap** (`docs/PRD/audit-quality-roadmap-2026-05-26.md` §6).

## The decision (why skills, not pipeline LLM calls)

ClearToShip's audit-worker is **deterministic** — it runs a 20-step pipeline
(clone + chromium + lighthouse + heuristics + Pattern Library) and emits a
Founder Confidence Score with **zero LLM API calls at runtime**. This is a
deliberate, load-bearing property: audits are reproducible for a given commit,
cost is predictable, and there is no prompt-injection surface in the runtime.

The Claude-BugHunter benchmark (repo-benchmarker 2026-05-26) confirmed the
cleanest way to add LLM judgment in this domain is to keep it **out of the
runtime pipeline** and expose it as a **Claude Code skill bundle** that reads
the audit's deterministic output and *adds* an L-judgment layer. The audit
remains the source of truth; the skills enrich it.

```
┌─────────────────────────┐      reads persisted report      ┌──────────────────────┐
│ audit-worker (D + F)    │  ───────────────────────────────▶│ Claude Code skill     │
│ • Pattern Library (§5)  │      report.categoryScores         │ bundle (L)            │
│ • 7-Question Gate (§4.1)│      report.launchGate             │ • product-intent      │
│ • inventory baselines   │      report.inventorySignals       │ • requirement-coverage│
│ • severity / FCS        │      report.markdown / findings    │ • pattern-explainer   │
│   NO LLM, reproducible  │                                    │ • verdict-narrative   │
└─────────────────────────┘                                    └──────────────────────┘
```

## Input contract — what a skill reads

The skills read the **persisted `AuditReport`** (Firestore `auditRuns/<id>/report`
or the dashboard's already-fetched object). The fields they consume:

| Field | Source | Used by |
|---|---|---|
| `categoryScores[]` (`category`, `score`, `origin`) | scoring (§4.3/§5) | all — establishes which categories are D-scored vs. still N/A |
| `launchGate` (`questions[7]`, `verdict`, `rationale`) | 7-Question Gate (§4.1) | `audit-launch-verdict-narrative` |
| `inventorySignals` (`repoMetadata`, `dataModel`, `routes`) | PR-A4-fix evidence | `audit-product-intent` |
| `markdown` / `findings` | report renderer | `audit-pattern-explainer` |
| `severityCounts`, `readinessScore`, `fcs` | scoring | verdict / pattern explainers |

The raw repo artifacts a skill may additionally inspect (README, CHANGELOG,
PRD upload) are available to the Claude Code session that runs the skill — the
skill is responsible for honest sourcing (cite the file it read).

## Output contract — how a skill contributes L-judgment

A skill produces **one or both** of:

1. **Narrative** — a non-developer-readable explanation that goes alongside the
   deterministic score ("AI-assisted" label). This is the safe default.
2. **Supplementary L-score** — for the two genuinely LLM-dependent categories
   (`PRODUCT_INTENT`, `REQUIREMENT_COVERAGE`) the skill may assign a score. When
   it does, the blended result uses `origin: 'mixed'` (or `'L'` when there is no
   D component) per the existing `ScoreOrigin` enum, and the dashboard renders
   an **"AI-assisted"** badge.

```jsonc
// Shape a skill emits for a category it judges (not yet persisted by the
// worker — see "Remaining wiring" below):
{
  "category": "PRODUCT_INTENT",
  "scoreL": 70,                 // the skill's judgment, 0-100
  "confidence": "MEDIUM",       // HIGH only on dual D+L agreement
  "narrative": "...",           // non-dev explanation, cites README/CHANGELOG
  "origin": "L",                // or "mixed" when a D component exists
  "sources": ["README.md", "CHANGELOG.md"]
}
```

### D + L blend (§6.5)

When both a D score and an L score exist for a category:

```
scoreFinal = round(scoreD * 0.6 + scoreL * 0.4)   // D-weighted: deterministic anchors
origin     = 'mixed'
confidence = (D and L agree within 15 pts) ? 'HIGH' : 'LOW + ⚠️ conflict flag'
```

D-only stays `'D'`; L-only is `'L'` with `confidence: 'LOW'` (single soft signal).
A D+L **conflict** never silently averages away — it surfaces a ⚠️ flag (§7.3).

## Cost management (§6.6) — opt-in by default

- **Default = OFF.** The audit-worker run alone (D + F) never invokes a skill.
- The skills activate only when a user explicitly opts in ("AI enhanced"
  toggle on the audit form, or a developer running the skill in Claude Code).
- **Token budget per category** (e.g. ≤5K tokens for PRODUCT_INTENT). A skill
  that would exceed budget truncates its input (README first N chars) and says so.
- **Cache by `commitSha + category`** — the same commit never re-judged twice.
- **Session isolation per audit** — no cross-audit context bleed.

## The four skills

| Skill | Triggers on | Produces |
|---|---|---|
| `audit-product-intent` | PRODUCT_INTENT, product intent, README claim, stage keyword (MVP/Beta/Prod) | scoreL + narrative for PRODUCT_INTENT |
| `audit-requirement-coverage` | REQUIREMENT_COVERAGE, PRD vs features, acceptance criteria | scoreL + narrative for REQUIREMENT_COVERAGE |
| `audit-pattern-explainer` | Pattern Library finding, "왜 이 점수", category score explanation | narrative per category/pattern |
| `audit-launch-verdict-narrative` | launch verdict, 7-Question Gate, "출시해도 되나" | narrative for the LaunchGateResult |

Each lives in `.claude/skills/audit-*/SKILL.md` with a `description:` field whose
keywords drive auto-trigger (the Claude-BugHunter pattern).

## Chosen model: async enrichment job

The audit completes deterministically (D + F) and returns immediately. When the
run is **opt-in** (`AuditRun.aiEnhanced === true`), a separate **async
enrichment job** runs the `audit-*` skill bundle, blends each result with the D
score, and persists it onto the report — the dashboard then re-renders blended
scores with the AI-assisted badge. This keeps the runtime pipeline LLM-free.

```
audit done (D) ──▶ AuditRun.aiEnhanced? ──no──▶ (deterministic report only)
                          │ yes
                          ▼
        Firestore onCreate(completed + aiEnhanced) ──▶ enrichment job
                          │
        Claude Agent SDK session loads .claude/skills/audit-*  →  per category:
          scoreL + narrative (token-budgeted, cached by commitSha+category)
                          │
        write report.enrichment = { status:'DONE', categories:[…] }
                          ▼
        dashboard: applyEnrichment(report.categoryScores, report.enrichment)
                   → blended score + origin 'L'/'mixed' + 🤖/⚙️ badge
```

### Built (this PR)

- **Opt-in flag** — `AuditRun.aiEnhanced` + `CreateAuditRunRequest.aiEnhanced`
  (shared-types); "AI 보조 분석 (옵션)" checkbox on the audit-start form, plumbed
  through `create-audit-run`. Default OFF.
- **Enrichment data shape** — `AuditEnrichment` / `CategoryEnrichment` +
  `AuditReport.enrichment` (shared-types).
- **Blend + merge** — audit-core `blendScores` (§6.5) and `applyEnrichment`
  (folds enrichment into `categoryScores`, ⚠️ on conflict, immutable) +
  `enrichmentCacheKey` + `ENRICHMENT_TOKEN_BUDGET_PER_CATEGORY`.
- **Display** — dashboard merges via `applyEnrichment` before render; the
  `OriginBadge` (🤖 L / ⚙️ mixed) + i18n tooltips already existed (PR-A4); a
  muted "AI 보조 분석 진행 중" note shows on `enrichment.status === 'PENDING'`.

### Remaining boundary (one piece — needs the Anthropic API key + a deploy target)

The **enrichment job runner** itself: a process that, on a completed opt-in
run, opens a Claude Agent SDK session loading `.claude/skills/audit-*`, produces
a `CategoryEnrichment[]`, and writes `report.enrichment`. Everything up to and
after this boundary is built and tested — the runner only has to emit a valid
`AuditEnrichment`. It is left unimplemented here because it requires (a) an
Anthropic API key + per-category token-budget/cost ownership decision, and
(b) an infra deploy target (Cloud Run job vs Cloud Function on the Firestore
`onCreate(completed + aiEnhanced)` trigger). Build notes:
- Enforce `ENRICHMENT_TOKEN_BUDGET_PER_CATEGORY` per skill; truncate inputs.
- Cache by `enrichmentCacheKey(commitSha, category)` — never re-judge a commit.
- Set `report.enrichment.status` to `PENDING` on enqueue, `DONE`/`ERROR`/`SKIPPED`
  on completion, so the dashboard note reflects progress.

See the PRD §6.5–6.7 for the full target state.
