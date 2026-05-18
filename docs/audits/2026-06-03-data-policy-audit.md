# Data Policy Audit — 2026-06-03

Sprint 4 Wave 3 Batch H · Task W3.QA.1 · Branch `feat/wave3-doc-hardening`

## 1. Executive Summary

**PASS** — Code paths emit no outbound traffic to third-party analytics, tracking, or telemetry endpoints. All runtime outbound calls resolve to the four allow-listed hosts below (GitHub API, GCP control plane, the user-provided deploy URL during headless probing, and the in-tenant audit-worker). No third-party SDKs are wired into application code; `@opentelemetry/*` packages appear only as transitive dependencies of `@google-cloud/*` and are not initialised.

## 2. Scope

| Surface | Path(s) | Mode |
|---|---|---|
| Web (Next.js) | `apps/web/lib/**`, `apps/web/app/**` | static grep + read |
| Audit worker | `workers/audit-worker/src/**` | static grep + read |
| Cloud Functions | `functions/src/**` | static grep + read |
| Shared packages | `packages/audit-core/src/**`, `packages/shared-types`, `packages/ui` | static grep |
| Anonymous auth flow | `apps/web/lib/firebase/auth-init.ts` | read |
| Secret-scan output | `workers/audit-worker/src/pipeline/steps/08-secret-scan.ts` | read |
| Report renderer | `packages/audit-core/src/report/**`, `i18n/rule-family-explanations.ts` | read |

Out of scope (other Wave 3 batches): `infra/terraform/**`, `docs/ROADMAP.md`, `packages/audit-core` rule-engine deltas.

## 3. Findings

| ID | Check | Result | Evidence |
|---|---|---|---|
| F1 | Outbound `fetch`/`axios` 0 → third-party trackers | **PASS** | Only 3 production `fetch()` call sites; all hit allow-listed hosts (see §4). |
| F2 | Third-party analytics SDK absent | **PASS** | Grep for `posthog\|segment\|mixpanel\|amplitude\|hotjar\|datadog\|sentry` returns 0 matches across runtime code. `@opentelemetry/*` present only as transitive dep of `@google-cloud/monitoring` (lazy-loaded, never initialised). |
| F3 | Secret leakage in logs / responses | **PASS** | `08-secret-scan.ts:69` writes `maskedValue` only; raw secret never persisted. `enqueue.ts` stderr logs include `runId` and `workerUrl` but redact payload bodies (base64 wrapping at `enqueue.ts:149` is for Cloud Tasks transport, not logging). |
| F4 | Anonymous-mode PII non-collection | **PASS** | `auth-init.ts:65` calls `signInAnonymously(auth)` — no email, phone, displayName, or photoURL ever requested. Anonymous Firebase user has uid only. |
| F5 | External link auto-insertion into reports | **PASS** | All outbound URLs emitted in reports are static, hard-coded references (OWASP, W3C WCAG, web.dev) tied to `learnMoreUrl` fields in `packages/audit-core/src/i18n/rule-family-explanations.ts`. Zero user-content-driven URL injection. |
| F6 | CORS / public endpoint posture | **PASS** | `workers/audit-worker/src/auth/verify-oidc.ts` fails closed in production when `AUDIT_WORKER_URL` / `AUDIT_WORKER_INVOKER_SA` are unset (returns 503 `WORKER_MISCONFIGURED`). Dev bypass requires explicit `ALLOW_DEV_BYPASS=1` AND `X-Dev-Mode: 1` header. |
| F7 | SSRF via user-supplied URL | **PASS** | `apps/web/lib/validation/deploy-url.test.ts` covers private CIDR blocks (10/8, 172.16/12, 192.168/16, 100.64/10, link-local, GCP metadata, IPv6 ULA/link-local, IPv4-mapped). |

DEFERRED: none.

## 4. Outbound Destination Allow-list

Resolved by reading every production `fetch()` / network call site. Hosts marked **dynamic** are validated by SSRF guards before dispatch (see F7).

| Host | Purpose | Call site | Direction |
|---|---|---|---|
| `api.github.com` | Public repo metadata (size, default_branch, language) | `workers/audit-worker/src/pipeline/steps/02-fetch-repo-metadata.ts:21` | egress, unauthenticated |
| `github.com` (HTTPS clone) | `git clone --depth=1 --single-branch` of the user-supplied public repo | `workers/audit-worker/src/pipeline/steps/03-clone-repo.ts:170` (via `simple-git`) | egress, unauthenticated |
| `cloudtasks.googleapis.com` | Enqueue audit task into the project-owned queue | `apps/web/lib/cloud-tasks/enqueue.ts:141`, `functions/src/lib/enqueue-audit-task.ts:121` (via `@google-cloud/tasks`) | egress, GCP-internal |
| `monitoring.googleapis.com` | Emit custom metrics (gated by `ENABLE_METRICS=1`) | `apps/web/lib/observability/metrics.ts:79`, `workers/audit-worker/src/observability/metrics.ts:85` (via `@google-cloud/monitoring`) | egress, GCP-internal |
| `oauth2.googleapis.com` / `www.googleapis.com` | Verify Cloud Tasks OIDC token signature | `workers/audit-worker/src/auth/verify-oidc.ts:35` (via `google-auth-library`) | egress, Google PKI |
| `firestore.googleapis.com` | Audit run / finding persistence | `apps/web/lib/firebase/admin.ts`, `workers/audit-worker/src/firestore/**` (via `firebase-admin`) | egress, GCP-internal |
| `${AUDIT_WORKER_URL}` (Cloud Run, project-owned) | Dev-direct enqueue path when Cloud Tasks env unset | `apps/web/lib/cloud-tasks/enqueue.ts:58`, `functions/src/lib/enqueue-audit-task.ts:70` | egress, in-tenant |
| `${deployUrl}` (user-supplied) | Playwright/Lighthouse headless probe; SSRF-guarded | `workers/audit-worker/src/pipeline/steps/09-analyze-deploy-url.ts` | egress, SSRF-allowlisted |
| `${repoUrl}` subresources during headless | Same probe loads whatever the deploy URL renders | (transitively) `09-analyze-deploy-url.ts` | egress, user-attributable |

**Not contacted at runtime (build-time only, expected):**
- `registry.npmjs.org` — `pnpm install` during CI/Docker build.
- `*.docker.io`, `ghcr.io` — base image pulls in `.github/workflows/docker-build.yml`.

**Static URL strings emitted into reports (no fetch):**
- `osv.dev/vulnerability/<id>` — link only, surfaced as evidence (`07-dependency-scan.ts:102`).
- `owasp.org`, `w3.org/WAI/WCAG21`, `web.dev` — `learnMoreUrl` fields in rule explanations (`packages/audit-core/src/i18n/rule-family-explanations.ts`).

## 5. Recommendations

- **R1 (Future, non-blocking)**: When client-side telemetry is added (placeholder noted at `apps/web/app/error.tsx:16`), restrict the destination to a first-party endpoint (e.g. an internal Cloud Function) rather than a third-party SaaS to preserve the current zero-third-party posture.
- **R2 (Documentation)**: Mirror the §4 allow-list into `infra/terraform` egress firewall rules when Cloud Run egress controls are introduced. Until then, the worker has unrestricted outbound by default; the in-code call surface is the de-facto allow-list.
- **R3 (Reminder, no change)**: The headless probe of `${deployUrl}` will load whatever subresources the page references (CDNs, analytics scripts owned by the auditee). This is user-attributable traffic, not ClearToShip-initiated, and is correctly out of scope for this audit.

## 6. Sign-off

- Audit reviewer: persona-security (Batch H)
- Reviewed against: PRD §11 ("Privacy & Data Policy"), this codebase as of `feat/wave3-doc-hardening`.
- Verdict: **PASS** — proceed to launch with no blocker.
