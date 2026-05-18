#!/usr/bin/env bash
# 02-build-worker.sh
# Builds the audit-worker container image and pushes to Artifact Registry.
#
# Usage:
#   PROJECT_ID=cleartoship-prod bash infra/scripts/02-build-worker.sh
#   Optional: REGION (default asia-northeast3), IMAGE_TAG (default v0.1.0)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

: "${PROJECT_ID:?ERROR: PROJECT_ID env var is required}"
REGION="${REGION:-asia-northeast3}"
IMAGE_TAG="${IMAGE_TAG:-v0.1.0}"
DRY_RUN="${DRY_RUN:-0}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' is not installed." >&2; exit 1; }
}

require_cmd gcloud
require_cmd docker

IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/cleartoship-images/audit-worker:$IMAGE_TAG"
LATEST_URI="$REGION-docker.pkg.dev/$PROJECT_ID/cleartoship-images/audit-worker:latest"

run() {
  echo ">> $*"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  "$@"
}

WORKER_DIR="$REPO_ROOT/workers/audit-worker"
if [[ ! -d "$WORKER_DIR" ]]; then
  echo "ERROR: $WORKER_DIR does not exist." >&2
  exit 1
fi

echo "==> Configuring Docker for Artifact Registry ($REGION)"
run gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

echo "==> Building $IMAGE_URI"
# Dockerfile uses monorepo-rooted COPY paths (packages/, workers/),
# so the build context must be the repo root, not $WORKER_DIR.
run docker build \
  --platform linux/amd64 \
  -t "$IMAGE_URI" \
  -t "$LATEST_URI" \
  -f "$WORKER_DIR/Dockerfile" \
  "$REPO_ROOT"

echo "==> Pushing image"
run docker push "$IMAGE_URI"
run docker push "$LATEST_URI"

echo "==> Image pushed: $IMAGE_URI"
echo "Next: bash infra/scripts/03-deploy-worker.sh"
