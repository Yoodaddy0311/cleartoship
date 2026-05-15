# Workload Identity Federation for GitHub Actions.
# Allows the deploy.yml workflow to assume deployer-ci@... without a long-lived JSON key.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "WIF pool for ClearToShip GitHub Actions."

  depends_on = [google_project_service.required_apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC Provider"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
    "attribute.actor"      = "assertion.actor"
  }

  # Restrict tokens to a specific repo (when github_owner is provided).
  attribute_condition = var.github_owner != "" ? "attribute.repository == \"${var.github_owner}/${var.github_repo}\"" : null
}

# Allow tokens minted by the GitHub provider that match the owner/repo to impersonate deployer-ci.
resource "google_service_account_iam_member" "deployer_wif_binding" {
  service_account_id = google_service_account.deployer_ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = var.github_owner != "" ? "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_owner}/${var.github_repo}" : "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/*"
}
