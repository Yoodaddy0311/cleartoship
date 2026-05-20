import { getAdminFirestore } from '@/lib/firebase/admin';
import { COLLECTION_PATHS, auditRunConverter } from '@/lib/firebase/collections';
import type { AuditRun } from '@cleartoship/shared-types';

export interface ListAuditRunsOptions {
  /** Hard cap on how many docs to return. Defaults to 50. */
  limit?: number;
}

/**
 * Fetches the most recent AuditRuns owned by `ownerId`, newest first.
 *
 * Sprint-0 list view: no cursor pagination yet — we cap at `limit` (default 50)
 * because the per-user daily quota is 10 (`DAILY_AUDIT_LIMIT` default), so a
 * single user rarely accumulates more than a few dozen runs in active use.
 * Firestore charges one document read per returned row regardless of the
 * `where` ordering, so capping is purely a UX choice.
 *
 * Returns parsed `AuditRun` objects (Zod-validated via the converter). Any
 * row that fails parsing is dropped silently and not exposed to the caller.
 */
export async function listAuditRuns(
  ownerId: string,
  options: ListAuditRunsOptions = {},
): Promise<AuditRun[]> {
  const limit = options.limit ?? 50;
  const db = getAdminFirestore();
  const snap = await db
    .collection(COLLECTION_PATHS.auditRuns())
    .where('ownerId', '==', ownerId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .withConverter(auditRunConverter)
    .get();
  return snap.docs
    .map((doc) => doc.data())
    .filter((data): data is AuditRun => data != null);
}
