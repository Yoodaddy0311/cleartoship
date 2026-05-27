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
import { reserveDailyQuotaSlot } from './daily-quota';
import { reserveIpSlot } from './per-ip-rate-limit';
import { resolvePreviousRunId } from './resolve-previous-run';

// AuditRun 문서에는 prdText 외 status/메타데이터/에러메시지가 함께 들어가므로
// prdText 단독 한도는 보수적으로 200KB. UI 50KB 한도와 별개의 server-side 안전망.
const PRD_TEXT_MAX_BYTES = 200_000;

// W2-A: UI/API 양쪽에서 강제하는 사용자 PRD 입력 한도(50KB).
// 200KB 안전망(PRD_TEXT_MAX_BYTES)은 그대로 유지 — defense in depth.
// 이 값은 PrdTextTooLargeError 의 422 응답에도 그대로 노출되므로 export.
export const PRD_TEXT_USER_MAX_BYTES = 50_000;

/**
 * Thrown when the W2-A 사용자 입력 PRD 가 50KB cap 을 초과했을 때 발생한다.
 * 200KB 안전망(`PRD_TEXT_MAX_BYTES`)보다 먼저 발사되므로 route handler 는
 * 이 에러를 catch 해 422 Unprocessable Entity + 구조화된 details(`maxBytes`,
 * `actualBytes`) 를 반환한다. UI 가 동일한 한도(50KB)를 가지지만 API 직접
 * 호출로 우회되는 케이스를 막기 위한 server-side 가드.
 */
export class PrdTextTooLargeError extends Error {
  readonly actualBytes: number;
  readonly maxBytes: number;
  constructor(actualBytes: number) {
    super(
      `prdText exceeds user cap: ${actualBytes} bytes (max ${PRD_TEXT_USER_MAX_BYTES} bytes).`,
    );
    this.name = 'PrdTextTooLargeError';
    this.actualBytes = actualBytes;
    this.maxBytes = PRD_TEXT_USER_MAX_BYTES;
  }
}

/**
 * Thrown when the T1.1c daily quota cap has been reached. The route handler
 * catches this and returns 429 Too Many Requests with a `Retry-After` header
 * pointing at the next UTC midnight rollover so the client can back off until
 * the daily bucket refills.
 */
export class DailyQuotaExceededError extends Error {
  readonly bucketId: string;
  readonly count: number;
  readonly max: number;
  constructor(args: { bucketId: string; count: number; max: number }) {
    super(
      `Daily audit quota exceeded for ${args.bucketId}: ${args.count}/${args.max}. Try again after 00:00 UTC.`,
    );
    this.name = 'DailyQuotaExceededError';
    this.bucketId = args.bucketId;
    this.count = args.count;
    this.max = args.max;
  }
}

/**
 * Thrown when the T1.1a per-IP rate limit has been exceeded for the current
 * minute window. The route handler maps this to 429 Too Many Requests with a
 * `Retry-After` header pointing at the next minute boundary so well-behaved
 * clients (and CDNs) back off until the bucket refills.
 */
export class PerIpRateLimitError extends Error {
  readonly ipKey: string;
  readonly bucketId: string;
  readonly count: number;
  readonly max: number;
  readonly retryAfterSeconds: number;
  constructor(args: {
    ipKey: string;
    bucketId: string;
    count: number;
    max: number;
    retryAfterSeconds: number;
  }) {
    super(
      `Per-IP rate limit exceeded for ${args.ipKey} in ${args.bucketId}: ${args.count}/${args.max}.`,
    );
    this.name = 'PerIpRateLimitError';
    this.ipKey = args.ipKey;
    this.bucketId = args.bucketId;
    this.count = args.count;
    this.max = args.max;
    this.retryAfterSeconds = args.retryAfterSeconds;
  }
}

export interface CreateAuditRunOptions {
  ownerId: string;
  /**
   * Raw client IP (e.g. `x-forwarded-for` first hop). Optional for the local
   * dev path where no proxy header exists — `reserveIpSlot` will bucket all
   * such requests under the shared "unknown" sentinel so dev still exercises
   * the guardrail end-to-end without leaking real IPs into the path id.
   */
  clientIp?: string | null;
  /**
   * Audit Quality Roadmap §6.6 — opt-in "AI enhanced" flag from the start form.
   * Carried via options (not the shared `CreateAuditRunRequest`, which omits
   * the field) so the AuditRun doc records `aiEnhanced: true` and a post-audit
   * async enrichment job may run. Default / false keeps the audit fully
   * deterministic.
   */
  aiEnhanced?: boolean;
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

  // W2-A: prdText 정규화 — trim 후 빈 문자열은 null 로 fold (SSOT).
  // step04c 가 빈 문자열을 sources 에 포함시켜 false-positive 분석을 만들지
  // 않도록, downstream 으로는 항상 null 또는 non-empty trimmed 텍스트만 흐른다.
  const trimmedPrdText = request.prdText?.trim();
  const normalizedPrdText = trimmedPrdText && trimmedPrdText.length > 0 ? trimmedPrdText : null;

  // W2-A 50KB user cap (정규화 후 측정). UI 가드를 우회한 API 직접 호출에
  // 대비해 422 로 매핑되는 PrdTextTooLargeError 를 throw. 200KB 안전망보다
  // 먼저 발사되므로 사용자 친화적인 422 응답이 우선한다.
  if (normalizedPrdText) {
    const userByteLen = Buffer.byteLength(normalizedPrdText, 'utf8');
    if (userByteLen > PRD_TEXT_USER_MAX_BYTES) {
      throw new PrdTextTooLargeError(userByteLen);
    }

    // Server-side safety net: AuditRun doc 1MB 한도 초과 사전 차단.
    // UI/API 50KB 가드를 모두 통과한 케이스에도 한 번 더 안전망. 일반적으로
    // 50KB cap 이 먼저 걸려 여기 도달하지 않지만 defense in depth.
    const sizeCheck = validateDocumentSize(normalizedPrdText, PRD_TEXT_MAX_BYTES);
    if (!sizeCheck.ok) {
      throw new Error(
        `prdText too large: ${sizeCheck.size} bytes (max ${sizeCheck.max} bytes).`,
      );
    }
  }

  // T1.1a cost guardrail: reserve a slot in the current minute's per-IP bucket
  // BEFORE the global quota check. Per-IP denial is cheaper (no global counter
  // burn on abusive clients) and gives a more actionable 429 with a sub-minute
  // Retry-After. PerIpRateLimitError → route handler responds 429 + Retry-After.
  const ipReservation = await reserveIpSlot(options.clientIp ?? null);
  if (!ipReservation.allowed) {
    throw new PerIpRateLimitError({
      ipKey: ipReservation.ipKey,
      bucketId: ipReservation.bucketId,
      count: ipReservation.count,
      max: ipReservation.max,
      retryAfterSeconds: ipReservation.retryAfterSeconds,
    });
  }

  // T1.1c cost guardrail: reserve a slot in today's global audit quota BEFORE
  // we write any Firestore docs. If the cap is reached we throw, leaving zero
  // side effects — the route handler maps DailyQuotaExceededError → 429 Too Many Requests.
  const reservation = await reserveDailyQuotaSlot();
  if (!reservation.allowed) {
    throw new DailyQuotaExceededError({
      bucketId: reservation.bucketId,
      count: reservation.count,
      max: reservation.max,
    });
  }

  const db = getAdminFirestore();
  const ownerId = options.ownerId;
  const projectsCol = db.collection(COLLECTION_PATHS.projects(ownerId));

  // Find existing project by repoUrl (query must happen outside the batch).
  // T2.5: also resolve the immediate-prior COMPLETED AuditRun id for the same
  // (ownerId, repoUrl) in parallel so the new run can carry `previousRunId`
  // for re-audit diff. Lookup failure does NOT block run creation (helper
  // returns undefined on any Firestore error).
  const [existing, previousRunId] = await Promise.all([
    projectsCol.where('repoUrl', '==', parsedRepo.normalizedUrl).limit(1).get(),
    resolvePreviousRunId({
      db,
      ownerId,
      repoUrl: parsedRepo.normalizedUrl,
    }),
  ]);

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
    prdText: normalizedPrdText,
    // Unknown until enqueueAuditTask resolves below. Schema requires the field
    // to be present (nullable, not optional) so the initial doc carries null.
    enqueueMode: null,
    // S6-03: AuditRun starts with no tools recorded as SKIPPED. The worker's
    // `markRunCompleted` overwrites this with the aggregated list at the end
    // of the pipeline; the initial value is just the empty-array baseline so
    // the schema parses cleanly and downstream UI never reads `undefined`.
    partialResultTools: [],
    // T2.5: re-audit linkage. Conditionally spread so the field is absent (not
    // undefined) when this is a first-time audit — Firestore would reject an
    // `undefined` value and the AuditRun schema marks it `.optional()`.
    ...(previousRunId ? { previousRunId } : {}),
    // T2.4: persist the selected domain audit profile id (if any). Conditionally
    // spread for the same Firestore-vs-undefined reason as previousRunId above —
    // the worker resolves `getProfile(run.profileId)` and falls back to spec
    // defaults when the field is absent.
    ...(request.profileId ? { profileId: request.profileId } : {}),
    // §6.6: persist the opt-in "AI enhanced" flag. Conditionally spread (only
    // when true) for the same Firestore-vs-undefined reason as profileId above
    // — absent ⇒ the converter treats it as false (fully deterministic audit).
    ...(options.aiEnhanced ? { aiEnhanced: true } : {}),
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
      prdText: normalizedPrdText,
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
