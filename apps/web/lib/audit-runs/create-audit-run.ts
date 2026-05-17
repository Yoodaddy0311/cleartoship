// Server-side helper to create an AuditRun + Project, then enqueue a Cloud Task.
// Called from POST /api/audit-runs and (Sprint 1+) from server actions.

import { FieldValue } from 'firebase-admin/firestore';
import {
  type AuditRun,
  type CreateAuditRunRequest,
  type CreateAuditRunResponse,
  validateDocumentSize,
} from '@cleartoship/shared-types';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { COLLECTION_PATHS } from '@/lib/firebase/collections';
import { parseGitHubUrl } from '@/lib/validation/github-url';
import { parseDeployUrl } from '@/lib/validation/deploy-url';
import { enqueueAuditTask } from '@/lib/cloud-tasks/enqueue';

// AuditRun 문서에는 prdText 외 status/메타데이터/에러메시지가 함께 들어가므로
// prdText 단독 한도는 보수적으로 200KB. UI 50KB 한도와 별개의 server-side 안전망.
const PRD_TEXT_MAX_BYTES = 200_000;

export interface CreateAuditRunOptions {
  ownerId: string;
}

/**
 * Creates a project (if new) + audit run document atomically, then enqueues
 * the worker task. Returns the created run id.
 */
export async function createAuditRun(
  request: CreateAuditRunRequest,
  options: CreateAuditRunOptions,
): Promise<CreateAuditRunResponse> {
  const parsedRepo = parseGitHubUrl(request.repoUrl);
  const parsedDeploy =
    request.deployUrl && request.deployUrl.length > 0
      ? parseDeployUrl(request.deployUrl)
      : null;

  // Server-side safety net: AuditRun doc 1MB 한도 초과 사전 차단.
  // UI에서 50KB 한도가 있어도 API 직접 호출 시 우회 가능하므로 한 번 더 검증.
  if (request.prdText) {
    const sizeCheck = validateDocumentSize(request.prdText, PRD_TEXT_MAX_BYTES);
    if (!sizeCheck.ok) {
      throw new Error(
        `prdText too large: ${sizeCheck.size} bytes (max ${sizeCheck.max} bytes).`,
      );
    }
  }

  const db = getAdminFirestore();
  const ownerId = options.ownerId;
  const projectsCol = db.collection(COLLECTION_PATHS.projects(ownerId));

  // Find existing project by repoUrl (query must happen outside the batch).
  const existing = await projectsCol
    .where('repoUrl', '==', parsedRepo.normalizedUrl)
    .limit(1)
    .get();

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  let projectId: string;
  if (!existing.empty) {
    projectId = existing.docs[0]!.id;
    batch.update(projectsCol.doc(projectId), {
      deployUrl: parsedDeploy?.url ?? null,
      updatedAt: now,
    });
  } else {
    const projectRef = projectsCol.doc();
    projectId = projectRef.id;
    batch.set(projectRef, {
      ownerId,
      name: `${parsedRepo.owner}/${parsedRepo.repo}`,
      repoUrl: parsedRepo.normalizedUrl,
      deployUrl: parsedDeploy?.url ?? null,
      repoOwner: parsedRepo.owner,
      repoName: parsedRepo.repo,
      defaultBranch: parsedRepo.branch,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Create audit run in the same batch → Project + AuditRun commit atomically.
  // If the batch fails, neither doc is written (no dangling Project).
  const runRef = db.collection(COLLECTION_PATHS.auditRuns()).doc();
  const runId = runRef.id;
  const runDoc: Omit<AuditRun, 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt' | 'id'> & {
    createdAt: FirebaseFirestore.FieldValue;
    updatedAt: FirebaseFirestore.FieldValue;
    startedAt: null;
    completedAt: null;
  } = {
    projectId,
    ownerId,
    status: 'PENDING',
    currentStep: null,
    progress: 0,
    commitHash: null,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    repoUrl: parsedRepo.normalizedUrl,
    deployUrl: parsedDeploy?.url ?? null,
    prdText: request.prdText ?? null,
    // Unknown until enqueueAuditTask resolves below. Schema requires the field
    // to be present (nullable, not optional) so the initial doc carries null.
    enqueueMode: null,
    // S6-03: AuditRun starts with no tools recorded as SKIPPED. The worker's
    // `markRunCompleted` overwrites this with the aggregated list at the end
    // of the pipeline; the initial value is just the empty-array baseline so
    // the schema parses cleanly and downstream UI never reads `undefined`.
    partialResultTools: [],
    createdAt: now,
    updatedAt: now,
  };
  batch.set(runRef, runDoc);
  await batch.commit();

  // Enqueue Cloud Task. The Firestore onCreate trigger in `functions` does this
  // in production. Calling here ensures local dev (without Functions) also kicks off.
  //
  // If enqueue fails (e.g. dev-direct worker unreachable, or Cloud Tasks
  // permission denied) the run would otherwise be stranded in PENDING forever.
  // We flip the run to FAILED with a structured errorMessage so the UI can
  // surface the failure and the daily cleanup job can reap stale docs. We
  // re-throw afterwards so the API handler returns 5xx and the client retries.
  try {
    const enqueueResult = await enqueueAuditTask({
      runId,
      projectId,
      ownerId,
      repoUrl: parsedRepo.normalizedUrl,
      deployUrl: parsedDeploy?.url ?? null,
      prdText: request.prdText ?? null,
      commitHash: null,
    });
    // Persist the dispatch route so operators (and DevPipelineBanner) can tell
    // whether this run went through real Cloud Tasks, the dev-direct worker
    // shortcut, or the unconfigured stub. Status stays PENDING — the worker
    // owns status transitions.
    await runRef.update({
      enqueueMode: enqueueResult.mode,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await runRef.update({
        status: 'FAILED',
        errorMessage: `Enqueue failed: ${message}`,
        enqueueMode: null,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (markErr) {
      // Best-effort: if even the FAILED mark write fails, log and continue —
      // the original enqueue error is still surfaced to the caller below.
      process.stderr.write(
        JSON.stringify({
          level: 'error',
          component: 'create-audit-run',
          message: 'Failed to mark AuditRun as FAILED after enqueue error',
          runId,
          markError: markErr instanceof Error ? markErr.message : String(markErr),
        }) + '\n',
      );
    }
    throw err;
  }

  return { auditRunId: runId, projectId, status: 'PENDING' };
}
