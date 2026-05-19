resource "google_service_account" "cloud_run_invoker" {
  project      = var.project_id
  account_id   = "cloud-run-invoker"
  display_name = "Cloud Run Invoker (Functions → audit-worker)"
  description  = "Used by Cloud Functions to obtain OIDC tokens that invoke the audit-worker Cloud Run service."

  depends_on = [google_project_service.required_apis]
}

resource "google_service_account" "audit_worker_runtime" {
  project      = var.project_id
  account_id   = "audit-worker-runtime"
  display_name = "Audit Worker Cloud Run Runtime"
  description  = "Runtime identity for the audit-worker Cloud Run service. Reads Firestore, uploads bucket, and secrets."

  depends_on = [google_project_service.required_apis]
}

resource "google_service_account" "web_ssr_runtime" {
  project      = var.project_id
  account_id   = "web-ssr-runtime"
  display_name = "Web SSR Cloud Run Runtime"
  description  = "Runtime identity for the web-ssr Cloud Run service (Next.js SSR). Enqueues Cloud Tasks for the audit-worker, reads Firestore + the worker URL secret."

  depends_on = [google_project_service.required_apis]
}

resource "google_service_account" "functions_runtime" {
  project      = var.project_id
  account_id   = "functions-runtime"
  display_name = "Cloud Functions Runtime"
  description  = "Runtime identity for HTTPS and Firestore-triggered Cloud Functions."

  depends_on = [google_project_service.required_apis]
}

resource "google_service_account" "deployer_ci" {
  project      = var.project_id
  account_id   = "deployer-ci"
  display_name = "GitHub Actions Deployer"
  description  = "Workload Identity Federation target for GitHub Actions deploy.yml. Pushes images, deploys Cloud Run + Functions + Hosting."

  depends_on = [google_project_service.required_apis]
}
