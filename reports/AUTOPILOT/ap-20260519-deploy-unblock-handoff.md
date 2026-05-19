# Session Handoff — Deploy Unblock + Live GCP Provisioning (2026-05-19)

> Session window: 2026-05-18 evening → 2026-05-19 (single rolling sitting)
> Predecessor: `ap-20260518-sprint4-complete-handoff.md` (Sprint 4 wrap-up)
> Successor: TBD — next sitting picks up at "Hosting deploy decision point"
> Mode: interactive deploy debugging — 14 fix PRs landed, 8 out-of-band gcloud actions

## 1. Why this session existed

Sprint 4 closed with the entire User Action Queue (U1–U5 in the prior
handoff) still pending. The user authorized this session to actually
provision GCP and ship a live deploy. We did — partially. Worker /
Functions / Firestore / Storage are all live in `cleartoship-prod`.
Hosting (Next.js SSR via Firebase webframeworks) is **not** yet
deployed; we hit a stack of firebase-tools/Next.js/sharp interop bugs
and stopped at the decision point (see §6).

## 2. Current State

- **Branch**: `main` @ `1736557` (clean — this handoff is the only
  uncommitted file and will land via its own small PR)
- **Remote**: `https://github.com/Yoodaddy0311/cleartoship.git`
- **Dev server**: not running
- **Node / pnpm**: v24.15.0 + pnpm 9.0.0 (unchanged)
- **Local clone path**: `C:\Users\HeechangLee\Desktop\ClearToShip\repo`
- **GCP project**: `cleartoship-prod` (created this session)
- **GCP billing**: linked to `016B17-6277B6-57F6E1` (display name "hee").
  Required unlinking `studio-6746324484-46527` from that billing
  account first — it had hit the 5-project quota cap.
- **Active gcloud account**: `heechang1988@gmail.com`
- **ADC**: set, quota project = `cleartoship-prod`
- **Locally installed tooling added**: terraform 1.15.3, jq 1.8.1,
  firebase-tools 15.16.0 (npm -g), gcloud beta component
- **Bash + gcloud Python**: gcloud's bundled python at
  `C:\Users\HeechangLee\AppData\Local\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe`.
  Bash (Git for Windows) cannot find it on its own — set
  `export CLOUDSDK_PYTHON='/c/Users/HeechangLee/AppData/Local/Google/Cloud SDK/google-cloud-sdk/platform/bundledpython/python.exe'`
  whenever calling gcloud from Bash. PowerShell works without this.

## 3. What is live in GCP

| Resource | State | Notes |
|---|---|---|
| Project `cleartoship-prod` | ✅ provisioned, billing linked |  |
| Firestore (Native, asia-northeast3) | ✅ |  |
| Cloud Tasks queue `audit-jobs` | ✅ |  |
| Artifact Registry `cleartoship-images` | ✅ Has `audit-worker:sha-…` images |
| Cloud Run `audit-worker` | ✅ Ready, URL `https://audit-worker-t4fpcxe2ha-du.a.run.app` |
| Cloud Run `dailycleanup` | ✅ Ready (Cloud Functions v2 backing service) |
| Cloud Run `onauditruncreated` | ✅ Ready (Cloud Functions v2 backing service) |
| Cloud Function `dailyCleanup` | ✅ ACTIVE, Scheduler trigger |
| Cloud Function `onAuditRunCreated` | ✅ ACTIVE, Eventarc Firestore trigger |
| Cloud Function `ssrcleartoshipprod` | ❌ FAILED — last Hosting deploy could not build it (see §6) |
| Firestore rules + indexes | ✅ deployed |
| Storage rules | ✅ deployed |
| Default Firebase Storage bucket | ✅ `cleartoship-prod.firebasestorage.app` (created via REST API, see §4) |
| GitHub Actions secrets | ✅ `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`, `GCP_PROJECT_ID` set on `Yoodaddy0311/cleartoship` |
| Monitoring metrics + 2 of 3 alerts | ✅ (p95 latency alert still failing — see §5) |

## 4. Out-of-band manual GCP actions taken this session

These were one-shot fixes during the deploy unblock. Each is folded
into IaC by one of the PRs in §5, except where noted.

1. `gcloud beta billing projects unlink studio-6746324484-46527`
   (freed the billing slot so `cleartoship-prod` could be linked).
   IaC equivalent: N/A — this is a one-time accounting action on a
   pre-existing personal billing account.
2. `gcloud services enable firebasestorage.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com`
   → folded into IaC by **#14**.
3. `gcloud services enable cloudscheduler.googleapis.com firebaseextensions.googleapis.com pubsub.googleapis.com`
   → folded into IaC by **#16**.
4. `gcloud services enable cloudbilling.googleapis.com`
   → folded into IaC by **#19**.
5. `gcloud projects add-iam-policy-binding ... --role=roles/resourcemanager.projectIamAdmin`
   → folded into IaC by **#17**.
6. `gcloud projects add-iam-policy-binding ... --role=roles/cloudscheduler.admin`
   → folded into IaC by **#22**.
7. `firebase projects:addfirebase cleartoship-prod`
   (registered the GCP project as a Firebase project — required before
   the Storage default-bucket REST endpoint and `firebase deploy` work).
   IaC equivalent: not currently captured. Should be a one-line note in
   `infra/scripts/01-setup-project.sh` or a separate `00b-firebase-init.sh`.
8. `POST https://firebasestorage.googleapis.com/v1beta/projects/cleartoship-prod/defaultBucket`
   with `{"location": "asia-northeast3"}` — bootstrapped the modern
   Firebase Storage default bucket (`cleartoship-prod.firebasestorage.app`).
   IaC equivalent: not captured. Recommended follow-up — either embed
   the REST call in the bootstrap script or migrate to a terraform
   `google_storage_bucket` resource that mirrors the Firebase default.
9. `gcloud functions delete onAuditRunCreated dailyCleanup --gen2 --region=asia-northeast3`
   — both functions had been partially-created as HTTP triggers in an
   earlier failed attempt and refused to flip to background triggers.
   The next deploy created them cleanly. **Will not recur** on a fresh
   project bootstrap.

## 5. PRs landed this session

All 14 are merged to `main`. Squash-merge per the user's
"recommended" preference (#11 onward).

| # | Title | Merge SHA |
|---|-------|-----------|
| 11 | `fix(deploy): use monorepo root as docker build context` | `7bf9305` |
| 12 | `fix(packages): point workspace package exports at compiled dist` | `b597e3b` |
| 13 | `fix(deploy): bump firebase-tools 13 → 15` | `86252f8` |
| 14 | `fix(infra): add Firebase deploy surface APIs to terraform` | `77fcbd1` |
| 15 | `fix(deploy): use 'storage' selector, not 'storage:rules'` | `128fa12` |
| 16 | `fix(infra): add Functions v2 trigger APIs to terraform` | `9ebb93c` |
| 17 | `fix(infra): grant deployer-ci projectIamAdmin` | `bb6b5ed` |
| 18 | `fix(firestore): remove invalid single-field index on events.ts` | `cee7eed` |
| 19 | `fix(infra): add cloudbilling API for functions v2 deploy` | `0ad4a7b` |
| 20 | `fix(functions): bundle workspace deps with esbuild` | `ff6690a` |
| 21 | `fix(functions): drop workspace:* from devDependencies, use tsconfig paths` | `fa48e6a` |
| 22 | `fix(deploy): grant scheduler.admin + pass --force for cleanup policy` | `6a80b39` |
| 23 | `fix(deploy): enable webframeworks experiment for Hosting` | `5c0c371` |
| 24 | `fix(deploy): strip workspace:* from apps/web package.json before Hosting` | `1736557` |

## 6. Where we stopped: Hosting deploy decision point

Deploy run [26069628966](https://github.com/Yoodaddy0311/cleartoship/actions/runs/26069628966) — the last attempt after #24.
Strip step ran cleanly, Next.js build succeeded, Firebase tried to
package the SSR Cloud Function, then **Cloud Build's `npm ci` failed**:

```
npm error Missing: @img/sharp-libvips-linux-x64@1.2.4 from lock file
npm error Missing: @img/sharp-linux-x64@0.34.5 from lock file
… (12 platform variants total)
```

The auto-generated lockfile that firebase-tools/webframeworks feeds
into Cloud Build is missing sharp's per-platform native packages. A
secondary error (`could not set up cleanup policy`) also fires because
the Hosting deploy step lacks `--force` (same fix shape as #22 for
functions, but not yet applied to Hosting).

The user paused here for a reboot. **They explicitly chose not to
pick an option yet** — the next session should re-present these:

| # | Direction | Estimated effort | Notes |
|---|---|---|---|
| **A** | One more fix cycle on webframeworks (`--force` on Hosting + a strategy for the sharp lockfile gap — e.g., pre-generate a complete `package-lock.json` in apps/web before the strip step) | ~30 min | May surface yet another webframeworks bug |
| **B** | Host Next.js on **Vercel** instead. Keep Functions/Firestore/Storage on GCP. Hosting becomes split-stack but Vercel handles Next.js natively. | ~30 min | Loses the asia-northeast3 colocation for the front-end; gains "just works" |
| **C** | Containerize Next.js and deploy as a **second Cloud Run service** (mirror the audit-worker Dockerfile pattern). `firebase hosting` becomes static-only or unused. | ~1 hr | Highest control, more code to maintain |
| **D** | Defer Hosting. Run `pnpm -F web dev` + Firebase emulators locally and **smoke the MVP golden path against the live worker URL** | ~0 min | Unblocks "is the MVP testable today" without touching prod hosting |

If pressed, lead with **D** for immediate MVP verification, then pick
between **B** and **C** as the long-term Hosting plan once the
golden-path test confirms the rest of the stack is sound.

## 7. Outstanding terraform follow-ups (carried over from §5.1 of prior handoff, still unresolved)

| ID | Item | Files |
|---|---|---|
| TF-FU-1 | `google_storage_bucket_iam_member.worker_uploads` references `${var.project_id}.appspot.com`, but the bucket that actually exists is `cleartoship-prod.firebasestorage.app`. Either set `uploads_bucket_name` in `terraform.tfvars` or change the default in `infra/terraform/iam.tf` `locals.uploads_bucket`. Worker cannot read uploaded PDFs at runtime until this is fixed. | `infra/terraform/iam.tf`, `infra/terraform/terraform.tfvars` (untracked) |
| TF-FU-2 | `google_monitoring_alert_policy.audit_run_p95_latency` uses `ALIGN_PERCENTILE_95` on `audit_run_duration_seconds`, which is `GAUGE`/`DOUBLE`. Either change the metric kind to `DELTA` + `DISTRIBUTION` (worker code change too) or change the aligner to `ALIGN_MAX` (loses p95 semantics). | `infra/terraform/monitoring.tf` line ~217 (alert), line ~80 (metric descriptor); `workers/audit-worker/src/observability/metrics.ts` |
| TF-FU-3 (new) | `firebase projects:addfirebase` + Storage default bucket REST creation are not in IaC. Fresh project bootstraps still need these two manual steps. | new `infra/scripts/00b-firebase-init.sh` or extension of `01-setup-project.sh` |

Plus all the original Sprint 4 follow-ups FOLLOWUP-1 through FOLLOWUP-6
from the prior handoff remain untouched.

## 8. State of the agent run (for `/load` / `/team` continuity)

- No active `/team` mode. No agents in progress.
- Last operational background watch (`gh run watch 26069628966`)
  completed with the failure described in §6.
- Two terraform manual edits exist in the working tree of
  `infra/terraform/terraform.tfvars` — that file is in `.gitignore`,
  contains the billing account ID, and must stay out of git. Do not
  delete it on next session; it is the only record of which billing
  account is linked.
- No uncommitted code changes elsewhere on `main` other than this
  handoff document.

## 9. Re-entry checklist

```powershell
# 1. Sync
cd "C:\Users\HeechangLee\Desktop\ClearToShip\repo"
git fetch origin
git checkout main
git pull --ff-only
git log --oneline -5    # confirm 1736557 or newer at HEAD

# 2. Deps (fast — lockfile is current)
pnpm install --frozen-lockfile

# 3. Sanity-check the baseline
pnpm -F @cleartoship/shared-types build
pnpm -F @cleartoship/audit-core build
pnpm -F @cleartoship/audit-core test          # 20 files / 456 tests
pnpm -F web exec tsc --noEmit
pnpm -F web test                              # 99 files / 747 tests
pnpm -F audit-worker test                     # 24 files / 289 tests
pnpm -F functions build                       # esbuild bundle, ~42 KB
pnpm -F functions test                        # 4 files / 32 tests
pnpm lint:copy                                # 0 violations

# 4. Confirm GCP is still reachable
$env:CLOUDSDK_PYTHON = "C:\Users\HeechangLee\AppData\Local\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"
gcloud config get-value project               # cleartoship-prod
gcloud run services list --region=asia-northeast3 --project=cleartoship-prod
gcloud functions list --project=cleartoship-prod

# 5. Curl the worker to confirm it's still up (will 403 — auth required, that's fine)
curl -sS -o /dev/null -w "%{http_code}\n" https://audit-worker-t4fpcxe2ha-du.a.run.app/healthz
# 403 = service reachable, OIDC enforced
```

## 10. Recommended first slash commands next session

```text
# Recall context
/load

# Then pick the Hosting path (§6). Suggested kickoff for option D:
pnpm -F web dev
# In a second terminal:
firebase emulators:start --only firestore,auth,functions,storage --project=demo-cleartoship
# Then create an audit run from http://localhost:3000/audits/new and
# verify the worker accepts the Cloud Task. Worker URL is in the
# prior `cloud-run-worker-url` Secret Manager secret — already set
# this session by the successful deploy of #24.
```

## 11. Reference documents

- Predecessor handoff: `reports/AUTOPILOT/ap-20260518-sprint4-complete-handoff.md`
- Sprint 4 plan: `docs/PRD/sprint4-execution-plan-2026-05-18.md`
- Launch target: `2026-06-05` (D-17 as of this writing)
- ROADMAP: `docs/ROADMAP.md` (Sprint 4 marked Wave 1–3 ✅; Wave 4 / Wave 5 still TBD)
- Wave 5 pre-launch checklist still pending (DATA POLICY re-run, golden-path smoke × 3, Cloud Run min-instance live verification, Launch Gate G5 sign-off)

## 12. Quick scorecard

- PRs merged this session: **14** (#11–#24)
- Out-of-band gcloud / firebase operations: **8**
- GCP resources now live: project + Firestore + Cloud Tasks + Artifact
  Registry + audit-worker Cloud Run + 2 working Cloud Functions
- GCP resources missing: Hosting (Next.js SSR) — see §6
- Outstanding IaC follow-ups: **3** (TF-FU-1, TF-FU-2, TF-FU-3)
- MVP testability today: **yes via option D** (local Next.js + emulators + live worker); **no via prod Hosting** (Hosting not deployed yet)
