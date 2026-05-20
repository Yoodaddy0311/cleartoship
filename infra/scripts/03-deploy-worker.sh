#!/usr/bin/env bash
# 03-deploy-worker.sh
# Deploys the audit-worker image to Cloud Run and stores the resulting URL
# in Secret Manager ('cloud-run-worker-url') for Functions to consume.
#
# Usage:
#   PROJECT_ID=cleartoship-prod bash infra/scripts/03-deploy-worker.sh
#   Optional: REGION (default asia-northeast3), IMAGE_TAG (default v0.1.0)

set -euo pipefail

: "${PROJECT_ID:?ERROR: PROJECT_ID env var is required}"
REGION="${REGION:-asia-northeast3}"
IMAGE_TAG="${IMAGE_TAG:-v0.1.0}"
SERVICE_NAME="${SERVICE_NAME:-audit-worker}"
DRY_RUN="${DRY_RUN:-0}"

# Cold-start mitigation: prod keeps 1 warm instance (#96 / T1.6-FU).
# staging/dev stay at 0 to avoid ~$10/mo idle cost per env.
# Override with MIN_INSTANCES=<n> if needed.
if [[ -z "${MIN_INSTANCES:-}" ]]; then
  if [[ "$PROJECT_ID" == *"prod"* ]]; then
    MIN_INSTANCES=1
  else
    MIN_INSTANCES=0
  fi
fi

# Phase 0 P0.W3.5 — mirror of .github/workflows/deploy.yml CPU
# throttling policy. Keep both files in sync (substring match on
# 'prod' in PROJECT_ID).
if [[ -z "${CPU_THROTTLING_FLAG:-}" ]]; then
  if [[ "$PROJECT_ID" == *"prod"* ]]; then
    CPU_THROTTLING_FLAG="--no-cpu-throttling"
  else
    CPU_THROTTLING_FLAG=""
  fi
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' is not installed." >&2; exit 1; }
}

require_cmd gcloud

IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/cleartoship-images/audit-worker:$IMAGE_TAG"
RUNTIME_SA="audit-worker-runtime@$PROJECT_ID.iam.gserviceaccount.com"

run() {
  echo ">> $*"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  "$@"
}

echo "==> Deploying Cloud Run service: $SERVICE_NAME (min-instances=$MIN_INSTANCES cpu-throttling=$CPU_THROTTLING_FLAG)"
run gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE_URI" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --service-account="$RUNTIME_SA" \
  --no-allow-unauthenticated \
  --cpu=4 \
  --memory=4Gi \
  --concurrency=1 \
  --timeout=600 \
  --max-instances=10 \
  --min-instances="$MIN_INSTANCES" \
  $CPU_THROTTLING_FLAG \
  --set-env-vars="PROJECT_ID=$PROJECT_ID,REGION=$REGION,NODE_ENV=production" \
  --quiet

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[DRY_RUN] Skipping URL extraction."
  exit 0
fi

echo "==> Extracting Cloud Run URL"
URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)')

echo "Cloud Run URL: $URL"

echo "==> Granting cloud-run-invoker permission on the service"
INVOKER_SA="cloud-run-invoker@$PROJECT_ID.iam.gserviceaccount.com"
run gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:$INVOKER_SA" \
  --role="roles/run.invoker" \
  --quiet

echo "==> Storing worker URL in Secret Manager (cloud-run-worker-url)"
# Add a new secret version (creates if missing).
printf '%s' "$URL" | run gcloud secrets versions add cloud-run-worker-url \
  --data-file=- \
  --project="$PROJECT_ID"

echo "==> Done."
echo "Cloud Run worker URL: $URL"
echo "Next: bash infra/scripts/04-deploy-functions.sh"
