// Typed Firestore writers — only the worker calls these (Admin SDK bypass).
// All write paths go through here to keep schema versions consistent.

import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import {
  type AuditReport,
  type AuditStep,
  type Evidence,
  type FeatureGraph,
  type Finding,
  type ImprovementPRD,
  type ProgressEvent,
  type ToolResult,
  AUDIT_STEPS,
  AUDIT_STEP_LABELS_KO,
  FIRESTORE_DOC_SAFE_BYTES,
  truncateMarkdown,
  validateDocumentSize,
} from '@cleartoship/shared-types';
import { getFirestoreClient } from './client.js';

const COLL = {
  auditRun: (runId: string) => `auditRuns/${runId}`,
  finding: (runId: string, fid: string) => `auditRuns/${runId}/findings/${fid}`,
  findingsCol: (runId: string) => `auditRuns/${runId}/findings`,
  evidence: (runId: string, eid: string) => `auditRuns/${runId}/evidences/${eid}`,
  evidencesCol: (runId: string) => `auditRuns/${runId}/evidences`,
  toolResult: (runId: string, tid: string) => `auditRuns/${runId}/toolResults/${tid}`,
  toolResultsCol: (runId: string) => `auditRuns/${runId}/toolResults`,
  featureGraph: (runId: string) => `auditRuns/${runId}/featureGraph/main`,
  report: (runId: string) => `auditRuns/${runId}/report/main`,
  improvementPrd: (runId: string) => `auditRuns/${runId}/improvementPrd/main`,
  progress: (runId: string) => `progressEvents/${runId}/events`,
};

export async function markRunStarted(runId: string): Promise<void> {
  const db = getFirestoreClient();
  await db.doc(COLL.auditRun(runId)).update({
    status: 'RUNNING',
    startedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    progress: 0,
    currentStep: AUDIT_STEPS[0],
  });
}

export async function updateRunStep(
  runId: string,
  step: AuditStep,
  percent: number,
): Promise<void> {
  const db = getFirestoreClient();
  await db.doc(COLL.auditRun(runId)).update({
    currentStep: step,
    progress: Math.max(0, Math.min(100, Math.round(percent))),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db
    .collection(COLL.progress(runId))
    .add({
      runId,
      step,
      percent: Math.round(percent),
      message: AUDIT_STEP_LABELS_KO[step],
      ts: FieldValue.serverTimestamp(),
    } satisfies Omit<ProgressEvent, 'id' | 'ts'> & { ts: FirebaseFirestore.FieldValue });
}

export async function markRunCompleted(runId: string): Promise<void> {
  const db = getFirestoreClient();
  await db.doc(COLL.auditRun(runId)).update({
    status: 'COMPLETED',
    progress: 100,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function markRunFailed(runId: string, errorMessage: string): Promise<void> {
  const db = getFirestoreClient();
  await db.doc(COLL.auditRun(runId)).update({
    status: 'FAILED',
    errorMessage,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function setRunCommitHash(runId: string, commitHash: string): Promise<void> {
  const db = getFirestoreClient();
  await db.doc(COLL.auditRun(runId)).update({
    commitHash,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// --- Finding & Evidence writers (auto-id, no manual id required) ---

export async function writeFinding(
  finding: Omit<Finding, 'id' | 'createdAt' | 'evidenceCount'> & { evidenceCount?: number },
): Promise<string> {
  const db = getFirestoreClient();
  const docRef = db.collection(COLL.findingsCol(finding.auditRunId)).doc();
  await docRef.set({
    ...finding,
    evidenceCount: finding.evidenceCount ?? 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Deterministic evidence id: `${findingId}-${sha1(source|path|line|snippet)[0..10]}`
 * Re-running a finding's adapter (e.g. worker retry) produces the same id, so
 * Firestore set() is idempotent and evidenceCount is incremented only once per
 * unique evidence — even though we use FieldValue.increment(), the guard below
 * prevents double-increment by checking doc existence inside a transaction.
 */
function deterministicEvidenceId(
  evidence: Omit<Evidence, 'id' | 'createdAt'>,
): string {
  const hashInput = [
    evidence.source,
    evidence.path ?? '',
    evidence.lineStart ?? '',
    evidence.lineEnd ?? '',
    evidence.snippet ?? '',
    evidence.type,
  ].join('|');
  const digest = createHash('sha1').update(hashInput).digest('hex').slice(0, 12);
  const prefix = evidence.findingId ?? 'orphan';
  return `${prefix}-${digest}`;
}

export async function writeEvidence(
  evidence: Omit<Evidence, 'id' | 'createdAt'>,
): Promise<string> {
  const db = getFirestoreClient();
  const evidenceId = deterministicEvidenceId(evidence);
  const evidenceRef = db.doc(COLL.evidence(evidence.auditRunId, evidenceId));

  // Idempotent write: only increment evidenceCount on first creation.
  // Without the existence check, retries would re-set the doc and double-count.
  const isFirstWrite = await db.runTransaction(async (tx) => {
    const snap = await tx.get(evidenceRef);
    tx.set(evidenceRef, {
      ...evidence,
      createdAt: snap.exists ? snap.data()?.createdAt : FieldValue.serverTimestamp(),
    });
    return !snap.exists;
  });

  if (isFirstWrite && evidence.findingId) {
    await db
      .doc(COLL.finding(evidence.auditRunId, evidence.findingId))
      .update({ evidenceCount: FieldValue.increment(1) });
  }
  return evidenceId;
}

export async function writeToolResult(
  result: Omit<ToolResult, 'id' | 'createdAt'>,
): Promise<string> {
  const db = getFirestoreClient();
  const docRef = db.collection(COLL.toolResultsCol(result.auditRunId)).doc();
  await docRef.set({ ...result, createdAt: FieldValue.serverTimestamp() });
  return docRef.id;
}

export async function writeFeatureGraph(
  runId: string,
  graph: Omit<FeatureGraph, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  // FeatureGraph: 노드/엣지 JSON 배열은 큰 프로젝트에서 1MB 초과 가능.
  // Sprint 0: 한도 초과 시 명시적 에러 (실패가 silent corruption보다 안전).
  // Sprint 1+: Storage offload 또는 노드 캡 + 페이지네이션 도입 예정.
  const check = validateDocumentSize(graph, FIRESTORE_DOC_SAFE_BYTES);
  if (!check.ok) {
    throw new Error(
      `featureGraph exceeds Firestore safe size: ${check.size} bytes (max ${check.max}). ` +
        `runId=${runId}, nodes=${graph.nodes.length}, edges=${graph.edges.length}. ` +
        `TODO Sprint 1: offload to Cloud Storage or apply node cap.`,
    );
  }

  const db = getFirestoreClient();
  await db.doc(COLL.featureGraph(runId)).set({
    ...graph,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function writeReport(
  runId: string,
  report: Omit<AuditReport, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  // markdown 필드가 가장 비대해질 수 있으므로 우선 markdown만 truncate 시도.
  // truncate 후에도 전체 doc이 한도 초과면 명시적 에러.
  let safeReport = report;
  const initial = validateDocumentSize(report, FIRESTORE_DOC_SAFE_BYTES);
  if (!initial.ok) {
    // markdown 외 다른 필드(categoryScores, severityCounts 등)는 작으므로
    // markdown만 줄이면 한도 안에 들어옴.
    const truncatedMarkdown = truncateMarkdown(report.markdown, FIRESTORE_DOC_SAFE_BYTES - 50_000);
    safeReport = { ...report, markdown: truncatedMarkdown };

    const recheck = validateDocumentSize(safeReport, FIRESTORE_DOC_SAFE_BYTES);
    if (!recheck.ok) {
      throw new Error(
        `AuditReport exceeds Firestore safe size even after markdown truncation: ${recheck.size} bytes. runId=${runId}`,
      );
    }
  }

  const db = getFirestoreClient();
  await db.doc(COLL.report(runId)).set({
    ...safeReport,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function writeImprovementPrd(
  runId: string,
  prd: Omit<ImprovementPRD, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  let safePrd = prd;
  const initial = validateDocumentSize(prd, FIRESTORE_DOC_SAFE_BYTES);
  if (!initial.ok) {
    const truncatedMarkdown = truncateMarkdown(prd.markdown, FIRESTORE_DOC_SAFE_BYTES - 50_000);
    safePrd = { ...prd, markdown: truncatedMarkdown };

    const recheck = validateDocumentSize(safePrd, FIRESTORE_DOC_SAFE_BYTES);
    if (!recheck.ok) {
      throw new Error(
        `ImprovementPRD exceeds Firestore safe size even after markdown truncation: ${recheck.size} bytes. runId=${runId}`,
      );
    }
  }

  const db = getFirestoreClient();
  await db.doc(COLL.improvementPrd(runId)).set({
    ...safePrd,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
