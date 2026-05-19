output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "worker_sa_email" {
  description = "Runtime service account for audit-worker Cloud Run service."
  value       = google_service_account.audit_worker_runtime.email
}

output "web_ssr_sa_email" {
  description = "Runtime service account for web-ssr Cloud Run service."
  value       = google_service_account.web_ssr_runtime.email
}

output "invoker_sa_email" {
  description = "Service account used by Functions/Cloud Tasks to OIDC-invoke the worker."
  value       = google_service_account.cloud_run_invoker.email
}

output "functions_sa_email" {
  description = "Runtime service account for Cloud Functions."
  value       = google_service_account.functions_runtime.email
}

output "deployer_sa_email" {
  description = "Service account that GitHub Actions impersonates via WIF."
  value       = google_service_account.deployer_ci.email
}

output "queue_name" {
  description = "Full resource name of the audit-jobs Cloud Tasks queue."
  value       = google_cloud_tasks_queue.audit_jobs.id
}

output "queue_short_name" {
  description = "Short name (id) of the audit-jobs Cloud Tasks queue."
  value       = google_cloud_tasks_queue.audit_jobs.name
}

output "registry_url" {
  description = "Base URL for the Artifact Registry Docker repo."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.cleartoship_images.repository_id}"
}

output "wif_provider" {
  description = "Full resource name of the GitHub WIF provider (use as GCP_WIF_PROVIDER secret)."
  value       = "projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github.workload_identity_pool_provider_id}"
}

output "secret_names" {
  description = "Secret Manager secret IDs created by this module."
  value = {
    github_token         = google_secret_manager_secret.github_token.secret_id
    anthropic_api_key    = google_secret_manager_secret.anthropic_api_key.secret_id
    cloud_run_worker_url = google_secret_manager_secret.cloud_run_worker_url.secret_id
  }
}
