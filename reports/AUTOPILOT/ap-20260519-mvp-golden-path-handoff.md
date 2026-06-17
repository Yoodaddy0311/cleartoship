# Handoff — 2026-05-19 (Session 3, MVP Golden Path)

Successor to `ap-20260519-deploy-unblock-handoff.md`. Picks up where that one stopped (web-ssr deploy unblocked) and continues through the rest of the audit pipeline until a real audit run completed end-to-end in production.

## 1. Why this session existed

Prior handoff left the MVP unable to be exercised in prod: web-ssr wasn't deployed, and a series of follow-on bugs (cloud SDK module loading, IAM, missing env, hung pipeline) needed to fall over before a real audit-run could move from PENDING → COMPLETED.

This session moved an audit run all the way through. The audit *completes* but produces a near-empty report — every analysis tool the worker uses (git / chromium / semgrep / osv-scanner) is missing from the Sprint-0 worker Docker image. That's the next session's headline work, and there's a `/ultraplan` for it captured in §10 below.

## 2. Current state (live, prod)

| Service | Revision | Status |
|---|---|---|
| Cloud Run `web-ssr` | `web-ssr-00005-nl9` (image `sha-6841532`) | 100% traffic, serving |
| Cloud Run `audit-worker` | `audit-worker-00026-srx` | 100% traffic, serving; env now includes `AUDIT_WORKER_URL` + `AUDIT_WORKER_INVOKER_SA` |
| Cloud Run `onauditruncreated` (Cloud Functions v2 backing) | `onauditruncreated-00002-wxz` | 100% traffic, serving; env now includes CLOUD_TASKS_* + AUDIT_WORKER_URL + AUDIT_WORKER_INVOKER_SA |
| Firebase Hosting Function `ssrcleartoshipprod` | FAILED state (Sprint-2 carryover) | Not in use — we ship via web-ssr Cloud Run instead |
| Cloud Tasks `audit-jobs` queue | RUNNING, empty | Last consumed task at 07:14, all subsequent tasks succeeded |

Most recent audit run: `auditRuns/f9yNjdD3rDzEYrrps9hA` — `status=COMPLETED, progress=100, readinessScore=21, launchStatus=INDETERMINATE`. Score is low because every code/UI analysis tool was SKIPPED in the worker image (see §9).

## 3. PRs merged this session (4)

| # | Title | Merge SHA | What it fixed |
|---|-------|-----------|---|
| 28 | `fix(web): drop standalone, use pnpm prod install + next start` | `94cb527` | Next.js standalone mode dropped; runtime stage installs full prod deps so dynamic `require()` patterns in @google-cloud/* SDKs resolve |
| 29 | `fix(web): invoke next via node directly to bypass corepack` | `1bd677a` | CMD now `node node_modules/next/dist/bin/next start` — bypasses corepack's `Cannot find matching keyid` failure on the alpine image |
| 30 | `fix(web): externalize Google Cloud + firebase-admin in server bundle` | `6841532` | `serverExternalPackages` config — stops webpack from inlining cloud SDK modules with build-time absolute pnpm paths |

Plus one more merge **just before this session started** (it was the predecessor):
- 27 (already merged) — outputFileTracingIncludes for standalone (now inert because #28 dropped standalone, but harmless)

## 4. PRs open at handoff (4)

| # | Branch | Title | Why open | What it actually does |
|---|---|---|---|---|
| 31 | `fix/iam-web-ssr-actas-invoker` | `fix(infra): grant serviceAccountUser on cloud-run-invoker to web-ssr + functions` | IaC parity — already applied via gcloud out-of-band | Adds `roles/iam.serviceAccountUser` on `cloud-run-invoker` SA for `web-ssr-runtime` + `functions-runtime`. Required for Cloud Tasks `iam.serviceAccounts.actAs` check. |
| 32 | `fix/worker-functions-env-vars` | `fix(deploy): set OIDC + Cloud Tasks env on audit-worker and functions` | IaC parity — already applied via gcloud out-of-band | (a) Two-pass worker deploy: capture URL after first deploy, then `--update-env-vars=AUDIT_WORKER_URL=$URL` so OIDC audience matches. (b) Writes `functions/.env.<project-id>` before `firebase deploy --only functions` so onAuditRunCreated has CLOUD_TASKS_* + worker URL. |
| 33 | `feat/audits-list-page` | `feat(web): /audits list page` | UX gap (sidebar 404) | New `apps/web/app/audits/page.tsx` + GET handler on `/api/audit-runs`. CI green; no prod risk. |
| 34 | `fix/worker-deploy-url-hang` | `fix(worker): prevent ANALYZE_DEPLOY_URL hang on missing chrome binary` | Stops the 11-minute chrome-launcher path-search hang at step 12 | Pre-launch probe (`Launcher.getInstallations`) + outer timeout race. Falls through cleanly under test mocks. 9/9 unit tests pass. |

**All four are MERGEABLE per `gh pr list`.** They can be merged in any order. The next session's first action should be to merge them so the IaC matches the live state.

## 5. Out-of-band gcloud / Firestore operations this session

Each is folded into the corresponding open PR (column 4), but the binding/setting is already live in GCP.

1. `gcloud iam service-accounts add-iam-policy-binding cloud-run-invoker@cleartoship-prod.iam.gserviceaccount.com --member='serviceAccount:web-ssr-runtime@…' --role='roles/iam.serviceAccountUser'` → PR #31
2. Same again for `functions-runtime@…` → PR #31
3. `gcloud run services update audit-worker --update-env-vars='AUDIT_WORKER_URL=https://audit-worker-t4fpcxe2ha-du.a.run.app,AUDIT_WORKER_INVOKER_SA=cloud-run-invoker@cleartoship-prod.iam.gserviceaccount.com'` → PR #32
4. `gcloud run services update onauditruncreated --update-env-vars='CLOUD_TASKS_PROJECT=cleartoship-prod,CLOUD_TASKS_LOCATION=asia-northeast3,CLOUD_TASKS_QUEUE=audit-jobs,AUDIT_WORKER_URL=…,AUDIT_WORKER_INVOKER_SA=…'` → PR #32
5. Firestore PATCH on `auditRuns/f9yNjdD3rDzEYrrps9hA` — manually flipped status=FAILED while the pipeline was actually still progressing (premature diagnosis). Worker then completed and overwrote with COMPLETED. Followed by a cleanup PATCH to clear the stale `errorMessage`. **Lesson recorded in §11.**

## 6. The bug chain we walked, in order

This is the critical sequence; the next session may hit related issues and the pattern is useful.

1. **MODULE_NOT_FOUND on `cloud_tasks_client_config.json`** at POST /api/audit-runs. Root cause: webpack inlined @google-cloud/tasks at build time with absolute pnpm paths; the runtime install had different paths. Fix: PR #30 (`serverExternalPackages`).
2. **`7 PERMISSION_DENIED: lacks "iam.serviceAccounts.actAs"`** on the same endpoint. Root cause: only `roles/iam.serviceAccountTokenCreator` was bound (mints OIDC tokens); Cloud Tasks ALSO requires `actAs` which lives in `roles/iam.serviceAccountUser`. Fix: PR #31 / gcloud op 1+2.
3. **Audit doc shows `enqueueMode: "stub"`** even though web-ssr enqueued cloud-tasks. Root cause: the Firestore onCreate trigger races with the API handler. Trigger fires on the initial doc (enqueueMode=null), reads its own env (which was unset), takes the stub branch, overwrites the API path's `cloud-tasks` write. Fix: PR #32 — give the function the same env vars as web-ssr.
4. **audit-worker returns 503 to every Cloud Tasks dispatch.** Root cause: `verify-oidc.ts:120-130` fails closed in prod when `AUDIT_WORKER_URL` or `AUDIT_WORKER_INVOKER_SA` is unset. Worker deploy only set `PROJECT_ID,REGION,NODE_ENV`. Fix: gcloud op 3 + PR #32 second pass.
5. **Pipeline "stuck" at ANALYZE_DEPLOY_URL 60%.** Root cause was *not* a hang — Cloud Run throttles CPU after `res.json()` returns; chrome-launcher's no-Chrome path search, normally <1s, stretched to 11 minutes under throttling. The pipeline eventually completed at 19 min. PR #34 adds a pre-launch probe + outer timeout so we don't pay the 11-min tax again, but the underlying CPU throttle is the bigger issue (decision in §10).

## 7. Open architectural decisions (carried forward)

| ID | Decision needed | Cost | Default |
|---|---|---|---|
| D-1 | Worker base image: `node:20.13-bookworm-slim` + manual installs **vs** `mcr.microsoft.com/playwright:v1.45.0-jammy` | Cold start delta ~7s | Bookworm-slim (justified in ultraplan §Decision 1) |
| D-2 | CPU throttling: `--no-cpu-throttling` **vs** await-then-respond handler refactor | $120/mo for option A, $0 + test churn for option B | Option A (justified in ultraplan §Decision 2) |
| D-3 | Domain for prod web-ssr: keep `web-ssr-t4fpcxe2ha-du.a.run.app` **vs** custom domain | $0 vs ~$12/yr | TBD — punt until billable users |
| D-4 | Failed `ssrcleartoshipprod` Cloud Function: leave **vs** delete | $0 vs cleanup churn | Delete (Option C in prior handoff §6 selected web-ssr Cloud Run; Hosting Function is dead) |

## 8. Outstanding terraform follow-ups (carried over from previous handoff §7 + new)

| ID | Item | Status |
|---|---|---|
| TF-FU-1 | `uploads_bucket` mismatch — `${var.project_id}.appspot.com` vs the real `cleartoship-prod.firebasestorage.app` | Untouched. Will surface as a worker Storage 403 if/when an audit attaches PDFs. |
| TF-FU-2 | `audit_run_p95_latency` alert on GAUGE metric with ALIGN_PERCENTILE_95 | Untouched. Alerts don't fire. |
| TF-FU-3 | `firebase projects:addfirebase` + Storage default bucket REST creation | Untouched. Fresh project bootstraps still manual. |
| TF-FU-4 (new) | actAs IAM bindings now exist in IaC (PR #31) but `terraform.tfstate` was applied months ago — next `terraform apply` will show two new resources to add. State drift, not a problem. | PR #31 pending merge |
| TF-FU-5 (new) | The four open PRs (#31, #32, #33, #34) all need merge. Out-of-band gcloud changes survive until terraform/gcloud-script reapplies. | Pending |
| FOLLOWUP-1..6 | Sprint 4 carryovers from `ap-20260518-sprint4-complete-handoff.md` | Still untouched — not investigated this session |

## 9. Why the audit report is near-empty — and the plan to fix it

A real audit run completed (`f9yNjdD3rDzEYrrps9hA`) but `readinessScore=21`, `launchStatus=INDETERMINATE`, ~all tools SKIPPED. Confirmed via worker logs:

```
[error] git clone failed |meta={"error":"spawn git ENOENT"}    # cascades to 8 steps
[warn] Semgrep skipped — no clone path
[warn] OSV-Scanner skipped — no clone path
[warn] Secret scan skipped — no clone path   # actually pure-JS, just cascaded from clone fail
[warn] Risky function discovery skipped — no clone path  # actually pure-JS
[warn] Data model analysis skipped — no clone path  # actually pure-JS
[warn] Design consistency skipped — no clone path  # actually pure-JS
[warn] Playwright run failed |meta={"error":"Executable doesn't exist"}
[warn] Lighthouse failed |meta={"error":"CHROME_PATH env must be set"}
```

**Key insight (from this session's planner agent):** only **3 tools** truly need new binaries — `git`, `semgrep`, `osv-scanner`, plus Chromium. The other 5 "missing" items (secret-scanner, risky-function-discovery, prisma-analyzer, design-consistency, business-readiness) are **already pure-Node** in `packages/audit-core`. They skip only because step 03 sets `clonePath=null` when git is missing. **Installing git alone unblocks 8 of 11 broken steps.**

## 10. ULTRAPLAN — Worker tooling phased plan (for next session)

Full plan ran in this session via the planner agent. Three phases, 18 steps, files-to-touch lists, risk register included. The full plan is preserved verbatim in the conversation transcript; the executive summary:

### Phase 0 (1 PR, 1 day) — minimum-viable production audit

- Switch base: `node:20.13-alpine` → `node:20.13-bookworm-slim`
- `apt-get install -y --no-install-recommends git ca-certificates`
- `npx playwright install --with-deps chromium`
- Symlink to `/usr/local/bin/chromium`, set `CHROME_PATH=/usr/local/bin/chromium`, `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`
- `chown -R worker:worker /opt/ms-playwright` BEFORE `USER worker`
- Add `--no-cpu-throttling` to **prod-only** Cloud Run deploy
- Files: `workers/audit-worker/Dockerfile`, `.github/workflows/deploy.yml`

Outcome: 8 of 11 steps populate. Semgrep/OSV stay SKIPPED.

### Phase 1 (1 PR, 2 days) — static + dependency analyzers

- `apt-get install -y python3 python3-pip pipx` + `pipx install semgrep==1.86.0`
- Pre-warm semgrep registry cache at build time
- Pin `osv-scanner v1.9.2` binary from GitHub releases with SHA256 verify
- Verify `/healthz` shows all four tools `found`
- Bump Cloud Run `--timeout` to 900 if needed

Outcome: All 11 steps run. Real findings emitted.

### Phase 2 (1 PR, 1-2 days, opportunistic) — hardening + cost

- Trivy/docker-scout vuln scan in CI
- Multi-stage trim (move pipx into build stage, COPY only the venv)
- `scripts/smoke-tools.ts` post-build verification
- **Optional:** revisit handler-shape (await-then-respond) to remove `--no-cpu-throttling` and save $120/mo

### Top risks to watch
- R1: Bookworm glibc breaks a native module → mitigation: pin exact `20.13-bookworm-slim` digest
- R10: Non-root user can't read `/opt/ms-playwright` → mitigation: explicit chown before USER
- R11: min-instances=1 means a bad revision serves prod immediately → mitigation: `--no-traffic` initial deploy + manual promote

## 11. Lessons for next session

- **Cloud Run CPU throttle after `res.json()` is the silent killer.** "Hung" pipelines may just be CPU-starved. Check the doc state at the END of the throttle window (timeout=600s after request started) before declaring failure. Specifically: never PATCH a Firestore audit doc to FAILED based solely on log silence — read the doc first.
- **The Firestore onCreate trigger + the API handler both enqueue tasks.** The deterministic task name dedupes the actual enqueue, but the trigger ALSO overwrites `enqueueMode` if it sees null in its snapshot. Either side missing env → silent stub-mode. Always update env on BOTH whenever changing Cloud Tasks routing.
- **Pre-launch probes prevent 11-min hangs.** Anywhere we call a third-party launcher (Playwright, Chrome, Lighthouse), assume the binary may be missing and fail-fast.
- **The `audit-core` package is doing more than its file names suggest.** secret-scanner, prisma-analyzer, risky-function-discovery, design-consistency are all **pure Node** — no CLI dependency. Their "missing" warnings came from the clone-step cascade, not a missing binary. Grep before assuming a tool needs apt-install.

## 12. State of the agent run (for `/load` / `/team` continuity)

- No active `/team` mode. No agents in progress.
- Background `gh pr checks 33 --watch` and `gh run watch 26077699765` completed cleanly.
- Two ScheduleWakeup / loop calls active: none.
- Working tree on branch `fix/worker-deploy-url-hang` (PR #34 head). Sync to main and start fresh next session.

## 13. Re-entry checklist (next session, first 5 minutes)

```powershell
# 1. Sync
cd "C:\Users\HeechangLee\Desktop\ClearToShip\repo"
git fetch origin
git checkout main
git pull --ff-only
git log --oneline -10                            # newest should be 6841532 (PR #30) merge

# 2. Merge the four pending PRs (in any order)
gh pr merge 31 --squash --delete-branch
gh pr merge 32 --squash --delete-branch
gh pr merge 33 --squash --delete-branch
gh pr merge 34 --squash --delete-branch
git checkout main && git pull --ff-only

# 3. Deps (fast — lockfile is current)
pnpm install --frozen-lockfile

# 4. Sanity-check the baseline (should all pass)
pnpm -F web exec tsc --noEmit
pnpm -F audit-worker test
pnpm -F web test

# 5. Verify the prod plumbing is still intact
$env:CLOUDSDK_PYTHON = "C:\Users\HeechangLee\AppData\Local\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"
gcloud config get-value project                  # cleartoship-prod
gcloud run services list --region=asia-northeast3 --project=cleartoship-prod
# Expect: web-ssr 00005+, audit-worker 00026+, onauditruncreated 00002+, dailycleanup

# 6. Smoke test: hit web-ssr root
$r = Invoke-WebRequest -Uri 'https://web-ssr-t4fpcxe2ha-du.a.run.app/' -UseBasicParsing
"$($r.StatusCode) bytes=$($r.RawContentLength)"   # expect 200, ~38KB
```

## 14. Recommended first actions next session

1. **Merge PR #31 + #32 first** (IaC parity with current live state). Zero behavior change in prod; quiets terraform drift.
2. **Merge PR #33** (audits list page). Zero risk; UX fix.
3. **Merge PR #34** (deploy-url-hang fix). Zero risk on the steady-state pipeline; only changes failure mode when chrome is missing.
4. **Start Phase 0 of the ultraplan in §10** as a new PR — `workers/audit-worker/Dockerfile` rework + `--no-cpu-throttling`. The PR should:
   - Bump base image
   - apt-install git + ca-certificates
   - playwright install chromium + chown + CHROME_PATH env
   - One-line `--no-cpu-throttling` in deploy.yml prod branch
   - Local `docker run --version` smoke test before push
5. Submit a fresh audit against `https://github.com/Yoodaddy0311/cleartoship` after deploy. Expected: readinessScore should jump from 21 toward the higher range as actual file analysis kicks in.

## 15. Reference

- Predecessor handoff: `reports/AUTOPILOT/ap-20260519-deploy-unblock-handoff.md`
- Launch target: 2026-06-05 (revisit D-day countdown)
- Open PRs: #31, #32, #33, #34 — all MERGEABLE
- Worker image: `asia-northeast3-docker.pkg.dev/cleartoship-prod/cleartoship-images/audit-worker:sha-…`
- web-ssr image: `asia-northeast3-docker.pkg.dev/cleartoship-prod/cleartoship-images/web-ssr:sha-…`
- Cloud Run URLs:
  - web-ssr — `https://web-ssr-t4fpcxe2ha-du.a.run.app`
  - audit-worker — `https://audit-worker-t4fpcxe2ha-du.a.run.app` (OIDC-only)
- Latest reference audit: `auditRuns/f9yNjdD3rDzEYrrps9hA` (COMPLETED, sparse)

## 16. Quick scorecard

- PRs merged this session: **3** (#28, #29, #30)
- PRs open at handoff: **4** (#31, #32, #33, #34, all green & mergeable)
- Out-of-band gcloud ops: **4** (two IAM bindings + two env-var updates, all folded into open PRs)
- New MVP capability: AuditRun creation → Cloud Tasks → audit-worker → Firestore status updates is fully wired and ran end-to-end at 07:08–07:27 UTC
- Outstanding to make audit reports non-empty: Phase 0 of the ultraplan in §10
