// Typed Firestore converters — validates with Zod at the boundary.
// Keep collection paths centralized to avoid drift between web and worker.

import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  Timestamp,
} from 'firebase-admin/firestore';
import {
  type AuditRun,
  type Finding,
  type Evidence,
  type FeatureGraph,
  type AuditReport,
  type ImprovementPRD,
  type Project,
  type ProgressEvent,
  AuditRunSchema,
  FindingSchema,
  EvidenceSchema,
  FeatureGraphSchema,
  AuditReportSchema,
  ImprovementPrdSchema,
  ProjectSchema,
  ProgressEventSchema,
} from '@cleartoship/shared-types';

export const COLLECTION_PATHS = {
  users: () => `users`,
  user: (uid: string) => `users/${uid}`,
  projects: (uid: string) => `users/${uid}/projects`,
  project: (uid: string, projectId: string) => `users/${uid}/projects/${projectId}`,

  auditRuns: () => `auditRuns`,
  auditRun: (runId: string) => `auditRuns/${runId}`,
  findings: (runId: string) => `auditRuns/${runId}/findings`,
  finding: (runId: string, findingId: string) =>
    `auditRuns/${runId}/findings/${findingId}`,
  evidences: (runId: string) => `auditRuns/${runId}/evidences`,
  evidence: (runId: string, eid: string) => `auditRuns/${runId}/evidences/${eid}`,
  toolResults: (runId: string) => `auditRuns/${runId}/toolResults`,
  featureGraphDoc: (runId: string) => `auditRuns/${runId}/featureGraph/main`,
  reportDoc: (runId: string) => `auditRuns/${runId}/report/main`,
  improvementPrdDoc: (runId: string) => `auditRuns/${runId}/improvementPrd/main`,
  progressEvents: (runId: string) => `progressEvents/${runId}/events`,
} as const;

// Convert firestore Timestamp to ISO at read time.
type FirestoreTimestampLike = Timestamp | Date | string | null | undefined;
function toIso(v: FirestoreTimestampLike): string {
  if (v == null) return new Date(0).toISOString();
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  // Firestore Timestamp
  return v.toDate().toISOString();
}

function normalizeTimestamps<T extends Record<string, unknown>>(raw: T): T {
  const out: Record<string, unknown> = { ...raw };
  for (const key of ['createdAt', 'updatedAt', 'startedAt', 'completedAt', 'ts']) {
    if (key in out) {
      out[key] = out[key] == null ? null : toIso(out[key] as FirestoreTimestampLike);
    }
  }
  return out as T;
}

function makeConverter<T extends { id: string }>(
  schema: { parse(input: unknown): T },
): FirestoreDataConverter<T> {
  return {
    toFirestore(model: T): DocumentData {
      const { id: _omit, ...rest } = model as T & Record<string, unknown>;
      return rest;
    },
    fromFirestore(snap: QueryDocumentSnapshot<DocumentData>): T {
      const data = snap.data();
      const candidate = normalizeTimestamps({ id: snap.id, ...data });
      return schema.parse(candidate);
    },
  };
}

export const auditRunConverter = makeConverter<AuditRun>(AuditRunSchema);
export const findingConverter = makeConverter<Finding>(FindingSchema);
export const evidenceConverter = makeConverter<Evidence>(EvidenceSchema);
export const projectConverter = makeConverter<Project>(ProjectSchema);
export const progressEventConverter = makeConverter<ProgressEvent>(ProgressEventSchema);

// Singleton-doc converters (id is always "main").
export const featureGraphConverter: FirestoreDataConverter<FeatureGraph> = {
  toFirestore(model) {
    const { id: _omit, ...rest } = model;
    return rest;
  },
  fromFirestore(snap) {
    const data = normalizeTimestamps({ id: 'main', ...snap.data() });
    return FeatureGraphSchema.parse(data);
  },
};

export const auditReportConverter: FirestoreDataConverter<AuditReport> = {
  toFirestore(model) {
    const { id: _omit, ...rest } = model;
    return rest;
  },
  fromFirestore(snap) {
    const data = normalizeTimestamps({ id: 'main', ...snap.data() });
    return AuditReportSchema.parse(data);
  },
};

export const improvementPrdConverter: FirestoreDataConverter<ImprovementPRD> = {
  toFirestore(model) {
    const { id: _omit, ...rest } = model;
    return rest;
  },
  fromFirestore(snap) {
    const data = normalizeTimestamps({ id: 'main', ...snap.data() });
    return ImprovementPrdSchema.parse(data);
  },
};
