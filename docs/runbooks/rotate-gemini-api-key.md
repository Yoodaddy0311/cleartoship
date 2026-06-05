# Runbook — Rotate `GEMINI_API_KEY` (compromised: plaintext chat exposure)

> **Status**: UNRESOLVED operator action. A prior session exposed the live
> `GEMINI_API_KEY` value in a chat transcript. The repo itself is clean (no key
> literal committed — verified), but the **value is burned** and must be rotated.
>
> **Owner**: project operator (you). Claude/CI cannot mint or revoke the key.
> **Project**: `cleartoship-prod` · **Region**: `asia-northeast3`
> **Launch day**: 2026-06-05.

---

## 0. Severity & urgency

**Severity: HIGH · Urgency: P1 (not a launch blocker).**

Rationale (evidence-based):

- The key is **single-purpose**: it only authorizes calls to the Gemini
  Developer API (Google AI Studio) for L-bucket enrichment. It is **not** a GCP
  IAM credential — a leaked AI Studio key cannot touch Firestore, Cloud Run,
  billing admin, or any project resource. Blast radius = "someone can spend your
  Gemini quota / run up Gemini cost," not "project compromise."
- The enrichment job is a **non-critical, non-fatal** path: the deploy pipeline
  explicitly skips it when the secret is absent and does **not** red the deploy
  (`.github/workflows/deploy.yml:321-324`). Core audit (web / audit-worker /
  functions) does not depend on this key.
- Therefore it does **not** block the 2026-06-05 launch. But because the exposed
  value is live and billable, rotate it **today** to cap cost/abuse exposure.

> Escalate to **P0** only if billing alerts show anomalous Gemini spend before
> rotation completes.

---

## 1. Blast radius — every consumer of the key

There is exactly **one** runtime consumer and **one** secret store. Confirmed by
full-repo grep; no GitHub Actions secret, no `.env`, no Firebase Functions
config holds this value.

| # | Consumer | How it reads the key | Evidence |
|---|----------|----------------------|----------|
| 1 | **Secret Manager secret** `GEMINI_API_KEY` (project `cleartoship-prod`) — the single source of truth | Stored as a secret version; mounted at deploy time | `infra/scripts/06-deploy-enrichment.sh:132`; `.github/workflows/deploy.yml:336` |
| 2 | **Cloud Run job** `enrichment-worker` | Mounts `--set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest"` as an env var at task start; runtime SA `enrichment-worker-runtime@…` needs `secretmanager.secretAccessor` | `06-deploy-enrichment.sh:132`, `:39-42`; `deploy.yml:336` |
| 3 | **App code** `enrichment-worker` | `process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY` → `new GoogleGenAI({ apiKey })` | `workers/enrichment-worker/src/index.ts:83,94`; `workers/enrichment-worker/src/gemini-provider.ts:1,133` |

**Key facts that shape rotation (verified):**

- **Console = Google AI Studio (Gemini Developer API), NOT Vertex AI.** The SDK
  is `@google/genai` constructed with `new GoogleGenAI({ apiKey })`
  (`gemini-provider.ts:1,133`) and the provider doc-comment states "Gemini
  Developer API (AI Studio) with a `GEMINI_API_KEY`"
  (`gemini-provider.ts:12-14`). Vertex AI uses ADC/SA auth, not an `AIza…` API
  key. → **Rotate in AI Studio / "Gemini API keys", not the Vertex console.**
- **`GOOGLE_API_KEY` fallback is dead code in prod — ignore it.** `index.ts:83`
  reads `process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY`, but
  `GOOGLE_API_KEY` is never provisioned (not in Secret Manager, not in
  `deploy.yml`/`06-deploy-enrichment.sh`), so it evaluates to empty in prod.
  → Rotating `GEMINI_API_KEY` alone is sufficient; there is **no separate
  `GOOGLE_API_KEY` to rotate**.
- Because `:latest` is mounted (`--set-secrets=…:latest`), simply **adding a new
  secret version** makes Secret Manager serve the new value — but a running/
  deployed Cloud Run **job picks up env-mounted secrets only at task start of a
  fresh deploy/execution**, so a re-deploy (or next trigger-fired execution)
  is required to guarantee the new version is in effect.
- **No `gh secret set` step is needed** — `GEMINI_API_KEY` is **not** a GitHub
  Actions secret (the only repo secrets are `GCP_DEPLOYER_SA`,
  `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`). Do **not** add it to GitHub Actions.

---

## 2. Rotation steps

> Run from your own terminal authenticated to `cleartoship-prod`. **Never paste
> the key into chat, a commit, a ticket, or `--data` flags.** Always feed it via
> `stdin` / `--data-file=-` so it stays out of shell history and process args.

Set once:

```bash
export PROJECT=cleartoship-prod
export REGION=asia-northeast3
```

### (a) Mint a NEW key in Google AI Studio (Gemini Developer API)

1. Open **https://aistudio.google.com/apikey** (Google AI Studio → "API keys").
2. Ensure the top-left project selector = **`cleartoship-prod`** (or the GCP
   project that owns the existing key — match it).
3. **Create API key** → choose project `cleartoship-prod`. Copy the new `AIza…`
   value to your clipboard only (do not save to a file).
4. **Do not delete the old key yet** — you revoke it in step (d) after the new
   one is verified live, so enrichment never has a dead-key window.

### (b) Add the new value as a NEW Secret Manager version

```bash
# Feed via stdin — value never appears in argv or shell history.
printf '%s' 'PASTE_NEW_KEY_HERE' | \
  gcloud secrets versions add GEMINI_API_KEY \
    --data-file=- --project="$PROJECT"
```

Confirm the new version is `:latest` and `enabled`:

```bash
gcloud secrets versions list GEMINI_API_KEY --project="$PROJECT" --limit=3
```

> Then immediately clear your clipboard. (The IAM grant for the runtime SA
> already exists — `06-deploy-enrichment.sh:39-42` — so no re-grant is needed.)

### (c) Redeploy the job so it consumes the new version

The mount is `GEMINI_API_KEY:latest`, but force a fresh job revision so the next
execution is guaranteed to bind the new version (and to validate the mount):

```bash
gcloud run jobs update enrichment-worker \
  --region="$REGION" --project="$PROJECT" \
  --update-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" --quiet
```

> Equivalent alternative: re-run `PROJECT_ID=$PROJECT bash infra/scripts/06-deploy-enrichment.sh`
> (rebuilds + redeploys). The lighter `jobs update` above is sufficient for a
> key rotation — no image change is involved.

### (d) Verify the new key works BEFORE revoking the old one

Two options — do at least one:

**Option 1 — direct API smoke test** (fastest; confirms the *new key string*):

```bash
# Read the new value back from Secret Manager into a shell var (not echoed).
NEWKEY="$(gcloud secrets versions access latest \
  --secret=GEMINI_API_KEY --project="$PROJECT")"

# Lightweight, low-cost call to the Gemini Developer API. HTTP 200 = key live.
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "x-goog-api-key: ${NEWKEY}" \
  "https://generativelanguage.googleapis.com/v1beta/models"

unset NEWKEY   # scrub from the shell session
```

Expect `200`. A `400/403` means the key is wrong/restricted — fix before step (e).

**Option 2 — end-to-end via the real job** (confirms the *full mount path*):

```bash
# Execute the job against a known COMPLETED audit run; it reads the secret,
# calls Gemini, writes report.enrichment. Use a throwaway/test runId.
gcloud run jobs execute enrichment-worker \
  --region="$REGION" --project="$PROJECT" \
  --args="" --update-env-vars="RUN_ID=<test-run-id>" --wait
# Then check logs for "enrichment complete" (index.ts:98) — not "GEMINI_API_KEY is not set".
gcloud beta run jobs executions logs read <execution-id> \
  --region="$REGION" --project="$PROJECT" 2>/dev/null | tail -20
```

### (e) Revoke the OLD key

Only after step (d) shows the new key live:

1. Back in **https://aistudio.google.com/apikey**, locate the **old** key (the
   exposed one — identify by creation date, not value).
2. **Delete** it. This is the actual revocation — the leaked string is now dead.

### (f) Confirm the old key is dead

```bash
# Replace OLD_KEY with the exposed value ONCE, via stdin tooling if possible.
# A revoked key returns 400 INVALID_ARGUMENT / 403, never 200.
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "x-goog-api-key: PASTE_OLD_KEY_HERE" \
  "https://generativelanguage.googleapis.com/v1beta/models"
```

Expect **non-200** (typically `400`/`403`). If it still returns `200`, the wrong
key was deleted — repeat (e). Then scrub the value from your terminal/clipboard.

---

## 3. Verification checklist (operator ticks each)

- [ ] New key minted in **AI Studio** under project `cleartoship-prod` (not Vertex).
- [ ] New Secret Manager version added; `versions list` shows it `enabled` + latest.
- [ ] `enrichment-worker` job updated to a fresh revision (`jobs update` ran clean).
- [ ] New key smoke test → **HTTP 200** (step d).
- [ ] (Optional) E2E job execution logged `enrichment complete`, not "not set".
- [ ] Old key **deleted** in AI Studio (step e).
- [ ] Old key smoke test → **non-200 / dead** (step f).
- [ ] Clipboard + shell history scrubbed of both old and new key values.
- [ ] No GitHub Actions secret was created for this key (correct — it is SM-only).

---

## 4. Prevention (2 concrete actions)

1. **Pre-commit secret scanning.** Add `gitleaks` (or `trufflehog`) as a
   pre-commit hook + a CI step so an `AIza…` literal can never reach a commit.
   Minimal CI add to `.github/workflows/`: run `gitleaks detect --no-banner` on
   PRs. (Repo is already clean — verified no key literal in history — this keeps
   it that way.)
2. **Never surface secret values in transcripts.** Keep reading the key only via
   Secret Manager mounts (`--set-secrets=…:latest`, already the pattern) and
   read-backs into shell vars that are never `echo`'d. Operators should feed
   values via `--data-file=-` / `printf | stdin`, never as inline CLI args or
   chat messages. (This single discipline would have prevented the original
   exposure.)

---

## Evidence appendix (file:line)

- Runtime read: `workers/enrichment-worker/src/index.ts:83` (`process.env.GEMINI_API_KEY`), `:94` (`new GeminiProvider`).
- SDK / console identity: `workers/enrichment-worker/src/gemini-provider.ts:1` (`@google/genai`), `:12-14` (AI Studio Developer API), `:133` (`new GoogleGenAI({ apiKey })`).
- Secret mount (CI): `.github/workflows/deploy.yml:336` (`--set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest"`), skip-if-absent guard `:321-324`.
- Secret mount (script) + IAM: `infra/scripts/06-deploy-enrichment.sh:132`, `:25-27` (create/rotate hint), `:39-42` (accessor grant).
- Not a GitHub secret: `gh secret list` → only `GCP_DEPLOYER_SA`, `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`.
- Repo clean: `git log -p -S 'AIza'` → no matches; `.env*` git-ignored (`.gitignore:14-20`), none tracked.
