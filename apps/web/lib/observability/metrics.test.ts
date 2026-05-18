// Unit tests for the apps/web Cloud Monitoring emitter (T1.1c-FU).
//
// Strategy: assert the contract — METRIC_NAMES alignment with monitoring.tf,
// env-driven enable/disable, and the fire-and-forget safety property (no
// throws when disabled, no throws when projectId is missing). The actual
// @google-cloud/monitoring SDK is never loaded in these tests because
// ENABLE_METRICS=1 + projectId would be required and we keep both unset.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  METRIC_NAMES,
  recordDailyQuotaUsage,
  isMetricsEnabled,
  __resetClientForTests,
} from './metrics';

describe('observability/metrics (apps/web)', () => {
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

    it('exposes both daily quota metrics required by T1.1c-FU', () => {
      expect(METRIC_NAMES.AUDIT_RUN_DAILY_QUOTA_USED).toBe(
        'custom.googleapis.com/cleartoship/audit_run_daily_quota_used',
      );
      expect(METRIC_NAMES.AUDIT_RUN_DAILY_QUOTA_MAX).toBe(
        'custom.googleapis.com/cleartoship/audit_run_daily_quota_max',
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

  describe('recordDailyQuotaUsage — fire-and-forget safety', () => {
    it('is a synchronous no-op when metrics are disabled', () => {
      // Hot path: every quota reservation calls this. Must never throw,
      // never block, never fail the audit request.
      expect(() => recordDailyQuotaUsage(42, 1000, '2026-05-17')).not.toThrow();
    });

    it('is a no-op when enabled but projectId is missing (laptop dev)', () => {
      process.env.ENABLE_METRICS = '1';
      // GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT / PROJECT_ID all unset → emit
      // must short-circuit before touching @google-cloud/monitoring.
      expect(() => recordDailyQuotaUsage(1, 1000, '2026-05-17')).not.toThrow();
    });

    it('accepts the at-cap edge case (used === max) without throwing', () => {
      expect(() => recordDailyQuotaUsage(1000, 1000, '2026-05-17')).not.toThrow();
    });

    it('accepts the over-cap race-carried value (used > max) without throwing', () => {
      // daily-quota.ts allows used > max when a stored bucket carried over
      // from a higher cap day. The emitter must not validate; that is the
      // dashboard's job.
      expect(() => recordDailyQuotaUsage(1001, 1000, '2026-05-17')).not.toThrow();
    });
  });
});
