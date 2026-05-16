# Worker /run response contract drift: 200/runId vs spec 202/auditRunId

## 1. Summary

The audit-worker `POST /run` endpoint returns `HTTP 200` with body `{ accepted: true, runId }`,
but the CR-001 ticket spec called for `HTTP 202` with body `{ ok: true, auditRunId }`. The
worker's unit tests are pinned to the actual implementation, so the divergence is currently
invisible at CI time. This issue tracks the decision on how to reconcile the two.

## 2. Spec source

No canonical spec doc exists in `docs/` describing the `/run` response shape. The
`202 + { ok: true, auditRunId }` form was propagated through the CR-001 ticket text
(A2 workstream) only. Searching the repository for `auditRunId` produces no production
code matches — the identifier exists only in the ticket narrative and in this tracker.

## 3. Actual implementation

File: `workers/audit-worker/src/server.ts`
Line: 53 (the ticket originally cited line 35; the response itself is at 53, while line 35
sits inside the `/health` handler — note this offset when cross-referencing).

```ts
res.status(200).json({ accepted: true, runId: parsed.data.runId });
```

Status code: `200 OK`
Body keys: `accepted: boolean`, `runId: string`

## 4. Tests pinning actual

File: `workers/audit-worker/src/server.test.ts`
Lines: 420-421

```ts
expect(res.statusCode).toBe(200);
expect(res.body).toEqual({ accepted: true, runId: 'run-42' });
```

These assertions were written against the actual handler during the A2 work, so any
attempt to "fix" the worker to match the original spec will require coordinated test
updates in the same PR.

## 5. Impact analysis

- **Cloud Tasks**: Cloud Tasks treats every `2xx` as success and every non-`2xx` as a
  retryable failure. `200` and `202` are operationally equivalent for the dispatcher.
  **No operational impact today.**
- **External clients**: There is no production client that calls the worker directly today
  — the only caller is the Cloud Tasks queue dispatched by the `dispatchAuditRun` Cloud
  Function. If a future client (CLI, debugging tool, internal admin UI) is built against
  the original spec, it will look for `auditRunId` in the body and find `runId` instead.
- **Debugging / log searches**: The body field name `runId` matches the Firestore document
  id used throughout the rest of the pipeline (`runs/{runId}`), so the current naming is
  arguably more consistent than the spec. Renaming to `auditRunId` would create a
  field-name divergence between the HTTP response and Firestore.
- **OpenAPI / contract testing**: No OpenAPI document exists for the worker, so there is
  no automated contract test that would catch drift. The unit test pins behaviour but
  cannot detect that it disagrees with the ticket.

## 6. Decision options

### Option A — Align worker to spec (breaking change to worker)

Change `server.ts:53` to `res.status(202).json({ ok: true, auditRunId: parsed.data.runId })`.

- Pros: Honours the original ticket wording; `202 Accepted` is more semantically accurate
  for fire-and-forget async work than `200 OK`.
- Cons: Requires a paired test update (`server.test.ts:420-421`); diverges field name
  `auditRunId` from the Firestore `runId` convention used elsewhere; no real consumer
  benefits today, so the change is pure ceremony.

### Option B — Update spec to match implementation (recommended)

Treat the implementation as authoritative and amend the ticket / future API doc to
`200 + { accepted: true, runId }`. The next contract artefact (OpenAPI, README section,
or design doc) will codify this canonical form.

- Pros: Zero code change, zero risk of regression, preserves Firestore field-name
  consistency, lowest cost.
- Cons: Mild semantic loss — `200` is less precise than `202` for async acceptance.

### Option C — Maintain both keys (transitional)

Return `res.status(200).json({ accepted: true, ok: true, runId: x, auditRunId: x })`.

- Pros: Forward-compatible if Option A is later chosen; clients of either shape work.
- Cons: Adds dead weight to every response; clutters logs; no current consumer needs it;
  defers the decision instead of resolving it.

## 7. Recommendation

**Option B.** Cloud Tasks is the only caller and is indifferent between `200` and `202`,
no external client exists, the unit test already pins the implemented behaviour, and the
field name `runId` is consistent with the rest of the pipeline. The cost of Option A is
real (paired test edit, naming divergence with Firestore) and the benefit is purely
cosmetic until an external client appears. Revisit if and when a non-Cloud-Tasks caller
is introduced.

## 8. Action items

- [ ] Locate or create the canonical worker API doc (candidate: `docs/architecture/worker-http-api.md`
      or a section in `docs/DEVELOPMENT.md`).
- [ ] Open a PR documenting `POST /run -> 200 { accepted: true, runId }` as the contract.
- [ ] Reference this tracker in the PR description so the historical drift is searchable.
- [ ] Close this issue once the doc PR merges.

## 9. Status

`open` — pending decision by orchestrator / tech lead. Recommended resolution is Option B
(spec aligned to implementation, no worker code change).

## 10. Owner

TBD — to be assigned by orchestrator. Suggested owner: whoever maintains the worker /
audit pipeline area (originated from the A2 workstream).

### Action item closure (2026-05-16)

Items 1-3 of §8 closed via Option B (spec aligned to implementation):

- [x] **(1) 2026-05-16** — Canonical worker API doc created at
  `docs/architecture/worker-http-api.md` documenting
  `POST /run -> 200 + { accepted: true, runId }` and the `GET /healthz`
  readiness response.
- [x] **(2) 2026-05-16** — Documentation PR records the contract; see CHANGELOG
  entry "Sprint 1 Hardening (2026-05-16, afternoon session)".
- [x] **(3) 2026-05-16** — This tracker is referenced from
  `docs/architecture/worker-http-api.md` §4 (Known divergences) and §5
  (Source of truth), so the historical drift remains searchable.

Item 4 (close issue) remains open pending the doc PR merge.
