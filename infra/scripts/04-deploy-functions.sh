#!/usr/bin/env bash
# 04-deploy-functions.sh
# Builds the functions/ workspace and deploys Cloud Functions, Firestore rules+indexes, and Storage rules.
#
# Usage:
#   PROJECT_ID=cleartoship-prod bash infra/scripts/04-deploy-functions.sh
#   Optional: DRY_RUN=1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

: "${PROJECT_ID:?ERROR: PROJECT_ID env var is required}"
REGION="${REGION:-asia-northeast3}"
DRY_RUN="${DRY_RUN:-0}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' is not installed." >&2; exit 1; }
}

require_cmd pnpm
require_cmd firebase
require_cmd gcloud

run() {
  echo ">> $*"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  "$@"
}

echo "==> Resolving worker URL from Secret Manager"
if [[ "$DRY_RUN" != "1" ]]; then
  WORKER_URL=$(gcloud secrets versions access latest \
    --secret=cloud-run-worker-url \
    --project="$PROJECT_ID")
  if [[ -z "$WORKER_URL" ]]; then
    echo "ERROR: cloud-run-worker-url secret is empty. Run 03-deploy-worker.sh first." >&2
    exit 1
  fi
  echo "Worker URL: $WORKER_URL"
else
  WORKER_URL="https://example.invalid"
fi

INVOKER_SA="cloud-run-invoker@$PROJECT_ID.iam.gserviceaccount.com"
FUNCTIONS_SA="functions-runtime@$PROJECT_ID.iam.gserviceaccount.com"

echo "==> Installing and building functions/"
cd "$REPO_ROOT/functions"
run pnpm install --frozen-lockfile
run pnpm build

cd "$REPO_ROOT"

echo "==> Setting Cloud Functions secrets (CLOUD_RUN_WORKER_URL, INVOKER_SA)"
# firebase functions:secrets:set is interactive; use --data-file or pipe via stdin.
if [[ "$DRY_RUN" != "1" ]]; then
  printf '%s' "$WORKER_URL" | firebase functions:secrets:set CLOUD_RUN_WORKER_URL \
    --project="$PROJECT_ID" \
    --data-file=- || true
  printf '%s' "$INVOKER_SA" | firebase functions:secrets:set INVOKER_SA \
    --project="$PROJECT_ID" \
    --data-file=- || true
  printf '%s' "$FUNCTIONS_SA" | firebase functions:secrets:set FUNCTIONS_SA \
    --project="$PROJECT_ID" \
    --data-file=- || true
fi

echo "==> Deploying Functions + Firestore rules/indexes + Storage rules"
run firebase deploy \
  --only "functions,firestore:rules,firestore:indexes,storage:rules" \
  --project="$PROJECT_ID" \
  --non-interactive

echo "==> Done."
echo "Next: bash infra/scripts/05-deploy-hosting.sh"
