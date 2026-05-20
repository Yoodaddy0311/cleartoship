---
name: reference-phase0-prd
description: Where to find the Phase 0 PRD and how to navigate it
metadata: 
  node_type: memory
  type: reference
  originSessionId: f7dda967-061d-441e-8297-28bb6753e327
---

**File**: `docs/PRD/phase0-worker-tooling-2026-05-19.md` (750 lines, committed in branch `feat/phase0-worker-tooling`, also will be on main after PR #36 merges).

## Section guide (jump to what you need)

| Need | Section | Notes |
|---|---|---|
| Why Phase 0 exists | §0 + §1 | Executive summary + worker log evidence + "8-of-11 cascade" |
| What's in scope vs deferred | §2 | Phase 1 list at §7.1, Phase 2 at §7.2 |
| The actual work units (file:line specific) | §3 | 25 sub-units across W1~W5, each with owner/file/LOC/effort |
| Final-state Dockerfile sketch | §3.7 | Reference when reviewing the implementation diff |
| Verification commands | §4 | V1~V17 — split by build-time / CI / post-deploy |
| Risks + mitigations | §5 | 7 risk gates R-P0-1 ~ R-P0-7 |
| Rollback path | §6 | gcloud commands ready to copy |
| Phase 1/2 hand-off | §7 | What the next PR picks up |
| Acceptance criteria | §8 | 20 AC, the merge bar |
| Open team-lead questions | §9 | Q1~Q5 (defaults documented in [[project-phase0-status]]) |
| Re-entry checklist | §10 + §11 | PowerShell snippets + Phase 2 dispatch tasks |
| Related decisions / memory rules | §12 | D-1~D-4 from handoff §7 |

## Related docs

- **Sprint 4 plan** (parent): `docs/PRD/sprint4-execution-plan-2026-05-18.md` §3.3 L-P0-2 explicitly lists Phase 0 as Sprint 4 infra work.
- **Sharpen PRD**: `docs/PRD/finalize-launch-sharpen-2026-05-18.md` §A.3 mentions W3 vibe-coded profile, blocked on clone (= same git issue Phase 0 fixes).
- **Handoff §10**: `reports/AUTOPILOT/ap-20260519-mvp-golden-path-handoff.md` is where the ULTRAPLAN exec summary lives. The PRD expands that summary into work units.
- **Autopilot session report**: `reports/AUTOPILOT/ap-20260520-phase0-worker-tooling.md` — what actually happened, including the 4-iteration CI fix loop.

See also: [[project-phase0-status]], [[project-next-actions]].
