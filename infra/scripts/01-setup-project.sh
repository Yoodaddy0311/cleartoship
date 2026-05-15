#!/usr/bin/env bash
# 01-setup-project.sh
# Creates the GCP project (if needed), links billing, and applies Terraform.
# Writes resulting SA emails / queue / registry URL to .firebaserc projects.default.
#
# Usage:
#   PROJECT_ID=cleartoship-prod BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX \
#     bash infra/scripts/01-setup-project.sh
#
#   Optional: REGION (default asia-northeast3), DRY_RUN=1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TF_DIR="$REPO_ROOT/infra/terraform"

: "${PROJECT_ID:?ERROR: PROJECT_ID env var is required (e.g., PROJECT_ID=cleartoship-prod)}"
: "${BILLING_ACCOUNT:?ERROR: BILLING_ACCOUNT env var is required (XXXXXX-XXXXXX-XXXXXX)}"
REGION="${REGION:-asia-northeast3}"
DRY_RUN="${DRY_RUN:-0}"

run() {
  echo ">> $*"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  "$@"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' is not installed or not on PATH." >&2; exit 1; }
}

require_cmd gcloud
require_cmd terraform
require_cmd jq

echo "==> Verifying authenticated gcloud user"
gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n1 || {
  echo "ERROR: run 'gcloud auth login' and 'gcloud auth application-default login' first." >&2
  exit 1
}

echo "==> Ensuring project exists: $PROJECT_ID"
if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Project $PROJECT_ID already exists."
else
  run gcloud projects create "$PROJECT_ID" --name="ClearToShip"
fi

echo "==> Linking billing account"
run gcloud beta billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"

echo "==> Setting active project"
run gcloud config set project "$PROJECT_ID"

echo "==> Initializing Terraform"
cd "$TF_DIR"

# Generate a minimal tfvars file if user didn't create one.
if [[ ! -f "$TF_DIR/terraform.tfvars" ]]; then
  cat > "$TF_DIR/terraform.tfvars.local" <<EOF
project_id      = "$PROJECT_ID"
region          = "$REGION"
billing_account = "$BILLING_ACCOUNT"
EOF
  TFVARS_FILE="$TF_DIR/terraform.tfvars.local"
else
  TFVARS_FILE="$TF_DIR/terraform.tfvars"
fi

run terraform init -upgrade

echo "==> Applying Terraform"
if [[ "$DRY_RUN" == "1" ]]; then
  terraform plan -var-file="$TFVARS_FILE"
else
  terraform apply -auto-approve -var-file="$TFVARS_FILE"
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[DRY_RUN] Skipping output extraction."
  exit 0
fi

echo "==> Reading Terraform outputs"
WORKER_SA=$(terraform output -raw worker_sa_email)
INVOKER_SA=$(terraform output -raw invoker_sa_email)
FUNCTIONS_SA=$(terraform output -raw functions_sa_email)
DEPLOYER_SA=$(terraform output -raw deployer_sa_email)
QUEUE_NAME=$(terraform output -raw queue_short_name)
REGISTRY_URL=$(terraform output -raw registry_url)
WIF_PROVIDER=$(terraform output -raw wif_provider)

echo "==> Updating $REPO_ROOT/.firebaserc"
FIREBASERC="$REPO_ROOT/.firebaserc"
if [[ -f "$FIREBASERC" ]]; then
  tmp=$(mktemp)
  jq --arg pid "$PROJECT_ID" '.projects.default = $pid' "$FIREBASERC" > "$tmp"
  mv "$tmp" "$FIREBASERC"
else
  cat > "$FIREBASERC" <<EOF
{
  "projects": {
    "default": "$PROJECT_ID"
  }
}
EOF
fi

cat <<SUMMARY

================================================================
Terraform apply complete.
================================================================
  PROJECT_ID         = $PROJECT_ID
  REGION             = $REGION
  worker SA          = $WORKER_SA
  invoker SA         = $INVOKER_SA
  functions SA       = $FUNCTIONS_SA
  deployer SA (CI)   = $DEPLOYER_SA
  Cloud Tasks queue  = $QUEUE_NAME
  Registry base URL  = $REGISTRY_URL
  WIF provider       = $WIF_PROVIDER

Next: bash infra/scripts/02-build-worker.sh
================================================================
SUMMARY
