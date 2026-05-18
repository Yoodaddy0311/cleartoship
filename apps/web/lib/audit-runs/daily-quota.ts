// T1.1c cost guardrail: global daily audit quota.
//
// One doc per UTC day at `system/quota/daily/{YYYY-MM-DD}` holds the running
// counter. Each createAuditRun call atomically increments via runTransaction.
// If the counter has already reached the cap, we refuse (return allowed=false)
// and the caller rejects the request before any AuditRun doc gets written.
//
// Reset is implicit: the bucket id rolls over at UTC midnight, so day N+1
// transparently starts a fresh doc when the first request lands. There is no
// scheduled job needed — old bucket docs are kept for analytics/audit trail.

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { recordDailyQuotaUsage } from '@/lib/observability/metrics';

const DEFAULT_DAILY_AUDIT_LIMIT = 1000;

export interface DailyQuotaReservation {
  /** YYYY-MM-DD bucket the reservation belonged to. */
  bucketId: string;
  /** Counter value *after* the increment (or the read-only value if denied). */
  count: number;
  /** Effective cap (env override or default). */
  max: number;
  /** True iff the slot was successfully reserved. */
  allowed: boolean;
}

function readMaxAllowed(): number {
  const raw = process.env.DAILY_AUDIT_LIMIT;
  if (!raw) return DEFAULT_DAILY_AUDIT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_AUDIT_LIMIT;
}

function todayBucketId(now: Date = new Date()): string {
  // UTC date — toISOString returns "YYYY-MM-DDTHH:mm:ss.sssZ"; slice the date.
  return now.toISOString().slice(0, 10);
}

/**
 * Atomically reserve a slot in today's audit quota bucket. Returns the
 * post-increment count or the read-only count when denied. Caller MUST check
 * `allowed` before proceeding with the audit creation.
 */
export async function reserveDailyQuotaSlot(): Promise<DailyQuotaReservation> {
  const max = readMaxAllowed();
  const bucketId = todayBucketId();
  const db = getAdminFirestore();
  const ref = db.doc(`system/quota/daily/${bucketId}`);

  const reservation = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      // First request of the UTC day → create the bucket with count=1.
      tx.set(ref, {
        count: 1,
        max,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { bucketId, count: 1, max, allowed: true };
    }
    const data = snap.data() ?? {};
    const current = typeof data.count === 'number' ? data.count : 0;
    if (current >= max) {
      return { bucketId, count: current, max, allowed: false };
    }
    tx.update(ref, {
      count: FieldValue.increment(1),
      max,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { bucketId, count: current + 1, max, allowed: true };
  });

  // Fire-and-forget metric emit. Runs on both allowed and denied paths so the
  // 80% threshold alarm (monitoring.tf:daily_quota_usage) can fire ahead of
  // hard cap, not only after the first GLOBAL_DAILY_QUOTA_EXCEEDED block.
  recordDailyQuotaUsage(reservation.count, reservation.max, reservation.bucketId);
  return reservation;
}
