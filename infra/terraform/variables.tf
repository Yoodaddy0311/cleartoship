variable "project_id" {
  description = "GCP project ID (e.g., cleartoship-prod)."
  type        = string
}

variable "region" {
  description = "Primary GCP region for Cloud Run, Tasks, Artifact Registry, and Firestore."
  type        = string
  default     = "asia-northeast3"
}

variable "billing_account" {
  description = "Billing account ID to associate with the project (XXXXXX-XXXXXX-XXXXXX)."
  type        = string
  default     = ""
}

variable "worker_image" {
  description = "Fully-qualified Artifact Registry URI for the audit-worker container (region-docker.pkg.dev/<project>/cleartoship-images/audit-worker:<tag>). Optional; used only as an output reference."
  type        = string
  default     = ""
}

variable "uploads_bucket_name" {
  description = "Cloud Storage bucket name that the audit-worker reads PDF uploads from. Defaults to <project_id>.appspot.com (Firebase default bucket)."
  type        = string
  default     = ""
}

variable "github_owner" {
  description = "GitHub org/user that owns the repo. Used for Workload Identity Federation provider attribute condition."
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repository name (without owner). Used for WIF attribute condition."
  type        = string
  default     = "ClearToShip"
}
