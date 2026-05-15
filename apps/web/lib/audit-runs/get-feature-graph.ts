import { getAdminFirestore } from '@/lib/firebase/admin';
import { COLLECTION_PATHS, featureGraphConverter } from '@/lib/firebase/collections';
import type { FeatureGraph } from '@cleartoship/shared-types';
import { checkRunOwnership } from './auth';

export async function getFeatureGraph(
  runId: string,
  ownerId: string,
): Promise<FeatureGraph | null> {
  const ownership = await checkRunOwnership(runId, ownerId);
  if (ownership !== 'OK') return null;
  const db = getAdminFirestore();
  const snap = await db
    .doc(COLLECTION_PATHS.featureGraphDoc(runId))
    .withConverter(featureGraphConverter)
    .get();
  if (!snap.exists) return null;
  return snap.data() ?? null;
}
