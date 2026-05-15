resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  concurrency_mode            = "OPTIMISTIC"
  app_engine_integration_mode = "DISABLED"

  depends_on = [google_project_service.required_apis]

  # Firestore databases cannot be recreated easily; protect from accidental destroy.
  lifecycle {
    prevent_destroy = true
  }
}
