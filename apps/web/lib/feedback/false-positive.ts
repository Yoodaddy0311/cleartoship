// False-positive feedback writes — client SDK only.
//
// T2.6 (02-E): users mark a finding as false positive from the report UI.
// We persist that signal to `auditRuns/{runId}/feedback/{findingId}` so a
// future weight-decay task can quantify R4 (4 known false-positive checks)
// without re-running the audit. This module owns the Firestore I/O and is
// deliberately small + dependency-injectable so component tests can stub the
// Firestore singleton without spinning up the emulator.

'use client';

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { getClientFirestore } from '@/lib/firebase/client';

export interface FalsePositiveFeedback {
  /** True when the user has actively flagged the finding as a false positive. */
  isFalsePositive: boolean;
  /** When the latest write happened — useful for diagnostics; UI does not show it. */
  markedAt?: string | null;
}

/**
 * Tiny abstraction over `getClientFirestore()` so tests can substitute a fake
 * Firestore instance. The default getter lazy-loads the singleton so
 * unauthenticated SSR paths never accidentally instantiate the SDK.
 */
export type FirestoreGetter = () => Firestore;

const defaultGetDb: FirestoreGetter = () => getClientFirestore();

function feedbackDocPath(runId: string, findingId: string): string {
  return `auditRuns/${runId}/feedback/${findingId}`;
}

/**
 * Reads the persisted false-positive flag for a single finding.
 * Returns `{ isFalsePositive: false }` when the document is missing — the
 * absence of a feedback record is semantically "not marked".
 */
export async function readFalsePositive(
  runId: string,
  findingId: string,
  getDb: FirestoreGetter = defaultGetDb,
): Promise<FalsePositiveFeedback> {
  const db = getDb();
  const ref = doc(db, feedbackDocPath(runId, findingId));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { isFalsePositive: false, markedAt: null };
  }
  const data = snap.data() as { isFalsePositive?: unknown; markedAt?: unknown };
  return {
    isFalsePositive: data.isFalsePositive === true,
    markedAt: typeof data.markedAt === 'string' ? data.markedAt : null,
  };
}

/**
 * Marks a finding as a false positive. Writes are idempotent — a second call
 * just refreshes the `markedAt` server timestamp. `markedBy` records the
 * anonymous uid so the future weight-decay job can dedupe per user.
 */
export async function markFalsePositive(
  runId: string,
  findingId: string,
  markedBy: string,
  getDb: FirestoreGetter = defaultGetDb,
): Promise<void> {
  const db = getDb();
  const ref = doc(db, feedbackDocPath(runId, findingId));
  await setDoc(
    ref,
    {
      isFalsePositive: true,
      markedBy,
      markedAt: serverTimestamp(),
      findingId,
      runId,
    },
    { merge: true },
  );
}

/**
 * Clears a previously-set false-positive flag. Deletes the doc rather than
 * writing `isFalsePositive: false` so the weight-decay job's count truly
 * reflects active flags (no stale "I changed my mind" rows).
 */
export async function unmarkFalsePositive(
  runId: string,
  findingId: string,
  getDb: FirestoreGetter = defaultGetDb,
): Promise<void> {
  const db = getDb();
  const ref = doc(db, feedbackDocPath(runId, findingId));
  await deleteDoc(ref);
}
