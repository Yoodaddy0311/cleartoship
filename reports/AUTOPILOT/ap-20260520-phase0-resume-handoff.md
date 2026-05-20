# Resume Handoff — 2026-05-20, end of Phase 0 autopilot

Successor to `ap-20260520-phase0-worker-tooling.md` (session report). This document is the **next-session boot loader** — read it first, do these steps, then start new work.

If you are reading this AFTER PR #36 merged and the prod cleartoship self-audit shows `readinessScore ≥ 50`, skip to §5 (Phase 1 kickoff).

If you are reading this BEFORE that, follow §1~§4 in order.

---

## 0. Quick state snapshot (as of session end)

| Item | Value |
|---|---|
| Branch we left on | `feat/phase0-worker-tooling` (HEAD = `cc7a37a`) |
| Open PRs | #35 (handoff doc, independent), #36 (Phase 0, ready to merge), #37+ (none) |
| PR #36 CI | 5/5 PASS — Type Check, Lint, Test, Build (apps/web), Build audit-worker image |
| Prior prod worker revision | `audit-worker-00026-srx` (Phase 0 baseline, score=21) |
| New prod worker revision | will be created when #36 merges (deploy.yml auto-deploys) |
| Phase 0 PRD | `docs/PRD/phase0-worker-tooling-2026-05-19.md` (750 lines, committed in #36) |
| Goal Contract | `pnpm -r test && pnpm -F web build` — **MET** locally + CI |
| Open team-lead Q | Q1/Q3/Q5 (defaults applied — see §6) |

---

## 1. Re-entry (5 min)

### 1.1 Fresh machine? Restore project memory FIRST

The auto-memory system reads from `~/.claude/projects/<slug>/memory/` (per-machine), not from the repo. If this is a new machine or a fresh checkout, the memory dir is empty until you run:

```bash
# bash / git-bash / WSL
bash scripts/sync-claude-memory.sh
```

```powershell
# PowerShell (Windows)
& scripts\sync-claude-memory.ps1
```

This installs the 5 repo-committed memory entries (`project_phase0_status`, `project_next_actions`, `feedback_pnpm_monorepo_docker`, `reference_phase0_prd`, `reference_lint_tools`) into the local memory dir. Future Claude Code sessions on this machine will auto-load them.

Idempotent: re-running without `--force`/`-Force` skips existing files. With the flag, repo content overwrites local AND any local-only entries (e.g. `user_profile.md`) are preserved in `MEMORY.md` index automatically.

### 1.2 Sync git + check PR #36

```powershell
cd "C:\Users\HeechangLee\Desktop\ClearToShip\repo"
git fetch origin
git status                              # may still be on docs/handoff-... branch — that's fine
gh pr checks 36                         # expect: 5/5 PASS
gh pr view 36                           # eyeball the description
```

If any check is now red, something landed on main since the session. Investigate before merging.

---

## 2. Merge PR #36 + sync

```powershell
gh pr merge 36 --squash --delete-branch
git checkout main
git pull --ff-only
git log --oneline -3                    # newest commit is the squash of Phase 0
```

The merge triggers `.github/workflows/deploy.yml` automatically. Open the run:

```powershell
gh run watch                            # picks the latest run
```

The new build will:
1. Build the audit-worker image with the new Dockerfile (bookworm-slim + git + chromium).
2. Push to Artifact Registry as `audit-worker:sha-<new>` + `:latest`.
3. Deploy to Cloud Run with `--no-cpu-throttling` for prod.
4. Run the new `Smoke /healthz — assert git + lighthouse found` step.
5. Continue into web-ssr deploy + firebase deploy (same as before Phase 0).

If `Smoke /healthz` fails:
- Most likely cause: `gcloud auth print-identity-token --audiences=$URL` token rejected by worker. Either (a) deployer-ci SA lost `roles/run.invoker`, or (b) verify-oidc.ts audience env mismatch. Run `gcloud run services describe audit-worker ... --format='value(spec.template.spec.containers[0].env)'` and compare with `AUDIT_WORKER_URL`.
- Second most likely: chromium/git probe returned `missing` despite the new image — re-pull the image locally and run `smoke-tools.sh` inside it.

---

## 3. Manual ops the autopilot did NOT do

These are operator-only because they require live gcloud auth.

### 3.1 Recall traffic to prior revision (R-P0-3 mitigation)

Right after the deploy step finishes, BEFORE walking away, recall traffic so the new revision exists but doesn't serve users until you verify it:

```powershell
$env:CLOUDSDK_PYTHON = "C:\Users\HeechangLee\AppData\Local\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"

# Confirm new revision was created
gcloud run services describe audit-worker `
  --region=asia-northeast3 --project=cleartoship-prod `
  --format='value(status.latestReadyRevisionName,status.traffic[].revisionName,status.traffic[].percent)'

# Recall 100% traffic to the Phase 0 baseline revision
gcloud run services update-traffic audit-worker `
  --region=asia-northeast3 --project=cleartoship-prod `
  --to-revisions=audit-worker-00026-srx=100
```

### 3.2 Verify new revision on its tagged URL (V10~V13)

The new revision now exists but receives 0% traffic. You can hit it directly via the revision-specific URL:

```powershell
$NEW_REV = (gcloud run services describe audit-worker `
  --region=asia-northeast3 --project=cleartoship-prod `
  --format='value(status.latestReadyRevisionName)')
$URL_TAG = "https://$NEW_REV---audit-worker-t4fpcxe2ha.a.run.app"   # revision-specific (verify with `gcloud run revisions describe`)

$TOKEN = (gcloud auth print-identity-token --audiences=$URL_TAG)
Invoke-WebRequest -Uri "$URL_TAG/healthz" -Headers @{Authorization="Bearer $TOKEN"} | Select-Object -ExpandProperty Content
```

Expected JSON shape (Phase 0 surface only):
```json
{
  "status": "ok",
  "toolsStatus": "degraded",
  "tools": {
    "git": { "status": "found", "version": "git version 2.39.5" },
    "lighthouse": { "status": "found", "version": "..." },
    "semgrep": { "status": "missing" },
    "osv-scanner": { "status": "missing" }
  }
}
```

`semgrep` and `osv-scanner` stay `missing` until Phase 1 ships — that is **expected**, not a failure.

### 3.3 Promote new revision to 100%

Once §3.2 passes:

```powershell
gcloud run services update-traffic audit-worker `
  --region=asia-northeast3 --project=cleartoship-prod --to-latest
```

### 3.4 Pin prior revision image for rollback (AC18, W5.1)

```powershell
$PRIOR_IMAGE = (gcloud run revisions describe audit-worker-00026-srx `
  --region=asia-northeast3 --project=cleartoship-prod `
  --format='value(spec.containers[0].image)')

gcloud artifacts docker tags add $PRIOR_IMAGE `
  asia-northeast3-docker.pkg.dev/cleartoship-prod/cleartoship-images/audit-worker:rollback-pin-2026-05-20 `
  --project=cleartoship-prod
```

(If `audit-worker-00026-srx` has been GC'd, substitute whatever revision was `latestReady` before the Phase 0 deploy.)

---

## 4. KPI verification — real audit run (AC11~AC13)

This is the **Phase 0 success gate**. If this fails, Phase 0 is NOT done regardless of CI being green.

1. Visit the web-ssr URL (or `gcloud run services describe web-ssr ...` then browse).
2. Submit `https://github.com/Yoodaddy0311/cleartoship` as the audit target.
3. Wait ~5-15 min for pipeline completion.
4. Check the resulting `auditRuns/<newId>`:
   - `status === 'COMPLETED'`
   - `readinessScore >= 50` (Δ from baseline 21 ≥ +29)
   - `launchStatus !== 'INDETERMINATE'`
   - Worker logs for that runId should show 0 `git clone failed` events.
   - Step 09 (analyze-deploy-url) should complete in < 60s, not 11 min.

If KPI met → Phase 0 truly done → proceed to §5.
If KPI not met:
- Open the audit's findings — which categories still 0?
- Check worker logs for that runId — which step still SKIPPED?
- The 5 pure-Node tools (secret-scan, risky-fn, prisma, design-consistency, business-readiness) should now run since git works.
- If they still SKIP, debug ctx.clonePath wiring in `workers/audit-worker/src/pipeline/steps/03-clone-repo.ts` before Phase 1.

---

## 5. Phase 1 kickoff

Phase 1 scope is `docs/PRD/phase0-worker-tooling-2026-05-19.md` §7.1. In short:
- `apt-get install python3 python3-pip pipx` in runtime stage
- `pipx install semgrep==1.86.0`
- Pre-warm semgrep registry cache at build time (`semgrep --config p/owasp-top-ten --dryrun`)
- osv-scanner v1.9.2 binary from GitHub Releases (SHA256 verify)
- Extend deploy.yml smoke step to assert all 4 tools `found`
- Bump Cloud Run `--timeout=600 → 900`

Suggested invocation: `/autopilot "Phase 1 worker tooling — semgrep + osv-scanner"` (or `/plan` first if scope review needed).

**Pre-apply the 3 patterns from `feedback_pnpm_monorepo_docker.md` (auto memory)**:
1. Workspace binaries — use `pnpm --filter <pkg> exec` not `npx`
2. Build-time self-tests for new binaries — `semgrep --version`, `osv-scanner --version` inside the symlink/install RUN
3. If anything Playwright-adjacent: `install-deps` runs in runtime stage, not build

These were burnt in by Phase 0's 4-iteration CI loop. Don't redo the lesson.

---

## 6. Decisions already applied (PRD §9, reversible)

| ID | Q | Default chosen | Notes |
|---|---|---|---|
| Q1 | `--no-traffic` strategy? | A — manual 1회 procedure (§3.1) | Did NOT add `--no-traffic` to deploy.yml. Operator must recall traffic each merge until Phase 2. |
| Q2 | Phase 1 schedule? | B — 06-01~06-02 (Wave 5 직전) | Recommendation; user can override. |
| Q3 | Cost alert? | Deferred to Phase 2 | No billing alert added in Phase 0. |
| Q4 | PR size? | A — single PR | This is PR #36. |
| Q5 | Marketing use of Phase 0 audit? | Wait for Phase 1 | Cleaner narrative once vulnerability scan is included. |

If user reverses any of these in a future session, the PRD has the alternative discussion at §9.

---

## 6.5 Static lint verification (added 2026-05-20, post-CI-green)

Ran shellcheck + hadolint + actionlint locally as an independent check beyond the cross-reviewer agents. **No merge-blocking findings.** All detected items are either intentional, false positives, or Phase 2 polish candidates.

### Tools (installed via winget, persistent)

```powershell
winget install --id=koalaman.shellcheck --silent
winget install --id=hadolint.hadolint   --silent
winget install --id=rhysd.actionlint    --silent
```

Binary paths (in `~/AppData/Local/Microsoft/WinGet/Packages/<id>/`):
- `koalaman.shellcheck_..._8wekyb3d8bbwe/shellcheck.exe`
- `hadolint.hadolint_..._8wekyb3d8bbwe/hadolint.exe`
- `rhysd.actionlint_..._8wekyb3d8bbwe/actionlint.exe`

After installation, PATH update requires a new shell. Until then, invoke by absolute path.

### Reproduction commands

```bash
# From repo root, with linters on PATH:
shellcheck workers/audit-worker/scripts/smoke-tools.sh                # clean
git show HEAD:infra/scripts/03-deploy-worker.sh | shellcheck -        # 1 INFO (SC2086 intentional)
hadolint workers/audit-worker/Dockerfile                              # 3 warnings + 1 info (see below)
git show HEAD:.github/workflows/deploy.yml | actionlint -            # clean
```

CRLF caveat: `infra/scripts/03-deploy-worker.sh` and `.github/workflows/deploy.yml` carry CRLF in the Windows working tree because of `core.autocrlf=true`. Git stores both as LF (verify with `git ls-files --eol`); CI/Linux see LF. Pipe via `git show HEAD:<path>` to bypass the local CRLF noise.

### Findings — accepted as-is

| Tool | Code | Location | Verdict | Reason |
|---|---|---|---|---|
| shellcheck | SC2086 | `03-deploy-worker.sh:70` (`$CPU_THROTTLING_FLAG`) | INTENTIONAL | Word-splitting drops the empty staging flag without an `if` branch. Documented in PRD §3.3 W3.3 and in [[feedback_pnpm_monorepo_docker]] (Rule 1 pattern). |
| hadolint | DL3008 | `Dockerfile:10` (build apt) + `Dockerfile:53` (runtime apt) | PHASE 2 POLISH | apt package version pinning. Debian stable + frozen base-image digest already provide reproducibility within reasonable bounds. Bumping `git`/`ca-certificates` versions is rarely the cause of build drift. |
| hadolint | DL4006 | `Dockerfile:94` (find/symlink RUN) | FALSE POSITIVE | hadolint flags any RUN with potential pipes for `pipefail`. The block uses `&&` chains plus `\|\| { ... ; exit 1; }` — no actual pipeline. Could silence with `# hadolint ignore=DL4006` but the rule may surface a real issue if a future RUN adds a pipe; better to leave noisy than mute. |
| hadolint | DL3059 | `Dockerfile:110-111` (two separate chown RUNs) | INTENTIONAL | PRD §3.2 explicitly separated `/app` and `/opt/ms-playwright` chowns into distinct layers to scope cache invalidation. Consolidating would re-bust the larger /app layer every time the playwright dir changes. |

### Phase 2 backlog (formal entry)

Add to `docs/PRD/phase0-worker-tooling-2026-05-19.md` §7.2 (Phase 2) when starting that PR:

> **Phase 2 cleanup item — apt version pinning**: address hadolint DL3008 on `Dockerfile:10` and `Dockerfile:53` by pinning exact debian package versions (e.g., `git=1:2.39.5-0+deb12u3 ca-certificates=20230311`). Requires a periodic bump cadence (every 3-6 months) tied to the base-image digest bump. Pair with a `dpkg -l > /tmp/expected-deps.lock` snapshot in CI so drift is detected.

### Phase 1 prep hint

Phase 1 (semgrep + osv-scanner) will add more `apt-get install` and binary-download steps. Pre-run all 3 linters on the Phase 1 Dockerfile before pushing the first CI run — Phase 1 has 5+ install commands vs Phase 0's 2, so the DL3008 noise scales linearly. Decide upfront whether Phase 1 commits to version pinning OR adds inline `# hadolint ignore=DL3008` comments at each apt line.

---

## 7. Reference index

| Topic | File |
|---|---|
| This handoff | `reports/AUTOPILOT/ap-20260520-phase0-resume-handoff.md` |
| Phase 0 session report (4 CI iterations recorded) | `reports/AUTOPILOT/ap-20260520-phase0-worker-tooling.md` |
| Phase 0 PRD (work units + risks + AC) | `docs/PRD/phase0-worker-tooling-2026-05-19.md` |
| Predecessor handoff (root-cause analysis of empty audit) | `reports/AUTOPILOT/ap-20260519-mvp-golden-path-handoff.md` |
| Sprint 4 plan (parent context) | `docs/PRD/sprint4-execution-plan-2026-05-18.md` |
| Sharpen PRD | `docs/PRD/finalize-launch-sharpen-2026-05-18.md` |
| Auto memory (key facts) | `~/.claude/projects/C--Users-HeechangLee-Desktop-ClearToShip/memory/*.md` |

---

**End of resume handoff.** Total operator time for §1~§4 = ~45 min including a real audit. After that, the project is in "Phase 0 SHIPPED + Phase 1 ready to start" state.
