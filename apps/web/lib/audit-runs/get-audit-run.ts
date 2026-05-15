import { getAdminFirestore } from '@/lib/firebase/admin';
import { COLLECTION_PATHS, auditRunConverter } from '@/lib/firebase/collections';
import type { AuditRun } from '@cleartoship/shared-types';

export async function getAuditRun(runId: string, ownerId: string): Promise<AuditRun | null> {
  const db = getAdminFirestore();
  const snap = await db
    .doc(COLLECTION_PATHS.auditRun(runId))
    .withConverter(auditRunConverter)
    .get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data || data.ownerId !== ownerId) return null;
  return data;
}
