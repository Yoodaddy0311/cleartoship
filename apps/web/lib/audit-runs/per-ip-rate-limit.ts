// T1.1a cost guardrail: per-IP rate limit (audit-run create boundary).
//
// One doc per (IP, UTC minute) at `system/rate-limit/per-ip/{YYYY-MM-DDTHH:mm}/ips/{ipKey}`
// holds the running counter. Each createAuditRun call atomically increments
// via runTransaction; if the cap is reached for the current minute window the
// helper returns `allowed=false` and the route handler responds 429 + a
// `Retry-After` header pointing at the next minute boundary.
//
// Reset is implicit: the bucket id rolls over at the next UTC minute, so the
// next request transparently lands on a fresh doc. No scheduled job needed —
// old per-minute docs are kept briefly for audit/diagnostic value (and a daily
// cleanup job already exists for long-term hygiene).
//
// IP key normalisation: route.ts extracts the raw header value (x-forwarded-for
// first hop, falling back to cf-connecting-ip and Next.js's NextRequest.ip).
// This module sanitises the value so it is safe to use as a Firestore doc id
// (no '/', no leading '.'), and so callers can't poison the bucket with
// arbitrary header content.

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase/admin';

const DEFAULT_PER_IP_PER_MIN = 10;

export interface PerIpRateLimitReservation {
  /** Sanitised IP key actually used as the bucket doc id. */
  ipKey: string;
  /** Minute bucket id (YYYY-MM-DDTHH:mm), UTC. */
  bucketId: string;
  /** Counter value after the increment (or read-only value if denied). */
  count: number;
  /** Effective per-minute cap (env override or default). */
  max: number;
  /** True iff the slot was successfully reserved. */
  allowed: boolean;
  /** Seconds until the current minute window rolls over (>= 1). */
  retryAfterSeconds: number;
}

function readMaxAllowed(): number {
  const raw = process.env.RATE_LIMIT_PER_IP_PER_MIN;
  if (!raw) return DEFAULT_PER_IP_PER_MIN;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PER_IP_PER_MIN;
}

/**
 * Minute-resolution bucket id in UTC: "YYYY-MM-DDTHH:mm". Built from the ISO
 * string to avoid TZ-dependent assembly.
 */
function minuteBucketId(now: Date = new Date()): string {
  // "YYYY-MM-DDTHH:mm:ss.sssZ" → slice 0..16 = "YYYY-MM-DDTHH:mm".
  return now.toISOString().slice(0, 16);
}

function secondsUntilNextMinute(now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCSeconds(60, 0);
  const diffMs = next.getTime() - now.getTime();
  return Math.max(1, Math.ceil(diffMs / 1000));
}

/**
 * Sanitises a raw IP-ish value so it is safe to use as a Firestore doc id.
 * Firestore reserves '/' as a path separator and forbids leading '.' / empty
 * strings; callers may also pass `null` (unknown IP — local dev, missing
 * header), so we fall back to a sentinel that buckets all unknowns together.
 */
export function normaliseIpKey(raw: string | null | undefined): string {
  if (!raw) return 'unknown';
  // x-forwarded-for may carry multiple comma-separated entries (client, proxy1, ...).
  const first = raw.split(',')[0]!.trim();
  if (!first) return 'unknown';
  // Replace anything not in [a-z0-9.:-] with '_' so IPv6 (`:`) and IPv4 (`.`)
  // are preserved but path-separators or weird Unicode never reach Firestore.
  const cleaned = first
    .toLowerCase()
    .replace(/[^a-z0-9.:_-]/g, '_')
    .replace(/^[._]+/, '');
  return cleaned.length > 0 ? cleaned.slice(0, 100) : 'unknown';
}

/**
 * Atomically reserve a slot in the current minute's per-IP bucket. Returns
 * the post-increment count (or read-only count when denied). Caller MUST check
 * `allowed` before proceeding.
 */
export async function reserveIpSlot(
  rawIp: string | null | undefined,
): Promise<PerIpRateLimitReservation> {
  const ipKey = normaliseIpKey(rawIp);
  const max = readMaxAllowed();
  const bucketId = minuteBucketId();
  const retryAfterSeconds = secondsUntilNextMinute();
  const db = getAdminFirestore();
  const ref = db.doc(`system/rate-limit/per-ip/${bucketId}/ips/${ipKey}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        count: 1,
        max,
        ipKey,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ipKey, bucketId, count: 1, max, allowed: true, retryAfterSeconds };
    }
    const data = snap.data() ?? {};
    const current = typeof data.count === 'number' ? data.count : 0;
    if (current >= max) {
      return { ipKey, bucketId, count: current, max, allowed: false, retryAfterSeconds };
    }
    tx.update(ref, {
      count: FieldValue.increment(1),
      max,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      ipKey,
      bucketId,
      count: current + 1,
      max,
      allowed: true,
      retryAfterSeconds,
    };
  });
}
