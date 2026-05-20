---
name: project-next-actions
description: Ordered action queue for the next ClearToShip session (Phase 0 finish + Phase 1 start)
metadata: 
  node_type: memory
  type: project
  originSessionId: f7dda967-061d-441e-8297-28bb6753e327
---

Exact sequence the next session must run before starting any new design work. PR #36 must merge + prod must be verified before Phase 1 begins, because Phase 1 (semgrep/osv-scanner) builds on Phase 0's image as its base.

**Why**: skipping operator steps and starting Phase 1 means the prod prod runtime never gets validated against the cleartoship self-audit (PRD AC11~AC13). The whole point of Phase 0 was to make the prod audit non-empty; if the next session jumps to Phase 1, the demo-readiness KPI stays unverified.

**How to apply**: walk this list top-down. Do NOT start Phase 1 PR until step 6 confirms `readinessScore ≥ 50`.

## Step-by-step

### 1. Sync + review (5 min)

```powershell
cd "C:\Users\HeechangLee\Desktop\ClearToShip\repo"
git fetch origin
git status                                  # expect: docs/handoff-20260519-golden-path branch
gh pr view 36                               # browser or terminal
gh pr checks 36                             # expect: 5/5 PASS
```

### 2. Merge PR #36 (1 min)

```powershell
gh pr merge 36 --squash --delete-branch
git checkout main
git pull --ff-only
git log --oneline -5                        # newest = squash-merged Phase 0
```

This triggers `deploy.yml` automatically. Watch:

```powershell
gh run watch                                # or visit Actions tab
```

### 3. Post-merge IMMEDIATE traffic recall (PRD §9 Q1, R-P0-3) (2 min)

`--no-traffic` 분기를 deploy.yml에 영구 추가하지 않았으므로, 자동 deploy가 100% 트래픽을 prod에 즉시 전환한다. 새 revision이 잘못 동작하면 prod가 즉시 영향. 안전 절차:

```powershell
$env:CLOUDSDK_PYTHON = "C:\Users\HeechangLee\AppData\Local\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"

# 새 revision 정보 확인
gcloud run services describe audit-worker `
  --region=asia-northeast3 --project=cleartoship-prod `
  --format='value(status.latestReadyRevisionName,status.traffic[].revisionName,status.traffic[].percent)'

# 직전 prod revision으로 트래픽 100% 회수 (지난 세션의 audit-worker-00026-srx 또는 그 시점 latest ready)
gcloud run services update-traffic audit-worker `
  --region=asia-northeast3 --project=cleartoship-prod `
  --to-revisions=audit-worker-00026-srx=100
```

(만약 `audit-worker-00026-srx`가 GC된 상태면 그 시점의 `latestReady`를 사용.)

### 4. Rollback-pin tag (W5.1, AC18) (1 min)

```powershell
$PRIOR_IMAGE = (gcloud run revisions describe audit-worker-00026-srx `
  --region=asia-northeast3 --project=cleartoship-prod `
  --format='value(spec.containers[0].image)')

gcloud artifacts docker tags add $PRIOR_IMAGE `
  asia-northeast3-docker.pkg.dev/cleartoship-prod/cleartoship-images/audit-worker:rollback-pin-2026-05-20 `
  --project=cleartoship-prod
```

### 5. Verify new revision smoke (V10~V13) (5 min)

```powershell
$URL = (gcloud run services describe audit-worker `
  --region=asia-northeast3 --project=cleartoship-prod `
  --format='value(status.url)')

# V10 — /healthz on the new revision (still at 0% traffic, but reachable via -tag)
$TOKEN = (gcloud auth print-identity-token --audiences=$URL)
Invoke-WebRequest -Uri "$URL/healthz" -Headers @{Authorization="Bearer $TOKEN"} | Select-Object -ExpandProperty Content

# Expect JSON with tools.git.status='found' and tools.lighthouse.status='found'
# (tools.semgrep / osv-scanner stay 'missing' until Phase 1)
```

If all 4 V10 expectations hold (git + lighthouse found, semgrep + osv missing, no 5xx): promote new revision to 100%.

```powershell
gcloud run services update-traffic audit-worker `
  --region=asia-northeast3 --project=cleartoship-prod --to-latest
```

### 6. Real self-audit run (KPI gate, AC11~AC13) (~30 min)

```powershell
# Browser: visit web-ssr URL, submit https://github.com/Yoodaddy0311/cleartoship
$WEB = (gcloud run services describe web-ssr `
  --region=asia-northeast3 --project=cleartoship-prod `
  --format='value(status.url)')
Start-Process "$WEB"
```

Submit the cleartoship repo. After ~5-15 min (Cloud Run timeout 600s, retry/queue may extend), check:

- `auditRuns/<newId>.status === 'COMPLETED'`
- `auditRuns/<newId>.readinessScore >= 50` (Δ from baseline 21 ≥ +29)
- `auditRuns/<newId>.launchStatus !== 'INDETERMINATE'`

**If KPI met**: Phase 0 truly DONE. Proceed to Step 7.
**If KPI not met**: open the audit report, check which steps still SKIPPED in worker logs. Phase 0 should have unblocked 8 of 11 steps. If fewer unblocked, debug before Phase 1.

### 7. Start Phase 1 PR (semgrep + osv-scanner) (next major work block)

Phase 1 scope (PRD §7.1 forward ref):
- `apt-get install -y python3 python3-pip pipx` in runtime stage
- `pipx install semgrep==1.86.0` (let pipx own the venv)
- Pre-warm semgrep registry cache at build time
- Pin `osv-scanner v1.9.2` from GitHub Releases with SHA256 verify
- Extend smoke step assertions to all 4 tools (currently only git + lighthouse)
- Bump Cloud Run `--timeout=600 → 900` (semgrep can take 5-10 min on big repos)

**Pre-merge lint discipline** (see [[reference-lint-tools]]): Phase 1 adds 5+ apt/binary install commands vs Phase 0's 2. Either pin versions (`git=1:2.39.5-0+deb12u3`) or add inline `# hadolint ignore=DL3008` annotations. Decide UPFRONT — don't let the hadolint warning count grow ambiguously.

**Pre-merge build discipline** (see [[feedback-pnpm-monorepo-docker]]): pre-apply Rules 1-3 BEFORE first CI push. Phase 0 burnt 4 CI iterations rediscovering these. Phase 1's similar surface (binaries from npm-adjacent ecosystem + multi-stage) is at risk of repeating.

**Phase 2 backlog** (collected during Phase 0 — fold into Phase 1's "deferred" section or split into a separate Phase 2 PRD):
- hadolint DL3008 — apt version pinning on `Dockerfile:10` and `Dockerfile:53`
- `--no-cpu-throttling` cost recovery via handler refactor (PRD §7.2)
- multi-stage pipx trim (after Phase 1 ships)
- `smoke-tools.sh` → `smoke-tools.ts` so it shares code with `tools-health.ts`
- `# shellcheck disable=SC2086` annotation next to unquoted `$CPU_THROTTLING_FLAG` (deploy.yml:189, 03-deploy-worker.sh:70)
- replace symlink wildcard glob with explicit `nullglob` + count assert (was the same shape Phase 0 had to evolve into find-based discovery — see [[feedback-pnpm-monorepo-docker]] Rule 2)
- README rollback procedure example date — reconcile `2026-05-20` literal vs the operator's actual merge-day (or convert to `$(date +%F)`)

Start with `/autopilot "Phase 1 worker tooling — semgrep + osv-scanner"` or `/plan` first if scope unclear.

See also: [[project-phase0-status]], [[reference-phase0-prd]], [[feedback-pnpm-monorepo-docker]].
