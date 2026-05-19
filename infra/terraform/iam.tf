locals {
  uploads_bucket = var.uploads_bucket_name != "" ? var.uploads_bucket_name : "${var.project_id}.appspot.com"
}

# audit-worker-runtime: Firestore + Storage (uploads bucket only) + Secrets + Logging + Monitoring
resource "google_project_iam_member" "worker_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.audit_worker_runtime.email}"
}

resource "google_storage_bucket_iam_member" "worker_uploads" {
  bucket = local.uploads_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.audit_worker_runtime.email}"
}

resource "google_project_iam_member" "worker_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.audit_worker_runtime.email}"
}

resource "google_project_iam_member" "worker_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.audit_worker_runtime.email}"
}

resource "google_project_iam_member" "worker_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.audit_worker_runtime.email}"
}

# web-ssr-runtime: Firestore + Cloud Tasks enqueuer + Token Creator on
# cloud-run-invoker (so the SSR server can mint OIDC tokens when creating
# Cloud Tasks targeted at the authenticated audit-worker). Storage read on
# uploads bucket is required for signed-URL flows in the web app.
resource "google_project_iam_member" "web_ssr_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.web_ssr_runtime.email}"
}

resource "google_project_iam_member" "web_ssr_tasks_enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.web_ssr_runtime.email}"
}

resource "google_service_account_iam_member" "web_ssr_can_impersonate_invoker" {
  service_account_id = google_service_account.cloud_run_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.web_ssr_runtime.email}"
}

resource "google_storage_bucket_iam_member" "web_ssr_uploads" {
  bucket = local.uploads_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.web_ssr_runtime.email}"
}

resource "google_project_iam_member" "web_ssr_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.web_ssr_runtime.email}"
}

resource "google_project_iam_member" "web_ssr_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.web_ssr_runtime.email}"
}

# cloud-run-invoker: allowed to invoke the audit-worker service.
# We grant project-level roles/run.invoker scoped via Cloud Run service-level binding once the service exists.
# For initial bootstrap (before the service is deployed), keep project-level invoker on Cloud Run.
resource "google_project_iam_member" "invoker_run" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.cloud_run_invoker.email}"
}

# functions-runtime: Firestore + Cloud Tasks enqueuer + Token Creator (for OIDC against invoker SA)
resource "google_project_iam_member" "functions_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.functions_runtime.email}"
}

resource "google_project_iam_member" "functions_tasks_enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.functions_runtime.email}"
}

# Allow functions-runtime to mint OIDC tokens as cloud-run-invoker (for authenticated Cloud Run calls via Cloud Tasks).
resource "google_service_account_iam_member" "functions_can_impersonate_invoker" {
  service_account_id = google_service_account.cloud_run_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.functions_runtime.email}"
}

resource "google_project_iam_member" "functions_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.functions_runtime.email}"
}

# deployer-ci roles (used by GitHub Actions via WIF):
# - run.admin: deploy Cloud Run revisions
# - cloudfunctions.admin: deploy Functions
# - firebasehosting.admin: deploy Hosting
# - artifactregistry.writer: push images
# - iam.serviceAccountUser: act as runtime SAs during deploy
# - cloudbuild.builds.editor: trigger builds if needed
# - firebase.admin: deploy firestore.rules / storage.rules / indexes
# - resourcemanager.projectIamAdmin: grant project-level IAM bindings to
#   GCP service agents (Cloud Functions runtime, Eventarc, Pub/Sub) that
#   `firebase deploy --only functions` provisions on demand. Without this
#   the CLI errors with "We failed to modify the IAM policy for the project".
locals {
  deployer_roles = [
    "roles/run.admin",
    "roles/cloudfunctions.admin",
    "roles/firebasehosting.admin",
    "roles/artifactregistry.writer",
    "roles/iam.serviceAccountUser",
    "roles/cloudbuild.builds.editor",
    "roles/firebase.admin",
    "roles/datastore.indexAdmin",
    "roles/secretmanager.admin",
    "roles/resourcemanager.projectIamAdmin",
    # firebase deploy --only functions writes a Cloud Scheduler job for
    # every onSchedule() function (e.g., dailyCleanup). The default
    # firebase-managed job name is `firebase-schedule-<fn>-<region>` and
    # the deploy fails with 403 cloudscheduler.jobs.update unless the
    # deployer SA can manage scheduler jobs.
    "roles/cloudscheduler.admin",
  ]
}

resource "google_project_iam_member" "deployer_roles" {
  for_each = toset(local.deployer_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer_ci.email}"
}
