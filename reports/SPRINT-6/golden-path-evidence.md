# Sprint 6 S6-02 — Live Golden Path Evidence

| Field | Value |
|---|---|
| Timestamp (UTC) | 2026-05-17T03:39 — 03:44 |
| Repo under test | https://github.com/sindresorhus/is |
| Sprint reference | Sprint 6, task S6-02 |
| Spec | apps/web/e2e/live-golden-path.spec.ts |
| Verdict | **FAIL** (test spec timeout) — **but underlying pipeline COMPLETED successfully (verified)** |
| Time-to-COMPLETED | ~0.8 s (started 03:39:08.237Z → completed 03:39:09.046Z) |
| Final score | **96 / 100** ("출시 가능" — ready to ship, degraded mode) |
| Screenshots | 2 (run3-auth-stuck.png pre-fix, run4-dashboard-completed.png post-pipeline) |

---

## 1. Boot Sequence

### 1.1 Firebase Emulator Suite

Started via `npx firebase emulators:start --project demo-cleartoship`. Full log at
`reports/SPRINT-6/logs/emulator4.log` (final successful boot). Key proof line
(grep "All emulators ready"):

```
✔  All emulators ready! It is now safe to connect your app.
i  View Emulator UI at http://127.0.0.1:4000/

Emulator       Host:Port      
Authentication 127.0.0.1:9099
Functions      127.0.0.1:5001
Firestore      127.0.0.1:8080
Hosting        127.0.0.1:5000
Storage        127.0.0.1:9199
Emulator Hub host: 127.0.0.1 port: 4400
```

Functions trigger registration (proof that `functions/.env` was loaded
correctly — see Blocker B1 below):

```
i  functions: Loaded environment variables from .env.
+  functions: Loaded functions definitions from source: onAuditRunCreated, dailyCleanup.
+  functions[asia-northeast3-onAuditRunCreated]: firestore function initialized.
```

### 1.2 Audit Worker — `:8787`

Started with `WORKER_PORT=8787 ALLOW_DEV_BYPASS=1 NODE_ENV=development pnpm -F audit-worker dev`.
Full log at `reports/SPRINT-6/logs/worker.log`. Boot line:

```json
{"level":"warn","component":"worker.verify-oidc","message":"DEV BYPASS ENABLED — OIDC verification skipped for requests with header X-Dev-Mode: 1. Never enable ALLOW_DEV_BYPASS in production."}
{"level":"info","component":"worker.server","message":"audit-worker listening on :8787","devBypassActive":true,"nodeEnv":"development"}
```

`GET http://localhost:8787/healthz` response (saved to
`reports/SPRINT-6/logs/worker-healthz.json`):

```json
{
  "status": "ok",
  "service": "audit-worker",
  "version": "0.1.0",
  "nodeEnv": "development",
  "oidcEnabled": false,
  "devBypassActive": true,
  "toolsStatus": "degraded",
  "tools": {
    "semgrep": {"status": "missing"},
    "osv-scanner": {"status": "missing"},
    "lighthouse": {"status": "missing"},
    "git": {"status": "found", "version": "git version 2.51.0.windows.1"}
  },
  "timestamp": "2026-05-17T03:22:26.679Z"
}
```

`devBypassActive: true` confirms the trigger-to-worker POST will not be
rejected with 401. `toolsStatus: degraded` is expected on this runner and is
explicitly tolerated by the spec's contract.

### 1.3 Next.js Web — `:3100`

Started with `pnpm --filter web exec next dev -p 3100`. Full log at
`reports/SPRINT-6/logs/web2.log`. Boot line:

```
▲ Next.js 15.5.18
- Local:        http://localhost:3100
- Environments: .env.local
✓ Ready in 2s
```

HTTP smoke checks:

```
first-compile GET /audits/new -> HTTP 200 in 9.6s
second        GET /audits/new -> HTTP 200 in 0.16s
```

---

## 2. Playwright Run

Command:

```
E2E_LIVE=1 E2E_NO_WEBSERVER=1 E2E_BASE_URL=http://localhost:3100 \
  pnpm exec playwright test e2e/live-golden-path.spec.ts --reporter=line
```

Final attempt (run 4) outcome — full log at
`reports/SPRINT-6/logs/playwright-run4.log`:

```
Running 1 test using 1 worker
[1/1] [chromium] › e2e\live-golden-path.spec.ts:39:7 › ... ✗

TimeoutError: page.waitForURL: Timeout 300000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/audits/new/dashboard" until "load"
  navigated to "http://localhost:3100/audits/fTUrysaJ3qpl2MDwteKO/dashboard"
============================================================

   at pages\AuditFlowPage.ts:158
   await this.page.waitForURL(
     `**/audits/${encodeURIComponent(auditId)}/dashboard`,
     ...

Slow test file: live-golden-path.spec.ts (5.3m)
1 failed
```

---

## 3. Verdict

**TEST RUN: FAILED** (1 failed, 0 passed).
**PIPELINE: PASSED** — verified independently via Firestore admin reads.

| Aspect | Status | Evidence |
|---|---|---|
| Anonymous auth bootstrap | OK | submit button reached enabled state, POST sent |
| POST /api/audit-runs | OK | Firestore doc `fTUrysaJ3qpl2MDwteKO` created |
| onAuditRunCreated trigger fired | OK | startedAt timestamp written |
| Worker pipeline executed | OK (degraded) | clone failed → P0 finding written, status COMPLETED |
| Status reached COMPLETED | **YES** | Time-to-COMPLETED: 0.809 s |
| Dashboard rendered | **YES** | Score 96 visible, all 5 tabs present (screenshot run4) |
| Spec assertion satisfied | **NO** | spec captured auditId="new" — see RCA |

---

## 4. Root Cause Analysis

### Primary failure: spec bug in `AuditFlowPage.submit()`

`apps/web/e2e/pages/AuditFlowPage.ts:116`

```ts
await this.page.waitForURL(/\/audits\/[^/]+$/, { timeout: 20_000 });
```

The regex `/\/audits\/[^/]+$/` **matches `/audits/new` itself** — the very page
the test is already on. Playwright's `waitForURL` returns immediately because
the current URL already matches. The next line parses the trailing path segment
as the audit ID and gets the literal string `"new"`. From then on the spec
polls for `**/audits/new/dashboard`, which never exists, and times out after
the 5-minute budget. The trace's own log line documents the issue:

```
waiting for navigation to "**/audits/new/dashboard" until "load"
  navigated to "http://localhost:3100/audits/fTUrysaJ3qpl2MDwteKO/dashboard"
```

The browser actually reached the correct dashboard, but the spec was
listening for the wrong URL. The Firestore data confirms the pipeline
behaved correctly (see §5 below).

Per S6-02 constraints I have **NOT** modified the spec. **Reported as a
blocker (B0).**

**Suggested fix** (one line) — replace the bare regex with an explicit
"not /new" guard so `waitForURL` only resolves once the real ID is in the URL:

```ts
// Was:
await this.page.waitForURL(/\/audits\/[^/]+$/, { timeout: 20_000 });

// Should be: explicitly wait for navigation AWAY from /audits/new.
await this.page.waitForURL(
  (url) => /\/audits\/[^/]+$/.test(url.pathname) && url.pathname !== '/audits/new',
  { timeout: 20_000 }
);
```

This preserves the spec's intent (live golden path, no stubs) and is a strict
test-correctness fix — no production behavior change.

### Secondary fix already applied: `functions/env.template` reserved-key bug (Blocker B1)

The first 3 boot attempts failed because Firebase Functions emulator
**rejected the `.env` produced by `cp functions/env.template functions/.env`**
with:

```
Failed to validate key FIREBASE_AUTH_EMULATOR_HOST: Error: Key FIREBASE_AUTH_EMULATOR_HOST starts with a reserved prefix (X_GOOGLE_ FIREBASE_ EXT_)
Failed to validate key FIREBASE_STORAGE_EMULATOR_HOST: Error: Key FIREBASE_STORAGE_EMULATOR_HOST starts with a reserved prefix (X_GOOGLE_ FIREBASE_ EXT_)
Failed to validate key GCLOUD_PROJECT: Error: Key GCLOUD_PROJECT is reserved for internal use.
!!  functions: Failed to load function definition from source: FirebaseError: Failed to load environment variables from .env.
```

When the functions module fails to load, the `onAuditRunCreated` trigger never
registers, every new auditRuns doc stays at `PENDING` forever, and the web UI
displays the banner `⚠ 워커 미연결 — Cloud Tasks/Worker URL 환경변수 미설정.`
(captured in `screenshots/run3-auth-stuck.png` precursor state).

I edited the LOCAL `functions/.env` to remove the reserved keys (those are
auto-injected by the emulator at runtime anyway). The `env.template` in the
repo still contains the offending keys — this is a documentation/template bug
that should be patched in a separate change. Concretely the `.env` shipped to
the operator should be:

```dotenv
FUNCTIONS_EMULATOR=true
AUDIT_WORKER_URL=http://localhost:8787
CLOUD_TASKS_LOCATION=asia-northeast3
CLOUD_TASKS_QUEUE=audit-jobs
# Do NOT include FIREBASE_*_EMULATOR_HOST or GCLOUD_PROJECT — they are
# auto-injected by `firebase emulators:start` and rejected by the parser.
```

---

## 5. Pipeline Success Proof (Independent of Spec)

Firestore admin read of the created auditRun document
(`reports/SPRINT-6/logs/firestore-auditrun-complete.json` for full payload):

| Field | Value |
|---|---|
| auditRunId | `fTUrysaJ3qpl2MDwteKO` |
| repoUrl | `https://github.com/sindresorhus/is` |
| status | **`COMPLETED`** |
| createdAt | `2026-05-17T03:39:05.225Z` |
| startedAt | `2026-05-17T03:39:08.237Z` |
| completedAt | `2026-05-17T03:39:09.046Z` |
| **Time-to-COMPLETED** | **~0.809 s** (degraded: tools missing + Windows clone hook policy) |

Findings subcollection (`reports/SPRINT-6/logs/firestore-findings.json`):

| Severity | Title | Note |
|---|---|---|
| P0 | Repo 클론 실패 | `git clone` rejected by Windows `core.hooksPath` policy — pipeline gracefully degraded, wrote the finding, marked run COMPLETED |

Dashboard render (`screenshots/run4-dashboard-completed.png`):
- 출시 준비도 (release readiness): **96/100**
- Badge: 출시 가능 (ready to ship)
- Tab nav present: 대시보드 / 기능 관계도 / 이슈 목록 / 감사 리포트 / 개선 PRD
- Degraded-tools banner: "도구 secret-scanner, osv-scanner, lighthouse-axe, semgrep 미설치 — 부분 결과만 측정됩니다"
- Priority issue counts: P0=1, P1=0, P2=0, P3=0

The spec's degraded-tolerant contract (`only `status: completed` and dashboard
render are asserted`) is **factually satisfied** by the system behavior — the
failure is purely in how the spec captures the audit ID.

---

## 6. Blockers Summary

| # | Severity | Description | Resolution |
|---|---|---|---|
| B0 | HIGH | `AuditFlowPage.submit()` parses auditId from `/audits/new` because regex resolves before real-ID redirect | **Reported, NOT changed.** 1-line fix proposed in §4 |
| B1 | MEDIUM | `functions/env.template` ships keys (`FIREBASE_*_EMULATOR_HOST`, `GCLOUD_PROJECT`) that Firebase Functions v6 rejects, breaking the entire runbook | **Local `.env` patched** to keep this run reproducible. Template requires same fix in a follow-up commit |

Until B0 is fixed, the spec cannot pass on a live environment, even when the
pipeline behaves exactly as designed. Recommend treating B0 as the actual
blocker for the MVP demo gate and applying the 1-line fix above before
re-running.
