#!/usr/bin/env bash
# 06-deploy-enrichment.sh
# Builds the enrichment-worker container image, pushes it to Artifact Registry,
# and deploys it as a Cloud Run JOB (batch, not an HTTP service).
#
# The enrichment-worker is fired by the `onAuditRunCompleted` Firestore trigger
# (functions/src/triggers/on-audit-run-completed.ts) via JobsClient.runJob with
# a RUN_ID container override. It loads the audit report from Firestore, calls
# the Gemini API (@google/genai, AI Studio key) under a per-category token
# budget, and writes report.enrichment back.
#
# Usage:
#   PROJECT_ID=cleartoship-prod bash infra/scripts/06-deploy-enrichment.sh
#   Optional: REGION (default asia-northeast3), IMAGE_TAG (default v0.1.0),
#             JOB_NAME (default enrichment-worker),
#             ENRICHMENT_MODEL (default gemini-3.5-flash),
#             DRY_RUN=1 (print commands, do not execute)
#
# -----------------------------------------------------------------------------
# OPERATOR PREREQUISITES (one-time, NOT executed by this script)
# -----------------------------------------------------------------------------
#  1. Secret Manager — the Gemini (AI Studio) API key MUST exist before this
#     script's `--set-secrets` line can resolve. Create it once (cost: none):
#
#       printf '%s' "AIza…" | gcloud secrets create GEMINI_API_KEY \
#         --data-file=- --project="$PROJECT_ID"
#       # rotate later with: gcloud secrets versions add GEMINI_API_KEY …
#
#  2. Job runtime SA — this script deploys the job to run AS
#     enrichment-worker-runtime@$PROJECT_ID.iam.gserviceaccount.com. That SA needs:
#       - roles/datastore.user            (Firestore read report + write enrichment)
#       - roles/secretmanager.secretAccessor on the GEMINI_API_KEY secret
#     Grant (one-time):
#       gcloud iam service-accounts create enrichment-worker-runtime \
#         --project="$PROJECT_ID" --display-name="enrichment-worker job runtime"
#       gcloud projects add-iam-policy-binding "$PROJECT_ID" \
#         --member="serviceAccount:enrichment-worker-runtime@$PROJECT_ID.iam.gserviceaccount.com" \
#         --role="roles/datastore.user"
#       gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
#         --project="$PROJECT_ID" \
#         --member="serviceAccount:enrichment-worker-runtime@$PROJECT_ID.iam.gserviceaccount.com" \
#         --role="roles/secretmanager.secretAccessor"
#
#  3. Function SA → run the job. The Cloud Functions runtime SA
#     (functions-runtime@$PROJECT_ID.iam.gserviceaccount.com) executes the job
#     via JobsClient.runJob, so it needs permission to run THIS job. Grant
#     roles/run.developer (covers run.jobs.runWithOverrides) scoped to the job:
#       gcloud run jobs add-iam-policy-binding enrichment-worker \
#         --project="$PROJECT_ID" --region="$REGION" \
#         --member="serviceAccount:functions-runtime@$PROJECT_ID.iam.gserviceaccount.com" \
#         --role="roles/run.developer"
#     (Project-level roles/run.developer also works but is broader than needed.)
# -----------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

: "${PROJECT_ID:?ERROR: PROJECT_ID env var is required}"
REGION="${REGION:-asia-northeast3}"
IMAGE_TAG="${IMAGE_TAG:-v0.1.0}"
JOB_NAME="${JOB_NAME:-enrichment-worker}"
# Default enrichment model — override per environment if desired.
ENRICHMENT_MODEL="${ENRICHMENT_MODEL:-gemini-3.5-flash}"
DRY_RUN="${DRY_RUN:-0}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' is not installed." >&2; exit 1; }
}

require_cmd gcloud
require_cmd docker

IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/cleartoship-images/enrichment-worker:$IMAGE_TAG"
LATEST_URI="$REGION-docker.pkg.dev/$PROJECT_ID/cleartoship-images/enrichment-worker:latest"
RUNTIME_SA="enrichment-worker-runtime@$PROJECT_ID.iam.gserviceaccount.com"

run() {
  echo ">> $*"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  "$@"
}

WORKER_DIR="$REPO_ROOT/workers/enrichment-worker"
if [[ ! -d "$WORKER_DIR" ]]; then
  echo "ERROR: $WORKER_DIR does not exist." >&2
  exit 1
fi

echo "==> Configuring Docker for Artifact Registry ($REGION)"
run gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

echo "==> Building $IMAGE_URI"
# Dockerfile uses monorepo-rooted COPY paths (packages/, workers/, .claude/skills),
# so the build context MUST be the repo root, not $WORKER_DIR.
# COST: docker build is local CPU only — no cloud charge until push.
run docker build \
  --platform linux/amd64 \
  -t "$IMAGE_URI" \
  -t "$LATEST_URI" \
  -f "$WORKER_DIR/Dockerfile" \
  "$REPO_ROOT"

echo "==> Pushing image"
# COST: Artifact Registry storage (cheap, GB-months). Push is the first
# cost-incurring step in this script.
run docker push "$IMAGE_URI"
run docker push "$LATEST_URI"

echo "==> Deploying Cloud Run JOB: $JOB_NAME"
# `gcloud run jobs deploy` creates the job if absent, updates it if present.
# Job-appropriate flags only — no --port / --concurrency / --allow-unauthenticated
# / --min-instances / --cpu-throttling (those are SERVICE flags; jobs reject them).
#   --max-retries 1   : one retry on task failure (idempotent — the job
#                       cache-guards on report.enrichment).
#   --task-timeout 600: 10 min cap per task (LLM calls + Firestore write).
#   --set-secrets     : GEMINI_API_KEY mounted from Secret Manager :latest.
#                       The secret MUST already exist (operator prereq #1 above).
#   --set-env-vars    : ENRICHMENT_MODEL + project/region for Firestore access.
# COST: deploying a job incurs no standing cost (jobs only bill while a task
# runs). The trigger executes one task per aiEnhanced COMPLETED audit.
run gcloud run jobs deploy "$JOB_NAME" \
  --image="$IMAGE_URI" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --service-account="$RUNTIME_SA" \
  --max-retries=1 \
  --task-timeout=600 \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars="ENRICHMENT_MODEL=$ENRICHMENT_MODEL,GCP_PROJECT=$PROJECT_ID,REGION=$REGION,NODE_ENV=production" \
  --quiet

echo "==> Done."
echo "Job deployed: $JOB_NAME ($IMAGE_URI)"
echo
echo "Reminder — verify the operator IAM grants from the header are in place:"
echo "  - job runtime SA ($RUNTIME_SA): roles/datastore.user + secretAccessor on GEMINI_API_KEY"
echo "  - functions-runtime SA: roles/run.developer on job '$JOB_NAME'"
echo "  - Secret Manager: GEMINI_API_KEY must exist (gcloud secrets create …)"
