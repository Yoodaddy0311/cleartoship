locals {
  required_apis = [
    # Core runtime + workspace plumbing.
    "firestore.googleapis.com",
    "cloudfunctions.googleapis.com",
    "run.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "eventarc.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "monitoring.googleapis.com",

    # Firebase deploy surface — required so `firebase deploy --only
    # functions,firestore:rules,firestore:indexes,storage:rules` and
    # `firebase deploy --only hosting` in deploy.yml succeed without
    # the deployer SA needing serviceUsage.serviceUsageAdmin to enable
    # them on demand. cloudresourcemanager + serviceusage are pulled in
    # so the firebase CLI can read project metadata.
    "firebase.googleapis.com",
    "firebasehosting.googleapis.com",
    "firebaserules.googleapis.com",
    "firebasestorage.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
  ]
}

resource "google_project_service" "required_apis" {
  for_each = toset(local.required_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
