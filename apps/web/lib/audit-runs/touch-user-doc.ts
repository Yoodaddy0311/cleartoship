// Sprint 1 Item #15 (option a): denormalize isAnonymous flag onto users/{uid}
// so the dailyCleanup scheduler can identify anonymous users without paginating
// auth.users via Admin SDK. Updates lastSeenAt on every audit-run create so
// 30-day idle windows are measured from real user activity, not signup time.
//
// Idempotent — uses set({ merge: true }) so repeated calls just refresh
// lastSeenAt without overwriting fields populated by the auth provider linkage
// upgrade (future Sprint). createdAt is set unconditionally; Firestore merge
// preserves the first value on subsequent calls (server timestamp resolves
// once and stays stable on doc creation).

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { COLLECTION_PATHS } from '@/lib/firebase/collections';

export interface TouchUserDocInput {
  uid: string;
  isAnonymous: boolean;
}

export async function touchUserDoc(input: TouchUserDocInput): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.doc(COLLECTION_PATHS.user(input.uid));
  const snap = await ref.get();
  const now = FieldValue.serverTimestamp();
  if (snap.exists) {
    await ref.set(
      {
        isAnonymous: input.isAnonymous,
        lastSeenAt: now,
      },
      { merge: true },
    );
    return;
  }
  await ref.set({
    uid: input.uid,
    isAnonymous: input.isAnonymous,
    createdAt: now,
    lastSeenAt: now,
  });
}
