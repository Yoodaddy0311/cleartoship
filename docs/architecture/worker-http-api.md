# Audit Worker HTTP API

The audit-worker is a Cloud Run service that accepts Cloud Tasks payloads and
runs the audit pipeline. This document is the canonical contract for its HTTP
surface. It reflects the **actual current implementation** in
`workers/audit-worker/src/server.ts`; any divergence from earlier ticket text
is recorded in [§ Known divergences](#known-divergences).

---

## 1. Endpoints

| Method | Path       | Auth                       | Purpose                                  |
|--------|------------|----------------------------|------------------------------------------|
| POST   | `/run`     | OIDC bearer (when enabled) | Accept a Cloud Tasks audit payload       |
| GET    | `/healthz` | None                       | Readiness signal for orchestration / SRE |

The service binds to `process.env.WORKER_PORT` (default `8080`) and limits the
request body to `256 KiB` (`express.json({ limit: '256kb' })`).

---

## 2. `POST /run`

Accepts a Cloud Tasks delivery, validates the payload, acknowledges the task,
and runs the pipeline asynchronously. Returns before the pipeline finishes —
pipeline outcomes are surfaced via Firestore status writes, not via this HTTP
response.

### 2.1 Authentication

When `OIDC_EXPECTED_AUDIENCE` and `OIDC_EXPECTED_ISSUER` are both set, every
request must carry a Google-signed OIDC bearer token whose `aud` and `iss`
claims match those env vars. Cloud Tasks attaches the token automatically when
the queue is configured with an OIDC service account.

When `NODE_ENV !== 'production'` and `ALLOW_DEV_BYPASS === '1'`, the OIDC
middleware is bypassed (dev / emulator convenience). This bypass is reflected
in `/healthz` so an operator can verify production posture.

### 2.2 Request body

The body must satisfy `AuditTaskPayloadSchema` from
`@cleartoship/shared-types`:

```jsonc
{
  "auditRunId": "string",           // Firestore audit run id
  "runId":      "uuid",             // UUID, matches the Firestore document id
  "repoUrl":    "https://...",      // GitHub HTTPS URL
  "deployUrl":  "https://...",      // optional, may be null
  "ownerId":    "string",
  "projectId":  "string",
  "prdText":    "string"            // optional, may be null
}
```

Fields that violate the schema produce a `400` (see §2.4).

### 2.3 Success response

```
HTTP/1.1 200 OK
Content-Type: application/json

{ "accepted": true, "runId": "<uuid>" }
```

- Status code is **`200 OK`** (not `202` — see [§ Known divergences](#known-divergences)).
- `accepted` is always `true` on this branch. A `false` value is not currently
  emitted by the handler; treat it as reserved for future use.
- `runId` echoes `parsed.data.runId` so the caller can correlate the
  acknowledgement with the dispatched task.

The response is sent **before** the pipeline runs. Cloud Tasks treats any
`2xx` as success; failures inside the pipeline are recorded on the AuditRun
Firestore document (`status: 'FAILED'`, `errorMessage`) by the pipeline's own
error handler.

### 2.4 Error responses

| HTTP | `error.code`      | Trigger                                           |
|------|-------------------|---------------------------------------------------|
| 400  | `INVALID_INPUT`   | Body fails `AuditTaskPayloadSchema.safeParse`     |
| 401  | (middleware)      | OIDC token missing / invalid (when OIDC enabled)  |
| 403  | (middleware)      | OIDC `aud` / `iss` mismatch (when OIDC enabled)   |

`400` body shape:

```jsonc
{
  "error": {
    "code":    "INVALID_INPUT",
    "message": "Cloud Tasks payload invalid",
    "issues":  { /* zod flatten() output */ }
  }
}
```

### 2.5 Idempotency

The worker itself does **not** deduplicate retries. Idempotency is enforced
one level up: `enqueueAuditTask` (in `functions/src/lib/enqueue-audit-task.ts`)
uses the deterministic Cloud Tasks task name `audit-{runId}`, and gRPC code 6
(`ALREADY_EXISTS`) is treated as a successful dedupe. Because the task name is
derived from `runId`, every retry path — Cloud Tasks redelivery, manual
re-enqueue, or function re-invocation — converges on the same task identity.

---

## 3. `GET /healthz`

Readiness signal. Surfaces enough operational context for an SRE to
distinguish a production-configured worker from a dev-bypass worker at a
glance. Environment variables are re-read on every call so runtime overrides
are reflected without a process restart.

### 3.1 Response

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status":          "ok",
  "service":         "audit-worker",
  "version":         "<WORKER_VERSION or '0.1.0'>",
  "nodeEnv":         "<NODE_ENV or 'undefined'>",
  "oidcEnabled":     true,
  "devBypassActive": false,
  "timestamp":       "2026-05-16T12:34:56.789Z"
}
```

| Field             | Type     | Meaning                                                                                  |
|-------------------|----------|------------------------------------------------------------------------------------------|
| `status`          | string   | Always `"ok"`. Reserved for future degraded-state values.                                |
| `service`         | string   | Always `"audit-worker"`. Identifies the binary across multi-service log indexes.         |
| `version`         | string   | `WORKER_VERSION` env var, or `"0.1.0"` if unset.                                         |
| `nodeEnv`         | string   | `NODE_ENV` env var, or `"undefined"` if unset.                                           |
| `oidcEnabled`     | boolean  | `true` iff both `OIDC_EXPECTED_AUDIENCE` and `OIDC_EXPECTED_ISSUER` are set.             |
| `devBypassActive` | boolean  | `true` iff `NODE_ENV !== 'production'` and `ALLOW_DEV_BYPASS === '1'`.                   |
| `timestamp`       | ISO 8601 | Server clock at the moment of the request.                                               |

### 3.2 Operational expectations

- The endpoint is unauthenticated and intended for liveness / readiness
  probes. It does not perform external dependency checks (no Firestore ping,
  no queue ping) — the goal is fast, side-effect-free readiness.
- A production worker MUST report `oidcEnabled: true` and
  `devBypassActive: false`. Any other combination in production is an alert.

---

## 4. Known divergences

The original CR-001 ticket text for the A2 workstream specified
`HTTP 202 + { ok: true, auditRunId }` for `POST /run`. The implemented contract
is `HTTP 200 + { accepted: true, runId }`. The drift was resolved in favour of
the implementation (Option B in
[`docs/issues/worker-run-response-contract.md`](../issues/worker-run-response-contract.md))
for the following reasons:

- Cloud Tasks treats any `2xx` as success; `200` and `202` are operationally
  equivalent for the only current caller.
- `runId` matches the Firestore document id used throughout the rest of the
  pipeline (`runs/{runId}`). Renaming to `auditRunId` would create a
  field-name divergence between the HTTP response and Firestore.
- The worker's own unit tests already pinned the implemented shape, so the
  spec — not the code — was the outlier.

This section will be revisited if and when a non-Cloud-Tasks caller (CLI,
admin UI, etc.) is introduced.

---

## 5. Source of truth

- Handler implementation: `workers/audit-worker/src/server.ts`
- Payload schema: `packages/shared-types/src/audit-task-payload.ts`
  (`AuditTaskPayloadSchema`)
- OIDC middleware: `workers/audit-worker/src/auth/verify-oidc.ts`
- Cloud Tasks enqueue helper: `functions/src/lib/enqueue-audit-task.ts`
- Drift history: `docs/issues/worker-run-response-contract.md`
