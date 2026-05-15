// Resolves the calling user's UID from the Authorization: Bearer <idToken> header,
// or falls back to anonymous UID via signInAnonymously flow. Sprint 0 keeps this
// permissive — Sprint 1 will require a real ID token for all routes.

import type { NextRequest } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin';
import { COLLECTION_PATHS } from '@/lib/firebase/collections';

export interface ResolvedCaller {
  uid: string;
  isAnonymous: boolean;
}

export async function resolveCaller(req: NextRequest): Promise<ResolvedCaller | null> {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const idToken = header.slice('Bearer '.length).trim();
  if (!idToken) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      isAnonymous: decoded.firebase?.sign_in_provider === 'anonymous',
    };
  } catch {
    return null;
  }
}

/**
 * Lightweight ownership check that avoids fetching + zod-parsing the full
 * AuditRun doc. Uses `select('ownerId')` to project only the denormalized
 * ownerId field. Returns:
 *   - 'OK' if the run exists and belongs to ownerId
 *   - 'NOT_FOUND' if the run doesn't exist
 *   - 'FORBIDDEN' if the run exists but ownerId mismatches
 *
 * Mirrors firestore.rules `isRunOwner()` semantics on the server.
 */
export type RunOwnershipResult = 'OK' | 'NOT_FOUND' | 'FORBIDDEN';

export async function checkRunOwnership(
  runId: string,
  ownerId: string,
): Promise<RunOwnershipResult> {
  const db = getAdminFirestore();
  // Use a collection query with __name__ filter so that `.select()` is available
  // (DocumentReference itself does not expose `.select()`). This preserves the
  // intent of projecting only `ownerId` without materializing the full doc.
  const query = db
    .collection(COLLECTION_PATHS.auditRuns())
    .where('__name__', '==', runId)
    .select('ownerId')
    .limit(1);
  const result = await query.get();
  const snap = result.docs[0];
  if (!snap) return 'NOT_FOUND';
  const docOwnerId = snap.get('ownerId');
  if (docOwnerId !== ownerId) return 'FORBIDDEN';
  return 'OK';
}
