---
name: project-phase0-status
description: Phase 0 worker tooling — PR
metadata: 
  node_type: memory
  type: project
  originSessionId: f7dda967-061d-441e-8297-28bb6753e327
---

Phase 0 of the worker tooling ULTRAPLAN (handoff §10) is **code-complete and CI-green**, awaiting operator merge + manual deploy steps.

**Why**: the previous prod audit (`auditRuns/f9yNjdD3rDzEYrrps9hA`) ran but emitted `readinessScore=21, launchStatus=INDETERMINATE` because the Docker image had no `git` / `chromium`. Phase 0 installs the minimum-viable production audit surface (8-of-11 cascade fix per handoff §9). Phase 1 (semgrep + osv-scanner) is the explicit follow-up.

**How to apply**: when the user returns to this project, the immediate move is `gh pr view 36` then merge it, NOT plan new work. The next-session re-entry checklist is in `reports/AUTOPILOT/ap-20260520-phase0-resume-handoff.md` (committed in the repo, not just memory).

## Key facts (as of 2026-05-20 ~01:30 KST)

- **PR #36** open: `feat(phase0): worker tooling — git + chromium + --no-cpu-throttling`
- All 5 CI checks PASS: Type Check, Lint, Test, Build (apps/web), Build audit-worker image
- Branch: `feat/phase0-worker-tooling` (7 commits ahead of main)
- Final commit: `cc7a37a` (docs update); functional final: `a58e67c`
- Base image pinned: `node:20.13-bookworm-slim@sha256:cffed8cd39d6a380434e6d08116d188c53e70611175cd5ec7700f93f32a935a6`
- PR #35 (handoff doc) also open but unrelated — independent merge OK

## What changed in PR #36

| File | Lines | Purpose |
|---|---|---|
| `docs/PRD/phase0-worker-tooling-2026-05-19.md` | +750 (new) | Phase 0 PRD |
| `workers/audit-worker/Dockerfile` | 58 → 102 | bookworm-slim + git + chromium (via pnpm exec + find + install-deps) |
| `workers/audit-worker/scripts/smoke-tools.sh` | +58 (new) | git + chromium probe |
| `.github/workflows/deploy.yml` | 326 → 374 | prod `--no-cpu-throttling` + `/healthz` smoke (with `--audiences` fix) |
| `infra/scripts/03-deploy-worker.sh` | 93 → 104 | CPU flag mirror |
| `infra/README.deploy.md` | 308 → 362 | rollback procedure |
| `reports/AUTOPILOT/ap-20260520-phase0-worker-tooling.md` | +213 (new) | Autopilot session report |

## Open questions (defaults already applied, but reversible)

- Q1 `--no-traffic` strategy: Option A (manual 1회 post-merge). User must recall traffic to prior revision before reviewing the new one.
- Q3 billing alert: deferred to Phase 2.
- Q4 PR size: Option A (single PR — this is it).
- Q5 marketing usage: wait for Phase 1.

## Static lint verification (2026-05-20, post-CI-green)

Ran shellcheck + hadolint + actionlint via winget-installed binaries. Result: **0 merge-blockers, 4 detected items all categorised**:

- shellcheck SC2086 on `03-deploy-worker.sh:70` — intentional unquoted `$CPU_THROTTLING_FLAG` (word-splitting drops empty staging flag).
- hadolint DL3008 ×2 (`Dockerfile:10` + `:53`) — apt version pinning. **Phase 2 backlog item**.
- hadolint DL4006 (`Dockerfile:94`) — false positive (no actual pipe, only `&&` chains).
- hadolint DL3059 (`Dockerfile:110-111`) — intentional separate chown RUNs per PRD §3.2 (cache scoping).

See [[reference-lint-tools]] for install paths + reproduction commands.

## Cascade insight (do not re-derive)

Only 4 binaries are actually missing from the worker image: `git`, `chromium`, `semgrep`, `osv-scanner`. The other 5 "missing" tools (secret-scanner, risky-function-discovery, prisma-analyzer, design-consistency, business-readiness) are pure-Node already; they skip only because step 03 sets `ctx.clonePath=null` when git is absent. Installing git alone unblocks 8 of 11 broken steps. Phase 0 = git + chromium. Phase 1 = semgrep + osv-scanner.

See also: [[project-next-actions]], [[reference-phase0-prd]], [[feedback-pnpm-monorepo-docker]].
