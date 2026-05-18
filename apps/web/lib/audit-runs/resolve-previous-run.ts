// T2.5 — resolve the immediate-prior COMPLETED AuditRun id for the same
// (ownerId, repoUrl) so the new run can carry `previousRunId` and the UI
// can render a re-audit diff against it.
//
// Failure mode: if the Firestore query throws (missing composite index, IAM,
// transient outage) we MUST NOT block the audit creation — re-audit diff is
// a "nice to have" surfaced post-completion. Return undefined and log a
// structured warning so ops can spot the index drift without paging the
// happy path.

import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTION_PATHS } from '@/lib/firebase/collections';

export interface ResolvePreviousRunInput {
  db: Firestore;
  ownerId: string;
  repoUrl: string;
}

export async function resolvePreviousRunId(
  input: ResolvePreviousRunInput,
): Promise<string | undefined> {
  try {
    const snap = await input.db
      .collection(COLLECTION_PATHS.auditRuns())
      .where('ownerId', '==', input.ownerId)
      .where('repoUrl', '==', input.repoUrl)
      .where('status', '==', 'COMPLETED')
      .orderBy('completedAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return undefined;
    const doc = snap.docs[0];
    return doc?.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      JSON.stringify({
        level: 'warn',
        component: 'audit-runs.resolve-previous-run',
        message: 'Previous-run lookup failed — proceeding without baseline',
        ownerId: input.ownerId,
        repoUrl: input.repoUrl,
        error: message,
      }) + '\n',
    );
    return undefined;
  }
}
