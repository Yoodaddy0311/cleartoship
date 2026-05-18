# Cloud Tasks queue for audit pipeline jobs.
#
# Capacity tuning (W3.INF.2, Sprint 4 Wave 3):
#   The audit-worker Cloud Run service runs with concurrency=1 (one audit per
#   container — see .github/workflows/deploy.yml `gcloud run deploy` flags).
#   That means the queue's max_concurrent_dispatches is effectively a cap on
#   how many worker instances can be live at once.
#
#   Sizing:
#     - Cloud Run max-instances=10 today (deploy.yml). We size the queue at
#       30 so a future bump to max-instances=30 needs ONLY the deploy.yml
#       change, not a terraform apply. Going above max-instances cannot
#       actually overload anything — Cloud Run rejects extra dispatches with
#       503 and Cloud Tasks retries with backoff.
#     - max_dispatches_per_second=10 keeps the enqueue rate slightly below
#       the burst capacity so we don't pre-emptively starve other clients
#       sharing the project quota.
#
#   Retry policy:
#     - max_attempts=5 (was 3): transient Cloud Run 503s during instance
#       scale-up and short Lighthouse/git hiccups should not surface as a
#       FAILED audit run. With min/max backoff of 10s→300s and
#       max_doublings=4 the 5th attempt fires at ~10 + 20 + 40 + 80 + 160 =
#       310s after the first dispatch, which is well within the 600s
#       worker timeout × multiple attempts budget.
#
# Source of truth: this file. The runtime guardrails in audit-worker
# (`runner.ts` GUARDRAILS) only enforce per-run limits; the queue-level
# concurrency/retry policy lives here. If you change concurrency in
# deploy.yml, revisit max_concurrent_dispatches.
resource "google_cloud_tasks_queue" "audit_jobs" {
  name     = "audit-jobs"
  location = var.region

  rate_limits {
    # W3.INF.2: bumped from 5/s → 10/s to absorb burst traffic from the
    # dashboard "run audit" button without queueing latency.
    max_dispatches_per_second = 10

    # W3.INF.2: bumped from 10 → 30. Caps the count of in-flight worker
    # invocations; with worker concurrency=1 this equals the number of
    # simultaneously-running audits.
    max_concurrent_dispatches = 30
  }

  retry_config {
    # W3.INF.2: bumped from 3 → 5. Transient 503s during Cloud Run cold
    # scale-up should not produce a user-visible FAILED audit run.
    max_attempts  = 5
    min_backoff   = "10s"
    max_backoff   = "300s"
    max_doublings = 4
  }

  depends_on = [google_project_service.required_apis]
}
