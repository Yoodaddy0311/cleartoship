resource "google_artifact_registry_repository" "cleartoship_images" {
  provider = google-beta

  location      = var.region
  repository_id = "cleartoship-images"
  format        = "DOCKER"
  description   = "Container images for ClearToShip (audit-worker etc.)."

  cleanup_policies {
    id     = "keep-tagged-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-untagged-old"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "1209600s" # 14 days
    }
  }

  depends_on = [google_project_service.required_apis]
}
