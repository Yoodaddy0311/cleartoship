#!/usr/bin/env bash
# 00-all.sh
# Runs the full deploy pipeline: project setup → worker build → worker deploy → functions deploy → hosting deploy.
#
# Usage:
#   PROJECT_ID=cleartoship-prod BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX \
#     bash infra/scripts/00-all.sh
#
#   Optional env vars: REGION, IMAGE_TAG, DRY_RUN

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${PROJECT_ID:?ERROR: PROJECT_ID env var is required}"
: "${BILLING_ACCOUNT:?ERROR: BILLING_ACCOUNT env var is required}"

echo "############################################################"
echo "ClearToShip — full deploy"
echo "  PROJECT_ID      = $PROJECT_ID"
echo "  REGION          = ${REGION:-asia-northeast3}"
echo "  IMAGE_TAG       = ${IMAGE_TAG:-v0.1.0}"
echo "  DRY_RUN         = ${DRY_RUN:-0}"
echo "############################################################"

bash "$SCRIPT_DIR/01-setup-project.sh"
bash "$SCRIPT_DIR/02-build-worker.sh"
bash "$SCRIPT_DIR/03-deploy-worker.sh"
bash "$SCRIPT_DIR/04-deploy-functions.sh"
bash "$SCRIPT_DIR/05-deploy-hosting.sh"

echo
echo "############################################################"
echo "All steps completed successfully."
echo "Visit Firebase Console: https://console.firebase.google.com/project/$PROJECT_ID/overview"
echo "############################################################"
