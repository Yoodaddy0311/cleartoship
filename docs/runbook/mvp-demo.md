# MVP Demo Runbook

Step-by-step guide for running a local ClearToShip demo. Audience: developers and
demo facilitators with access to the monorepo.

---

## 1. Prerequisites

| Tool | Minimum version | Check command |
|------|----------------|---------------|
| Node.js | 22 | `node -v` |
| pnpm | 10 | `pnpm -v` |
| Java (JDK) | 21 | `java -version` |
| Firebase CLI | 15 | `firebase --version` |

Install the Firebase CLI if missing:

```sh
npm install -g firebase-tools@latest
firebase login
```

---

## 2. Environment Variables

Copy the three env templates:

```sh
cp apps/web/env.template apps/web/.env.local
cp functions/env.template functions/.env
cp workers/audit-worker/env.template workers/audit-worker/.env
```

The Functions emulator reads `functions/.env` automatically (standard Firebase
emulator convention). The defaults shipped in `functions/env.template` already
wire the Functions runtime to the local audit worker on port 8787 — see §4.5
for why the worker uses 8787 instead of its production default 8080.

Key variables for local demo (emulator mode — no real Firebase project required):

```dotenv
# Use placeholder values for the Firebase SDK keys; emulators ignore them.
NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-cleartoship.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-cleartoship
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-cleartoship.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:demo

# Must be 1 for emulator mode
NEXT_PUBLIC_USE_EMULATORS=1
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
```

Leave `GOOGLE_APPLICATION_CREDENTIALS` and the Cloud Tasks variables empty for a
local demo — they are not needed when running against emulators.

---

## 3. Start the Firebase Emulator Suite

From the monorepo root:

```sh
npx firebase emulators:start --project demo-cleartoship
```

Expected output confirms the following services are running:

- Auth — `http://127.0.0.1:9099`
- Firestore — `http://127.0.0.1:8080`
- Storage — `http://127.0.0.1:9199`
- Emulator UI — `http://127.0.0.1:4000`

Leave this terminal open for the duration of the demo.

---

## 4. Build Functions

In a new terminal, from the monorepo root:

```sh
pnpm -F functions build
```

Wait for `Build complete` before proceeding. Functions must be built before the
emulator picks up any Cloud Functions triggers.

---

## 4.5 Audit Worker 부팅

The Functions trigger `onAuditRunCreated` (functions/src/triggers/on-audit-run-created.ts)
in emulator mode POSTs directly to the audit worker over HTTP (the "dev-direct"
path in `functions/src/lib/enqueue-audit-task.ts:96`). If the worker process is
NOT running, every audit immediately fails with `ECONNREFUSED`. You must start
it in its own terminal before submitting the first audit.

### Port-conflict warning

The worker's default `WORKER_PORT` is **8080** (workers/audit-worker/src/server.ts:89),
which **collides** with the Firestore emulator port 8080. For local demos you
MUST override `WORKER_PORT` to a free port — this runbook uses **8787** to match
the `AUDIT_WORKER_URL` baked into `functions/env.template`.

### Required environment

`workers/audit-worker/.env` (copied from `env.template` in §2) must contain:

```dotenv
# Override the port so we don't collide with Firestore emulator on :8080.
WORKER_PORT=8787

# NODE_ENV must NOT equal "production" for dev mode.
NODE_ENV=development

# Bypass OIDC verification of incoming POSTs (the emulator's dev-direct path
# does NOT attach an OIDC token). The bypass only activates when NODE_ENV !==
# 'production' AND ALLOW_DEV_BYPASS === '1' — see server.ts:25-26.
ALLOW_DEV_BYPASS=1

# Point the worker's Firestore Admin SDK at the local emulator so pipeline
# writes (status, findings) land in the same emulated Firestore the web app
# reads from.
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
GCLOUD_PROJECT=demo-cleartoship

# Leave OIDC + GCP credential vars empty for local demo.
GOOGLE_APPLICATION_CREDENTIALS=
```

### Start the worker

In a NEW terminal, from the monorepo root:

```sh
WORKER_PORT=8787 ALLOW_DEV_BYPASS=1 NODE_ENV=development pnpm -F audit-worker dev
```

(On Windows PowerShell use `$env:WORKER_PORT='8787'; $env:ALLOW_DEV_BYPASS='1';
$env:NODE_ENV='development'; pnpm -F audit-worker dev`.)

Expected first log line (JSON, on stderr):

```json
{"level":"info","component":"worker.server","message":"audit-worker listening on :8787","devBypassActive":true,"nodeEnv":"development"}
```

### Verify

```sh
curl http://localhost:8787/healthz | jq
```

Expected shape (`toolsStatus` is `"ok"` only if Semgrep, Trivy, etc. are
installed; otherwise `"degraded"` — see §7 troubleshooting):

```json
{
  "status": "ok",
  "service": "audit-worker",
  "version": "0.1.0",
  "nodeEnv": "development",
  "oidcEnabled": false,
  "devBypassActive": true,
  "toolsStatus": "ok",
  "tools": { "...": "..." },
  "timestamp": "2026-05-17T..."
}
```

If `devBypassActive` is `false`, the trigger's POST will be rejected with 401
and the audit will fail — re-check that `NODE_ENV=development` and
`ALLOW_DEV_BYPASS=1` are both set in the worker terminal.

### Troubleshooting: port 8080 already taken

If you forgot to override `WORKER_PORT` and started the worker first, the
Firestore emulator will fail to start with `Could not start Firestore Emulator,
port taken`. Stop the worker, set `WORKER_PORT=8787`, and restart it before
running `firebase emulators:start`. Conversely, if the emulator is already on
8080 and the worker is launched without an override, the worker will crash on
`EADDRINUSE`.

---

## 5. Start the Dev Server

In another new terminal:

```sh
pnpm -F web dev
```

The Next.js dev server starts on `http://localhost:3000` by default. Watch for
`ready` in the output before opening the browser.

---

## 6. Demo Scenario

1. Open `http://localhost:3000` in the browser.
2. Navigate to `/audits/new` (or click **Audit starten** on the homepage).
3. Enter a sample public repository URL. Use the primary repo below; switch to the
   backup if the clone fails or the audience prefers a different stack.

   **Primary — `https://github.com/sindresorhus/is`**

   | Property | Detail |
   |----------|--------|
   | Stack detected | TypeScript library, no framework |
   | Approximate size | ~2 MB, clones in under 5 seconds on a typical connection |
   | Expected score | 예상 약 65-80점 |

   **Backup — `https://github.com/psf/requests`**

   | Property | Detail |
   |----------|--------|
   | Stack detected | Python library, no framework |
   | Approximate size | ~5 MB, clones in under 10 seconds on a typical connection |
   | Expected score | 예상 약 60-75점 |

   > **Note:** If clone fails or the demo audience prefers a different stack, use
   > backup `https://github.com/psf/requests`. Avoid public repos > 100 MB or with
   > submodules — the size-guard will reject them.

4. Optionally enter a deploy URL (can be any reachable HTTPS URL for a live demo).
5. Click **Start Audit** and observe the progress screen — each step label maps to
   an `AUDIT_STEP_LABELS` entry in `apps/web/lib/i18n/ko.ts`.
6. When the audit completes, the browser redirects to the dashboard at
   `/audits/<id>`.
7. Walk through the tabs: **Dashboard**, **Feature Graph**, **Findings**,
   **Audit Report**, **Improvement PRD**.

---

## 7. Troubleshooting

### Port conflict on emulator startup

```
Error: Could not start Firestore Emulator, port taken.
```

Find and kill the process holding the port:

```sh
# macOS / Linux
lsof -ti:8080 | xargs kill -9
# Windows (PowerShell)
Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process
```

Repeat for ports `9099` and `9199` if needed.

---

### Missing analysis tool warning

If the audit result shows the error key `errors.audit.toolUnavailable`, one or
more CLI tools (e.g., Semgrep, Trivy) are not installed in the PATH.

Install the missing tool, then re-run the audit. For a demo without the tool:

- Semgrep: `pip install semgrep` (requires Python 3.8+)
- Trivy: https://aquasecurity.github.io/trivy/latest/getting-started/installation/

---

### Reset emulator data between demo runs

The emulator stores data in memory by default — data resets on every restart.

To persist data across restarts (optional):

```sh
npx firebase emulators:start --project demo-cleartoship --export-on-exit ./emulator-data --import ./emulator-data
```

To wipe persisted data:

```sh
rm -rf ./emulator-data
```

---

### Clone failed error (`errors.audit.cloneFailed`)

- Confirm the repository URL is a public GitHub repo (no authentication required).
- Check that the audit worker has outbound internet access (relevant when running
  inside a restricted corporate network or VPN).

---

## 8. Pre-Deployment Checklist

Before deploying to production, complete the following steps:

- [ ] Replace all `demo-*` placeholder values in `.env.local` with real Firebase
      project credentials.
- [ ] Set `NEXT_PUBLIC_USE_EMULATORS=0` and remove `*_EMULATOR_HOST` variables.
- [ ] Set `GOOGLE_APPLICATION_CREDENTIALS` to a valid service-account key path, or
      configure Workload Identity Federation on Cloud Run.
- [ ] Set `AUDIT_WORKER_URL` to the deployed Cloud Run URL.
- [ ] Set `CLOUD_TASKS_PROJECT`, `CLOUD_TASKS_LOCATION`, and `CLOUD_TASKS_QUEUE`
      to match the production Cloud Tasks queue.
- [ ] Run `pnpm -F web build` and confirm zero build errors.
- [ ] Run `pnpm -F functions build` and confirm zero build errors.
- [ ] Deploy Firebase rules: `firebase deploy --only firestore:rules,storage:rules`.
- [ ] Deploy functions: `firebase deploy --only functions`.
- [ ] Deploy the web app: `firebase deploy --only hosting` or via your CI/CD
      pipeline (e.g., Cloud Build trigger on `main`).
- [ ] Smoke-test the live URL with the same demo scenario from Section 6.
