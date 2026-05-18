# W3.INF.5 — SLO-grade alert policies for audit-worker.
#
# ──────────────────────────────────────────────────────────────────────────
# Integration model
# ──────────────────────────────────────────────────────────────────────────
# This file lives under `infra/monitoring/` (alongside dashboard.json) so
# all observability artifacts are colocated. Terraform modules are
# resolved by directory, so to APPLY this file copy or symlink it into
# the main terraform module:
#
#   # POSIX
#   ln -sf ../../monitoring/alerts.tf infra/terraform/alerts.tf
#   # Windows (admin shell)
#   mklink infra\terraform\alerts.tf ..\monitoring\alerts.tf
#
# We deliberately do NOT live in `infra/terraform/` to keep all alert +
# dashboard artifacts findable under one folder; the symlink/copy is the
# integration seam.
#
# ──────────────────────────────────────────────────────────────────────────
# Relationship to infra/terraform/monitoring.tf
# ──────────────────────────────────────────────────────────────────────────
# `monitoring.tf` already declares:
#   - var.project_id (via variables.tf)
#   - var.alert_email_addresses
#   - google_monitoring_notification_channel.email (for_each)
#   - local.notification_channels  (= [for c in ... : c.id])
#   - google_monitoring_metric_descriptor.audit_run_duration_seconds
#   - google_monitoring_metric_descriptor.audit_run_completed_total
#   - google_monitoring_alert_policy.audit_run_p95_latency  (p95 > 60s — capacity)
#   - google_monitoring_alert_policy.audit_run_error_rate   (rate > 5% — degradation)
#
# This file ADDS two STRICTER policies that fire earlier, at SLO budget:
#   - audit_run_p99_latency_strict (p99 > 5s sustained 5 min)
#       Sprint 4 SLO target for cached/no-op runs. Cold-start spikes on
#       non-prod (min-instances=0) will trip this — wire only after the
#       prod project is using min-instances=1 (see infra/README.deploy.md).
#   - audit_run_error_rate_strict (FAILED rate > 1% sustained 5 min)
#       Tightens the 5% degradation alert to a 1% page-out threshold so
#       on-call hears it before users churn.
#
# Both reuse local.notification_channels and depend on metric descriptors
# already declared in monitoring.tf. Once symlinked into the same module
# directory, these references resolve at `terraform plan` time.
#
# ──────────────────────────────────────────────────────────────────────────
# If you tune thresholds, also update `infra/monitoring/dashboard.json`
# (the latency / error-rate charts should align with alert thresholds).
# ──────────────────────────────────────────────────────────────────────────

variable "audit_run_latency_p99_strict_seconds" {
  description = "SLO-tight p99 latency alert threshold in seconds. Default 5s targets cached / no-op runs; expect cold-start spikes on min-instances=0 projects."
  type        = number
  default     = 5
}

variable "audit_run_error_rate_strict_ratio" {
  description = "SLO-tight error-rate alert threshold (0.0–1.0). Default 0.01 (1%) — tighter than the 5% degradation alert in monitoring.tf."
  type        = number
  default     = 0.01
}

resource "google_monitoring_alert_policy" "audit_run_p99_latency_strict" {
  project      = var.project_id
  display_name = "[SLO] Audit run p99 latency > ${var.audit_run_latency_p99_strict_seconds}s (5min)"
  combiner     = "OR"

  conditions {
    display_name = "p99 audit_run_duration_seconds > threshold"

    condition_threshold {
      filter          = "metric.type=\"custom.googleapis.com/cleartoship/audit_run_duration_seconds\" resource.type=\"global\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.audit_run_latency_p99_strict_seconds
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_PERCENTILE_99"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.notification_channels

  documentation {
    content   = "Audit run p99 latency crossed the SLO budget of ${var.audit_run_latency_p99_strict_seconds}s. If this fires shortly after a deploy, check Cloud Run cold-start (min-instances setting in deploy.yml / infra/scripts/03-deploy-worker.sh). If sustained, inspect step09 Lighthouse latency and step03 git clone duration."
    mime_type = "text/markdown"
  }

  depends_on = [google_monitoring_metric_descriptor.audit_run_duration_seconds]
}

resource "google_monitoring_alert_policy" "audit_run_error_rate_strict" {
  project      = var.project_id
  display_name = "[SLO] Audit run error rate > ${var.audit_run_error_rate_strict_ratio * 100}% (5min)"
  combiner     = "OR"

  conditions {
    display_name = "FAILED rate over 5 minutes (strict)"

    condition_threshold {
      filter          = "metric.type=\"custom.googleapis.com/cleartoship/audit_run_completed_total\" metric.label.status=\"FAILED\" resource.type=\"global\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.audit_run_error_rate_strict_ratio
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
    content   = "Audit runs are failing above ${var.audit_run_error_rate_strict_ratio * 100}% over 5 minutes — SLO budget exhausted. This is the page-out threshold (tighter than the 5% degradation alert). Check /healthz tool status, recent deploy commits, and audit-worker logs filtered by status=FAILED."
    mime_type = "text/markdown"
  }

  depends_on = [google_monitoring_metric_descriptor.audit_run_completed_total]
}

output "monitoring_slo_alert_policy_ids" {
  description = "Strict SLO alert policy ids (W3.INF.5). Distinct from monitoring.tf capacity/degradation policies."
  value = {
    p99_latency_strict = google_monitoring_alert_policy.audit_run_p99_latency_strict.id
    error_rate_strict  = google_monitoring_alert_policy.audit_run_error_rate_strict.id
  }
}
