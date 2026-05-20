# Autopilot Session Report — Phase 0 Worker Tooling

**Session ID**: `ap-20260520-phase0-worker-tooling`
**Mode**: compressed-single-turn (engine-less; the LLM ran phases sequentially in one conversation turn rather than spawning the Node engine for a 4-hour detached session)
**Start**: 2026-05-20 ~00:05 KST
**End**: 2026-05-20 ~01:00 KST
**Goal Contract**: `pnpm -r test && pnpm -F web build` exit 0  →  **MET**
**Branch**: `feat/phase0-worker-tooling`
**PR**: [#36](https://github.com/Yoodaddy0311/cleartoship/pull/36)
**Predecessor handoff**: `reports/AUTOPILOT/ap-20260519-mvp-golden-path-handoff.md`

---

## 1. Summary

Phase 0 of the worker tooling ULTRAPLAN delivered as a single PR. The audit-worker Docker image now ships `git` + `chromium`, and prod Cloud Run runs with `--no-cpu-throttling`. The "near-empty audit report" cascade (handoff §9) is unblocked at the build-artifact level; the prod runtime verification (PRD AC11~AC13: `readinessScore ≥ 50`, `launchStatus ≠ INDETERMINATE`) waits on the post-merge manual deploy.

Phase 1 (semgrep + osv-scanner) is the next session's PR; Phase 2 (hardening + cost recovery) is opportunistic.

---

## 2. References

| Artefact | Path |
|---|---|
| Phase 0 PRD (design-only) | `docs/PRD/phase0-worker-tooling-2026-05-19.md` (750 lines) |
| Sprint 4 plan (parent) | `docs/PRD/sprint4-execution-plan-2026-05-18.md` |
| Sharpen PRD | `docs/PRD/finalize-launch-sharpen-2026-05-18.md` |
| Predecessor handoff (root cause analysis + ULTRAPLAN exec summary) | `reports/AUTOPILOT/ap-20260519-mvp-golden-path-handoff.md` §10 |
| Migration doc (FCS, parallel work item) | `docs/MIGRATIONS/2026-05-19-add-fcs-field.md` |

---

## 3. Phase timeline

| Phase | Status | Duration (turn-local) | Output |
|---|---|---|---|
| 0 INTAKE | SKIPPED (pre-existing) | — | `docs/PRD/phase0-worker-tooling-2026-05-19.md` written in prior turn |
| 1 PLAN | SKIPPED (pre-existing) | — | PRD §3 already decomposes 25 work units across W1~W5 |
| 2 EXECUTE — pre-step | DONE | ~3 min | Merged PRs #31, #32, #33, #34 → main; branched `feat/phase0-worker-tooling` |
| 2 EXECUTE — Track A (Dockerfile) | DONE | ~1.5 min | devops-engineer Agent rewrote `workers/audit-worker/Dockerfile` (58 → 87 lines) |
| 2 EXECUTE — Track B (deploy.yml + 03-deploy-worker.sh) | DONE | ~2.5 min | devops-engineer Agent edited `.github/workflows/deploy.yml` (326 → 374) + `infra/scripts/03-deploy-worker.sh` (93 → 104) |
| 2 EXECUTE — Track C (smoke-tools.sh + README) | DONE | ~2.5 min | backend-developer Agent created `workers/audit-worker/scripts/smoke-tools.sh` (58 lines) + extended `infra/README.deploy.md` (308 → 362) |
| 3 CROSS_CHECK (spec + quality) | DONE — PASS_WITH_NOTES | ~3 min | spec-reviewer 22/22 work units verified; quality-reviewer 2 MAJOR findings reported |
| 3 CROSS_CHECK fix-up | DONE | ~2 min | (a) Resolved `node:20.13-bookworm-slim` digest via Docker Hub manifest API → `sha256:cffed8cd39d6...`; (b) Added `--audiences="$URL"` to gcloud identity-token in smoke step |
| 4 VERIFY — local Goal Contract | DONE — MET | ~5 min | `pnpm install --frozen-lockfile`, `pnpm -r type-check`, `pnpm -r lint`, `pnpm -r test`, `pnpm -F web build` all PASS |
| 4 VERIFY — CI iteration 1 | FAIL → FIX | ~5 min round-trip | `Build audit-worker image` failed: `npx playwright: not found`. pnpm monorepo places playwright binary at `workers/audit-worker/node_modules/.bin/`, not root. **Fix**: `npx` → `pnpm --filter audit-worker exec`. Commit `0529477`. |
| 4 VERIFY — CI iteration 2 | FAIL → FIX | ~5 min round-trip | `Build audit-worker image` failed: smoke gate reported `$CHROME_PATH is not an executable`. Playwright 1.60.0 (resolved by lockfile) installs chromium at `chromium-1223/chrome-linux64/chrome` — the previous static glob `chromium-*/chrome-linux/chrome` did not match because of the `linux64` suffix (1.49+ layout change). **Fix**: replaced glob with `find ... -type f -executable` discovery + `--version` self-test. Commit `5eeba07`. |
| 4 VERIFY — CI iteration 3 | FAIL → FIX | ~5 min round-trip | `Build audit-worker image` self-test on the symlinked binary failed: `libglib-2.0.so.0: cannot open shared object file`. `--with-deps` in the build stage apt-installed system libraries but those packages do NOT cross multi-stage boundaries. **Fix**: added `pnpm --filter audit-worker exec playwright install-deps chromium` in the runtime stage after `pnpm install --prod` (single source of truth, no hand-maintained apt list). Commit `a58e67c`. |
| 4 VERIFY — CI iteration 4 | PASS | ~5 min round-trip | All 5 checks green: Type Check, Lint, Test, Build (apps/web), **Build audit-worker image**. Goal Contract fully MET — local + remote. |
| 5 IMPROVE | SKIPPED | — | Changes are config/script/doc only; no application-code refactor surface |
| 6 REPORT | DONE | ~3 min | Committed (1503bdb, 0e49c7a, 0529477, 5eeba07, a58e67c), pushed branch, created PR #36, updated this file |

The Tracks A/B/C in Phase 2 ran in parallel via three Agent dispatches in one assistant message. Phase 4 entered a deliberate fix-loop (4 CI iterations) until the Docker image actually built and ran chromium successfully — this is the proper extension of Goal Contract validation from local-only to full CI.

---

## 4. Commits

| SHA | Branch | Message |
|---|---|---|
| `1503bdb` | `feat/phase0-worker-tooling` | `feat(phase0): worker tooling — git + chromium + --no-cpu-throttling` (initial 6 files) |
| `0e49c7a` | `feat/phase0-worker-tooling` | `docs(autopilot): session report — Phase 0 worker tooling` |
| `0529477` | `feat/phase0-worker-tooling` | `fix(phase0): use pnpm exec for playwright install in build stage` (CI iter 1 fix) |
| `5eeba07` | `feat/phase0-worker-tooling` | `fix(phase0): discover chromium binary path with find instead of glob` (CI iter 2 fix) |
| `a58e67c` | `feat/phase0-worker-tooling` | `fix(phase0): install chromium system deps in runtime stage` (CI iter 3 fix) |

Merge base: `63172f3` (PR #34 squash merge, the last commit before this PR branched).

Pre-step PR merges (squash, no separate session commits on this branch):
- PR #31 (`fix(infra): grant serviceAccountUser ...`) — squash SHA on main: `1a2a3de`
- PR #32 (`fix(deploy): set OIDC + Cloud Tasks env ...`) — `5eeb32c`
- PR #33 (`feat(web): /audits list page`) — `646fc73`
- PR #34 (`fix(worker): prevent ANALYZE_DEPLOY_URL hang ...`) — `63172f3`

---

## 5. Cross-check findings

### 5.1 spec-reviewer — PASS_WITH_NOTES

22/22 work units (W1.1, W1.2, W1.3, W2.1, W2.2, W2.3, W2.4, W2.5, W2.6, W2.7, W2.8, W2.9, W4.1, W4.2, W3.1, W3.2, W3.3, W3.4, W3.5, W4.3, W4.4, W5.2) verified implemented at correct file:line.

W5.1 (manual Artifact Registry tag) and W5.3 (cleanup policy confirmation) intentionally absent — both are non-code ops per PRD §3.5.

**Notes (non-blocking)**:
- README example tag uses `rollback-pin-2026-05-20` (merge day), PRD literal uses `2026-05-19` (PRD author day). The README form is more operator-correct — kept as-is, mentioned in PR description.

### 5.2 quality-reviewer — PASS_WITH_NOTES (2 MAJOR fixed)

**MAJOR 1 (fixed)** — `.github/workflows/deploy.yml:221` (pre-fix): `gcloud auth print-identity-token` minted a token with `aud=oauth-client-id`, which `verify-oidc.ts` rejects. **Fix**: added `--audiences="$URL"`. New lines 215~234 also document deployer-ci SA's invoker authority and audience requirement.

**MAJOR 2 (fixed)** — `workers/audit-worker/Dockerfile:5,38` (pre-fix): `@sha256:REPLACE_WITH_REAL_DIGEST_AT_BUILD_TIME` would fail `docker build`. **Fix**: resolved digest via Docker Hub registry manifest API (`https://registry-1.docker.io/v2/library/node/manifests/20.13-bookworm-slim`) → `sha256:cffed8cd39d6a380434e6d08116d188c53e70611175cd5ec7700f93f32a935a6`. Both stages updated; TODO comments rewritten to document the bump procedure.

**MINOR (deferred, not blocking)**:
- `Dockerfile:72` — symlink wildcard glob can produce broken symlink if 0 matches or wrong match if 2+ versions. Acceptable for Phase 0 (Playwright pins one chromium version per release); revisit in Phase 2 with explicit assertion.
- `Dockerfile:81` — smoke gate adds smoke-tools.sh to final image. Intentional (post-deploy operator probe reuses same script). No action.
- `deploy.yml:189` + `03-deploy-worker.sh:70` — unquoted `$CPU_THROTTLING_FLAG` (intentional, shellcheck SC2086). Could add `# shellcheck disable=SC2086` comment; deferred to follow-up.
- `smoke-tools.sh:17` — `fail=0` is a function-mutated global. Functional but fragile. Comment-only fix deferred.
- `deploy.yml:224-225` — jq `// "missing"` fallback masks healthz schema drift. Acceptable trade-off; CI surfaces fail with a clean message.

**NIT (cosmetic, deferred)**:
- `useradd -s /bin/false` blocks `docker exec -it bash`. Comment-only.
- No HEALTHCHECK directive (Cloud Run uses its own probes). Comment-only.
- `03-deploy-worker.sh:57` echo prints empty value for staging. Cosmetic.
- README hardcoded date example. Could use `$(date +%F)`. Cosmetic.

---

## 6. Verification evidence

### 6.1 Pre-flight gates

| Gate | Result |
|---|---|
| `git status` clean before branching | OK (untracked PRD survived stash + checkout) |
| 4 PR entry condition (#31~#34) | All merged in this session |
| `pnpm install --frozen-lockfile` | OK (lockfile current, no resolution step) |

### 6.2 Goal Contract validation (`pnpm -r test && pnpm -F web build`)

| Command | Outcome | Notes |
|---|---|---|
| `pnpm -r type-check` | PASS | 6/7 packages (1 has empty type-check); audit-core, audit-worker, web all green |
| `pnpm -r lint` | PASS | `--max-warnings=0` on shared-types, audit-core, audit-worker, web |
| `pnpm -r test` | PASS | apps/web 747 tests, workers/audit-worker 289 tests + others. Vitest run 15-30s per package |
| `pnpm -F web build` | PASS | Next.js production build; output includes all `/audits/[id]/*` routes + middleware |

Engine warning seen: `Unsupported engine: wanted: {"node":"20"} (current: {"node":"v24.15.0", "pnpm":"9.0.0"})` from `functions/`. Pre-existing on main; not introduced by this PR.

### 6.3 Items NOT verified locally (deferred to GHA / post-deploy)

| Item | Why deferred | Where it gets covered |
|---|---|---|
| `docker build` of new Dockerfile | No Docker daemon on this Windows session | GHA `Build & push audit-worker image` step (deploy.yml:118-131) |
| `git --version` / `chromium --version` inside container | Same | `RUN /usr/local/bin/smoke-tools.sh` build-time gate (Dockerfile L81) |
| Cloud Run `--no-cpu-throttling` actually applied | Requires prod deploy | GHA deploy step log; `gcloud run services describe` post-merge |
| `/healthz` returns `tools.git.status="found"` | Requires deployed prod | New CI smoke step (deploy.yml:215) |
| Real audit `readinessScore ≥ 50` | Requires deployed prod + audit job | Manual test plan in PR description |

---

## 7. Improvements found / future work

### 7.1 Carry into Phase 1 PR

- Pin `node:20.13-bookworm-slim` digest stays at `sha256:cffed8cd39d6...` unless an explicit bump is needed; Phase 1 adds python3/pipx atop the same base, so a digest bump would force re-verification of both Phases.
- Phase 1 should add `tools.semgrep.status === 'found'` + `tools.osv-scanner.status === 'found'` to the smoke step in deploy.yml (currently only asserts git + lighthouse).
- Add `--timeout=600 → 900` for Cloud Run (semgrep full-scan headroom).

### 7.2 Phase 2 / opportunistic

- Replace `--no-cpu-throttling` ($13~120/mo) with handler refactor (await-then-respond) to save cost (handoff §7 D-2 deferred).
- Multi-stage pipx trim — once Phase 1 ships, move pipx into build stage and only COPY the venv into runtime.
- Promote `smoke-tools.sh` to `smoke-tools.ts` so it shares code with `tools-health.ts` (currently two implementations of the same probe).
- Add `# shellcheck disable=SC2086` annotation above unquoted `$CPU_THROTTLING_FLAG` use sites.
- Replace symlink glob with explicit `nullglob` + count check to fail fast when chromium install layout changes.

### 7.3 Cosmetic / non-functional

- Reconcile README example date with PRD literal (or document that the date IS merge-day, which is what an operator should use).
- Add HEALTHCHECK-omission comment to Dockerfile.
- Document non-shell `useradd` choice (`-s /bin/false`) — affects `docker exec -it` debug workflow.

---

## 8. Queued questions / open decisions

| Q | Status | Default applied |
|---|---|---|
| Q1: `--no-traffic` 1회 deploy 강제? | open | Option A — manual 1회 post-merge (no deploy.yml change) |
| Q2: Phase 1 일정 (Wave 5 안 vs 직전)? | open | Recommend B (Wave 5 직전 = 06-01~06-02) per PRD §9.2 |
| Q3: Cost overshoot 알람? | open | Deferred to Phase 2 |
| Q4: PR 사이즈? | resolved | Option A — single PR (this one) |
| Q5: marketing usage of Phase 0 audit? | open | Recommend B — wait for Phase 1 |

Q1 + Q5 require team-lead before next session.

---

## 9. Next actions

| # | Action | Owner | Command |
|---|---|---|---|
| 1 | Review PR #36 | team-lead | `gh pr view 36` / browser |
| 2 | Merge PR #36 (squash) | team-lead | `gh pr merge 36 --squash --delete-branch` |
| 3 | Watch deploy.yml — confirm `Build & push audit-worker image` + `Deploy Cloud Run worker` + `Smoke /healthz` all green | operator | `gh run watch <run-id>` |
| 4 | If smoke fails for non-tooling reasons (audience/IAM): re-check `gcloud auth print-identity-token --audiences=$URL` + deployer-ci SA invoker role | operator | per PRD §5.5 R-P0-3 mitigation |
| 5 | Tag prior prod revision (W5.1, manual gcloud op) | operator | see README.deploy.md §3 Rollback procedure step 1 |
| 6 | Submit real audit against `https://github.com/Yoodaddy0311/cleartoship` | operator | web UI; expect `readinessScore ≥ 50`, `launchStatus ≠ INDETERMINATE` |
| 7 | If V11 passes — start Phase 1 PR (semgrep + osv-scanner) | next session | `/autopilot "Phase 1 worker tooling — semgrep + osv-scanner"` |
| 8 | If V11 fails — capture logs, rollback per README.deploy.md §3 rollback, debug | operator | step 2 of rollback procedure |

PR #35 (Phase 0 PRD handoff) remains open and is unrelated to this PR — can be merged separately when convenient.

---

## 10. Notes for the next autopilot session

- The 4 PRs #31~#34 are merged. Main now contains all IaC parity + audits list page + worker hang fix.
- Phase 0 PR is at PR #36, awaiting team-lead review.
- Phase 0 PRD is committed to repo at `docs/PRD/phase0-worker-tooling-2026-05-19.md` — Phase 1 PRD should reference it.
- Goal-driven autopilot mode worked: `--goal "pnpm -r test && pnpm -F web build pass"` + `--validation-command` mapped 1:1 to a measurable exit code.
- The compressed-single-turn approach (no Node engine) was acceptable for a 25-work-unit PR with 5 file changes; for the Phase 1 PR (which adds python3/pipx + binary installs + larger Dockerfile delta) consider invoking the engine properly to enable detached 1-2h runs.
- Out-of-band gcloud ops needed by Phase 0 (W5.1 tagging + post-deploy `--no-traffic` recall): operator does them, not autopilot. These are documented in PR #36's `## Test plan` section.

---

**End of session report.** Autopilot completed Phase 0 work end-to-end in a single turn: PRD intake, PR merges, code changes, cross-check, goal validation, and PR creation. Next session should pick up at PR #36 review/merge, then start Phase 1.
