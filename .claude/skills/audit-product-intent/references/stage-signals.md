# Stage Signals — MVP / Alpha / Beta / Production

Progressive-disclosure reference for `audit-product-intent`. Loaded only when
the skill needs to classify a project's stage claim against reality. Keep the
main SKILL.md lean; the detail lives here (Claude-BugHunter `references/` pattern).

## Stage keywords to scan for (README / package.json / docs)

| Stated stage | Common phrasings | Reality expectation (what a HONEST claim implies) |
|---|---|---|
| Prototype / POC | "proof of concept", "experiment", "toy", "WIP" | no uptime promise; fine to lack tests/CI |
| MVP | "MVP", "minimum viable", "early" | core flow works; some gaps acceptable |
| Alpha | "alpha", "unstable", "expect breaking changes" | usable by insiders; rough edges expected |
| Beta | "beta", "public beta", "preview" | feature-complete-ish; stability improving; tests expected |
| Production | "production-ready", "stable", "v1", "GA", "battle-tested" | tests + CI + deploy + no P0; uptime claim implied |

## Claim ↔ reality mismatch rules (DOWNGRADE triggers)

A stated stage is **over-claimed** (cap the score + ⚠️) when the measured audit
contradicts it:

- Claims **Production / stable / v1** BUT any of:
  - `report.severityCounts.P0 > 0`
  - `report.launchGate.verdict === 'BLOCK' | 'FIX_FIRST'`
  - no tests (`MAINTAINABILITY` low / W1-A TESTS_DIR_PRESENT false)
  - version still `0.0.x` / no releases in CHANGELOG
  - deploy URL unreachable
- Claims **Beta** BUT no tests AND no CI → mild over-claim.

An **under-claim** (project is more solid than it says) is fine — do not penalise
modesty; note it positively in the narrative.

## Clarity rubric (the other half of the score)

| Clarity | Signal |
|---|---|
| High (80–100) | README opens with a one-sentence "what + for whom"; has Quick Start; purpose unambiguous |
| Medium (50–70) | purpose inferable but buried; no clear target user |
| Low (20–45) | README is a framework boilerplate ("Welcome to Next.js"), or absent |

## Sourcing discipline

Every stage/clarity claim in the narrative must cite the file + line/section it
came from (e.g. "README.md L1: 'A production-ready ...'"). Never infer the stage
from code structure — only from the project's own stated words.
