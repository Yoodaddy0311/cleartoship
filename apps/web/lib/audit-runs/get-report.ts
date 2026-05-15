import { getAdminFirestore } from '@/lib/firebase/admin';
import { COLLECTION_PATHS, auditReportConverter } from '@/lib/firebase/collections';
import type { AuditReport } from '@cleartoship/shared-types';
import { checkRunOwnership } from './auth';

export async function getReport(
  runId: string,
  ownerId: string,
): Promise<AuditReport | null> {
  const ownership = await checkRunOwnership(runId, ownerId);
  if (ownership !== 'OK') return null;
  const db = getAdminFirestore();
  const snap = await db
    .doc(COLLECTION_PATHS.reportDoc(runId))
    .withConverter(auditReportConverter)
    .get();
  if (!snap.exists) return null;
  return snap.data() ?? null;
}
