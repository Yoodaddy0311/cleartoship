#!/usr/bin/env bash
# 05-deploy-hosting.sh
# Builds apps/web (Next.js 14) and deploys to Firebase Hosting (App Hosting / SSR via frameworksBackend).
#
# Note: cleartoship/firebase.json declares hosting.source=apps/web with
# hosting.frameworksBackend.region=asia-northeast3, so firebase CLI handles the Next.js SSR adapter.
#
# Usage:
#   PROJECT_ID=cleartoship-prod bash infra/scripts/05-deploy-hosting.sh
#   Optional: DRY_RUN=1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

: "${PROJECT_ID:?ERROR: PROJECT_ID env var is required}"
DRY_RUN="${DRY_RUN:-0}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' is not installed." >&2; exit 1; }
}

require_cmd pnpm
require_cmd firebase

run() {
  echo ">> $*"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  "$@"
}

echo "==> Installing workspace dependencies"
cd "$REPO_ROOT"
run pnpm install --frozen-lockfile

echo "==> Building apps/web"
cd "$REPO_ROOT/apps/web"
run pnpm build

echo "==> Deploying Hosting"
cd "$REPO_ROOT"
run firebase deploy \
  --only "hosting" \
  --project="$PROJECT_ID" \
  --non-interactive

echo "==> Hosting deploy complete."
