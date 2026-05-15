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

echo "==> Deploying Cloud Run service: $SERVICE_NAME"
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
  --min-instances=0 \
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
