import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  METRIC_NAMES,
  recordAuditDuration,
  incrementAuditCompleted,
  incrementAuditBlocked,
  recordLighthouseLatency,
  isMetricsEnabled,
  __resetClientForTests,
} from './metrics.js';

describe('observability/metrics', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ENABLE_METRICS;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.PROJECT_ID;
    __resetClientForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    __resetClientForTests();
  });

  describe('METRIC_NAMES contract — must mirror infra/terraform/monitoring.tf', () => {
    it('keeps the cleartoship custom prefix on every metric', () => {
      for (const name of Object.values(METRIC_NAMES)) {
        expect(name).toMatch(/^custom\.googleapis\.com\/cleartoship\//);
      }
    });

    it('exposes the five metrics required by T2.13', () => {
      expect(METRIC_NAMES.AUDIT_RUN_DURATION).toBe(
        'custom.googleapis.com/cleartoship/audit_run_duration_seconds',
      );
      expect(METRIC_NAMES.AUDIT_RUN_COMPLETED).toBe(
        'custom.googleapis.com/cleartoship/audit_run_completed_total',
      );
      expect(METRIC_NAMES.AUDIT_RUN_BLOCKED).toBe(
        'custom.googleapis.com/cleartoship/audit_run_blocked_total',
      );
      expect(METRIC_NAMES.QUEUE_DEPTH).toBe(
        'custom.googleapis.com/cleartoship/queue_depth',
      );
      expect(METRIC_NAMES.LIGHTHOUSE_LATENCY).toBe(
        'custom.googleapis.com/cleartoship/lighthouse_latency_seconds',
      );
    });
  });

  describe('isMetricsEnabled', () => {
    it('returns false when ENABLE_METRICS is unset', () => {
      expect(isMetricsEnabled()).toBe(false);
    });

    it('returns true when ENABLE_METRICS=1', () => {
      process.env.ENABLE_METRICS = '1';
      expect(isMetricsEnabled()).toBe(true);
    });

    it('returns false for any value other than the literal "1"', () => {
      process.env.ENABLE_METRICS = 'true';
      expect(isMetricsEnabled()).toBe(false);
    });
  });

  describe('emit calls — must be no-op when disabled', () => {
    // Without ENABLE_METRICS=1 the module must never load
    // @google-cloud/monitoring and must never throw. We assert by calling each
    // recorder synchronously and verifying neither a throw nor a rejected
    // promise leaks out (void emit() is fire-and-forget).
    it('recordAuditDuration is a synchronous no-op when disabled', () => {
      expect(() => recordAuditDuration(42, 'COMPLETED')).not.toThrow();
    });
    it('incrementAuditCompleted is a synchronous no-op when disabled', () => {
      expect(() => incrementAuditCompleted('COMPLETED')).not.toThrow();
    });
    it('incrementAuditBlocked is a synchronous no-op when disabled', () => {
      expect(() => incrementAuditBlocked('REPO_TOO_LARGE')).not.toThrow();
    });
    it('recordLighthouseLatency is a synchronous no-op when disabled', () => {
      expect(() => recordLighthouseLatency(12.5, 'mobile-3g')).not.toThrow();
    });

    it('stays no-op when enabled but projectId is missing (laptop dev)', () => {
      process.env.ENABLE_METRICS = '1';
      // GOOGLE_CLOUD_PROJECT etc. all unset → emit must short-circuit.
      expect(() => recordAuditDuration(1, 'COMPLETED')).not.toThrow();
    });
  });
});
