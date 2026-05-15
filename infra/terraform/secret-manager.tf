# Secret Manager resources for ClearToShip.
# These resources define the secret containers only; values must be added separately
# via `gcloud secrets versions add` or the deploy scripts.

resource "google_secret_manager_secret" "github_token" {
  secret_id = "github-token"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "anthropic-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret" "cloud_run_worker_url" {
  secret_id = "cloud-run-worker-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

# Grant functions-runtime read access to the worker URL secret so trigger code can resolve it.
resource "google_secret_manager_secret_iam_member" "functions_read_worker_url" {
  secret_id = google_secret_manager_secret.cloud_run_worker_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.functions_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "functions_read_github_token" {
  secret_id = google_secret_manager_secret.github_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.functions_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "worker_read_anthropic" {
  secret_id = google_secret_manager_secret.anthropic_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.audit_worker_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "worker_read_github_token" {
  secret_id = google_secret_manager_secret.github_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.audit_worker_runtime.email}"
}
