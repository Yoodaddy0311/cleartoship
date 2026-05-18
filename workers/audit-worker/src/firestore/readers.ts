// Typed Firestore readers — used by the worker pipeline to fetch the
// source-of-truth audit run document. The worker MUST NOT trust ownerId or
// any other claim coming from the Cloud Tasks payload: anyone who can write
// to the queue could impersonate another user. Re-reading from Firestore at
// pipeline start anchors authorization to the document that the create-run
// endpoint wrote under Firestore rules.
//
// See packages/shared-types AuditRun for the field shape.

import { getFirestoreClient } from './client.js';

export interface AuditRunRecord {
  id: string;
  ownerId: string;
  projectId: string;
  repoUrl: string;
  deployUrl: string | null;
  prdText: string | null;
  profileId: string | null;
}

export async function getAuditRunOrThrow(runId: string): Promise<AuditRunRecord> {
  const db = getFirestoreClient();
  const snap = await db.doc(`auditRuns/${runId}`).get();
  if (!snap.exists) {
    throw new Error(`AuditRun not found: ${runId}`);
  }
  const data = snap.data() ?? {};
  const ownerId = typeof data.ownerId === 'string' ? data.ownerId : '';
  const projectId = typeof data.projectId === 'string' ? data.projectId : '';
  const repoUrl = typeof data.repoUrl === 'string' ? data.repoUrl : '';
  if (!ownerId || !projectId || !repoUrl) {
    throw new Error(`AuditRun ${runId} missing required fields (ownerId/projectId/repoUrl)`);
  }
  return {
    id: snap.id,
    ownerId,
    projectId,
    repoUrl,
    deployUrl: typeof data.deployUrl === 'string' ? data.deployUrl : null,
    prdText: typeof data.prdText === 'string' ? data.prdText : null,
    profileId: typeof data.profileId === 'string' ? data.profileId : null,
  };
}
