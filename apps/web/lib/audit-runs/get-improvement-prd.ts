import { getAdminFirestore } from '@/lib/firebase/admin';
import { COLLECTION_PATHS, improvementPrdConverter } from '@/lib/firebase/collections';
import type { ImprovementPRD } from '@cleartoship/shared-types';
import { checkRunOwnership } from './auth';

export async function getImprovementPrd(
  runId: string,
  ownerId: string,
): Promise<ImprovementPRD | null> {
  const ownership = await checkRunOwnership(runId, ownerId);
  if (ownership !== 'OK') return null;
  const db = getAdminFirestore();
  const snap = await db
    .doc(COLLECTION_PATHS.improvementPrdDoc(runId))
    .withConverter(improvementPrdConverter)
    .get();
  if (!snap.exists) return null;
  return snap.data() ?? null;
}
