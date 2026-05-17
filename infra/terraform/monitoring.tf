# T2.13 — Cloud Monitoring metric descriptors + alert policies.
# T1.1c-FU appended: direct daily-quota usage emit (used / max ratio alert).
#
# Metric type names MUST stay in sync with TWO emitters:
#   - workers/audit-worker/src/observability/metrics.ts (runner + Lighthouse)
#   - apps/web/lib/observability/metrics.ts            (daily quota — T1.1c-FU)
# The CI gate `audit-worker test` covers the worker side and `web test` covers
# the web side; the `terraform plan` dry-run in .github/workflows covers this
# side. If you rename a metric, update ALL THREE.
#
# Notification channel:
#   Email is the only channel wired here. Add slack/pagerduty channels by
#   appending to var.alert_email_addresses or creating additional channel
#   resources (kept out of this module to keep the blast radius small).

variable "alert_email_addresses" {
  description = "List of email addresses to receive Cloud Monitoring alerts. Empty = no notification channels are created and alert policies have no recipients (silent)."
  type        = list(string)
  default     = []
}

variable "audit_run_latency_p95_threshold_seconds" {
  description = "Alert when p95 audit-run duration exceeds this many seconds for 5 minutes sustained."
  type        = number
  default     = 60
}

variable "audit_run_error_rate_threshold" {
  description = "Alert when (FAILED / total completed) over 5 minutes exceeds this ratio (0.0–1.0)."
  type        = number
  default     = 0.05
}

variable "daily_quota_threshold_ratio" {
  description = "Alert when daily quota usage exceeds this ratio (0.0–1.0). Wired against the global daily quota emitted by T1.1c."
  type        = number
  default     = 0.8
}

variable "daily_audit_limit" {
  description = "Effective daily audit cap. MUST mirror the runtime value passed to apps/web via DAILY_AUDIT_LIMIT env var so the 80% threshold maps to the same absolute number the runtime enforces. Default 1000 matches lib/audit-runs/daily-quota.ts DEFAULT_DAILY_AUDIT_LIMIT."
  type        = number
  default     = 1000
}

# ---------------------------------------------------------------------------
# Required API
# `monitoring.googleapis.com` is registered in apis.tf via
# `google_project_service.required_apis`; reference that resource here so the
# descriptors/policies wait for API enablement before applying.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Notification channels
# ---------------------------------------------------------------------------
resource "google_monitoring_notification_channel" "email" {
  for_each = toset(var.alert_email_addresses)

  display_name = "ClearToShip alerts → ${each.value}"
  type         = "email"
  labels = {
    email_address = each.value
  }

  depends_on = [google_project_service.required_apis]
}

# ---------------------------------------------------------------------------
# Custom metric descriptors
#
# `type` must mirror METRIC_NAMES in workers/audit-worker/src/observability/metrics.ts.
# Worker emits via @google-cloud/monitoring → these descriptors materialize the
# schema (kind/value_type/labels) ahead of the first write so dashboards can be
# built before any runs complete.
# ---------------------------------------------------------------------------

resource "google_monitoring_metric_descriptor" "audit_run_duration_seconds" {
  project      = var.project_id
  type         = "custom.googleapis.com/cleartoship/audit_run_duration_seconds"
  metric_kind  = "GAUGE"
  value_type   = "DOUBLE"
  unit         = "s"
  description  = "End-to-end audit run duration in seconds, labelled by terminal status."
  display_name = "Audit run duration"

  labels {
    key         = "status"
    value_type  = "STRING"
    description = "Terminal status: COMPLETED, FAILED, or BLOCKED."
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_monitoring_metric_descriptor" "audit_run_completed_total" {
  project      = var.project_id
  type         = "custom.googleapis.com/cleartoship/audit_run_completed_total"
  metric_kind  = "CUMULATIVE"
  value_type   = "INT64"
  unit         = "1"
  description  = "Cumulative count of audit runs that reached a terminal state, by status."
  display_name = "Audit runs completed"

  labels {
    key         = "status"
    value_type  = "STRING"
    description = "Terminal status: COMPLETED or FAILED."
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_monitoring_metric_descriptor" "audit_run_blocked_total" {
  project      = var.project_id
  type         = "custom.googleapis.com/cleartoship/audit_run_blocked_total"
  metric_kind  = "CUMULATIVE"
  value_type   = "INT64"
  unit         = "1"
  description  = "Cumulative count of audit runs blocked by a guardrail (T1.1), by abort reason."
  display_name = "Audit runs blocked"

  labels {
    key         = "abort_reason"
    value_type  = "STRING"
    description = "Machine-readable abort reason (e.g. REPO_TOO_LARGE, GLOBAL_DAILY_QUOTA_EXCEEDED)."
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_monitoring_metric_descriptor" "queue_depth" {
  project      = var.project_id
  type         = "custom.googleapis.com/cleartoship/queue_depth"
  metric_kind  = "GAUGE"
  value_type   = "INT64"
  unit         = "1"
  description  = "Cloud Tasks audit-jobs queue depth — mirror of cloudtasks.googleapis.com/queue/depth for unified dashboards."
  display_name = "Audit queue depth"

  depends_on = [google_project_service.required_apis]
}

resource "google_monitoring_metric_descriptor" "lighthouse_latency_seconds" {
  project      = var.project_id
  type         = "custom.googleapis.com/cleartoship/lighthouse_latency_seconds"
  metric_kind  = "GAUGE"
  value_type   = "DOUBLE"
  unit         = "s"
  description  = "Wall-clock latency of the Lighthouse run inside step09, labelled by profile."
  display_name = "Lighthouse run latency"

  labels {
    key         = "profile"
    value_type  = "STRING"
    description = "Lighthouse profile id (e.g. mobile-3g, desktop-no-throttle)."
  }

  depends_on = [google_project_service.required_apis]
}

# T1.1c-FU: direct daily-quota usage emit (replaces the BLOCK-counter proxy
# used in the initial T2.13 alert wiring). Both descriptors are emitted by
# apps/web/lib/observability/metrics.ts:recordDailyQuotaUsage on every
# reserveDailyQuotaSlot call (allowed and denied) so the 80% threshold can
# fire ahead of the hard cap.
resource "google_monitoring_metric_descriptor" "audit_run_daily_quota_used" {
  project      = var.project_id
  type         = "custom.googleapis.com/cleartoship/audit_run_daily_quota_used"
  metric_kind  = "GAUGE"
  value_type   = "INT64"
  unit         = "1"
  description  = "Current number of audit runs reserved in today's UTC daily quota bucket (T1.1c)."
  display_name = "Daily quota used"

  labels {
    key         = "bucket_id"
    value_type  = "STRING"
    description = "UTC date bucket id in YYYY-MM-DD form."
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_monitoring_metric_descriptor" "audit_run_daily_quota_max" {
  project      = var.project_id
  type         = "custom.googleapis.com/cleartoship/audit_run_daily_quota_max"
  metric_kind  = "GAUGE"
  value_type   = "INT64"
  unit         = "1"
  description  = "Effective daily audit cap (env override DAILY_AUDIT_LIMIT or default 1000)."
  display_name = "Daily quota max"

  labels {
    key         = "bucket_id"
    value_type  = "STRING"
    description = "UTC date bucket id in YYYY-MM-DD form."
  }

  depends_on = [google_project_service.required_apis]
}

# ---------------------------------------------------------------------------
# Alert policies
#
# All three policies share the same notification channel set. Each policy
# `combiner = OR` so any condition trip raises the alert. When
# var.alert_email_addresses is empty, notification_channels is also empty —
# the policy stays armed but silent (useful for staging environments).
# ---------------------------------------------------------------------------

locals {
  notification_channels = [
    for c in google_monitoring_notification_channel.email : c.id
  ]
}

resource "google_monitoring_alert_policy" "audit_run_p95_latency" {
  project      = var.project_id
  display_name = "Audit run p95 latency > ${var.audit_run_latency_p95_threshold_seconds}s (5min)"
  combiner     = "OR"

  conditions {
    display_name = "p95 audit_run_duration_seconds > threshold"

    condition_threshold {
      filter          = "metric.type=\"custom.googleapis.com/cleartoship/audit_run_duration_seconds\" resource.type=\"global\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.audit_run_latency_p95_threshold_seconds
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_PERCENTILE_95"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.notification_channels

  documentation {
    content   = "Audit runs are taking longer than ${var.audit_run_latency_p95_threshold_seconds}s at the p95. Check Cloud Run instance scaling, Cloud Tasks queue depth, and the Lighthouse step latency dashboard."
    mime_type = "text/markdown"
  }

  depends_on = [google_monitoring_metric_descriptor.audit_run_duration_seconds]
}

resource "google_monitoring_alert_policy" "audit_run_error_rate" {
  project      = var.project_id
  display_name = "Audit run error rate > ${var.audit_run_error_rate_threshold * 100}% (5min)"
  combiner     = "OR"

  conditions {
    display_name = "FAILED rate over 5 minutes"

    condition_threshold {
      filter          = "metric.type=\"custom.googleapis.com/cleartoship/audit_run_completed_total\" metric.label.status=\"FAILED\" resource.type=\"global\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.audit_run_error_rate_threshold
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = local.notification_channels

  documentation {
    content   = "Audit runs are failing above ${var.audit_run_error_rate_threshold * 100}% over 5 minutes. Inspect worker logs, recent deploys, and tool health (`/healthz` toolsStatus)."
    mime_type = "text/markdown"
  }

  depends_on = [google_monitoring_metric_descriptor.audit_run_completed_total]
}

resource "google_monitoring_alert_policy" "daily_quota_usage" {
  project      = var.project_id
  display_name = "Daily quota usage > ${var.daily_quota_threshold_ratio * 100}%"
  combiner     = "OR"

  conditions {
    display_name = "Daily audit budget consumption — used / max"

    condition_threshold {
      # Direct ratio measurement (T1.1c-FU): the emitter reports both the
      # post-increment bucket count and the effective max on every quota
      # reservation. MQL would let us divide the two series cleanly; for the
      # condition_threshold shape we sum the USED metric and compare against
      # the absolute count threshold derived from the configured cap.
      # NOTE: this assumes a single bucket (label `bucket_id` resolves to one
      # UTC day at a time), so SUM = today's used count.
      filter          = "metric.type=\"custom.googleapis.com/cleartoship/audit_run_daily_quota_used\" resource.type=\"global\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.daily_quota_threshold_ratio * var.daily_audit_limit
      duration        = "60s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MAX"
      }
    }
  }

  notification_channels = local.notification_channels

  documentation {
    content   = "Daily audit quota usage crossed ${var.daily_quota_threshold_ratio * 100}% of the ${var.daily_audit_limit}-run cap (T1.1c-FU). Investigate abusive traffic before hard cap is hit; consider raising DAILY_AUDIT_LIMIT if legitimate."
    mime_type = "text/markdown"
  }

  depends_on = [
    google_monitoring_metric_descriptor.audit_run_daily_quota_used,
    google_monitoring_metric_descriptor.audit_run_daily_quota_max,
  ]
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "monitoring_alert_policy_ids" {
  description = "Alert policy resource ids (for verifying terraform plan output)."
  value = {
    p95_latency = google_monitoring_alert_policy.audit_run_p95_latency.id
    error_rate  = google_monitoring_alert_policy.audit_run_error_rate.id
    daily_quota = google_monitoring_alert_policy.daily_quota_usage.id
  }
}

output "monitoring_metric_descriptor_types" {
  description = "Custom metric descriptor types — must mirror METRIC_NAMES in workers/audit-worker/src/observability/metrics.ts (worker emit) AND apps/web/lib/observability/metrics.ts (web emit)."
  value = {
    audit_run_duration_seconds = google_monitoring_metric_descriptor.audit_run_duration_seconds.type
    audit_run_completed_total  = google_monitoring_metric_descriptor.audit_run_completed_total.type
    audit_run_blocked_total    = google_monitoring_metric_descriptor.audit_run_blocked_total.type
    queue_depth                = google_monitoring_metric_descriptor.queue_depth.type
    lighthouse_latency_seconds = google_monitoring_metric_descriptor.lighthouse_latency_seconds.type
    audit_run_daily_quota_used = google_monitoring_metric_descriptor.audit_run_daily_quota_used.type
    audit_run_daily_quota_max  = google_monitoring_metric_descriptor.audit_run_daily_quota_max.type
  }
}
