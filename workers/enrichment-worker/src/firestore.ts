// Firestore I/O for the enrichment job. Mirrors the audit-worker admin-init
// singleton (workers/audit-worker/src/firestore/client.ts) and the exact doc
// paths the audit-worker writes to (workers/audit-worker/src/firestore/writers.ts):
//   - AuditRun:    `auditRuns/{runId}`
//   - AuditReport: `auditRuns/{runId}/report/main`
// The enrichment job re-reads the run + report it was triggered for and merges
// an `AuditEnrichment` onto the same report doc.

import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  AuditReportSchema,
  AuditRunSchema,
  type AuditEnrichment,
  type AuditReport,
  type AuditRun,
} from '@cleartoship/shared-types';

let _app: App | null = null;

/**
 * Admin Firestore singleton — mirrors the audit-worker init exactly:
 * `FIREBASE_SERVICE_ACCOUNT_JSON` if present, else application-default creds.
 */
export function getFirestoreClient(): Firestore {
  if (!_app) {
    const existing = getApps()[0];
    if (existing) {
      _app = existing;
    } else {
      const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (sa) {
        const parsed = JSON.parse(sa) as Record<string, string>;
        _app = initializeApp({
          credential: cert({
            projectId: parsed.project_id,
            clientEmail: parsed.client_email,
            privateKey: (parsed.private_key ?? '').replace(/\\n/g, '\n'),
          }),
          projectId: parsed.project_id,
        });
      } else {
        _app = initializeApp({
          credential: applicationDefault(),
          projectId: process.env.GCP_PROJECT_ID ?? undefined,
        });
      }
    }
  }
  return getFirestore(_app);
}

/** Doc paths, mirroring audit-worker `writers.ts` COLL. */
const runDoc = (db: Firestore, runId: string): DocumentReference =>
  db.doc(`auditRuns/${runId}`);
const reportDoc = (db: Firestore, runId: string): DocumentReference =>
  db.doc(`auditRuns/${runId}/report/main`);

type FirestoreTimestampLike = Timestamp | Date | string | null | undefined;

function toIso(v: FirestoreTimestampLike): string {
  if (v == null) return new Date(0).toISOString();
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return v.toDate().toISOString();
}

/**
 * Convert Firestore `Timestamp` fields to ISO strings before zod-parsing —
 * mirrors `normalizeTimestamps` in apps/web `lib/firebase/collections.ts`.
 * Without this the `IsoDateString` schema fields reject raw Timestamp objects.
 */
function normalizeTimestamps(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  for (const key of ['createdAt', 'updatedAt', 'startedAt', 'completedAt', 'ts']) {
    if (key in out) {
      out[key] = out[key] == null ? null : toIso(out[key] as FirestoreTimestampLike);
    }
  }
  return out;
}

/**
 * Fetch + zod-validate the AuditRun. Mirrors the web `auditRunConverter`
 * normalization (id, timestamps, enqueueMode/partialResultTools defaults).
 * Returns null when the doc is missing or fails validation (the entry point
 * treats a missing run as a success-skip).
 */
export async function fetchRun(db: Firestore, runId: string): Promise<AuditRun | null> {
  const snap = await runDoc(db, runId).get();
  if (!snap.exists) return null;
  const candidate = normalizeTimestamps({ id: snap.id, ...snap.data() });
  const rawPartial = (candidate as { partialResultTools?: unknown }).partialResultTools;
  const normalized = {
    ...candidate,
    enqueueMode: (candidate as { enqueueMode?: unknown }).enqueueMode ?? null,
    partialResultTools: Array.isArray(rawPartial)
      ? rawPartial.filter((v): v is string => typeof v === 'string')
      : [],
  };
  const parsed = AuditRunSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

/**
 * Fetch + zod-validate the AuditReport. Mirrors the web `auditReportConverter`
 * (`id: 'main'` + timestamp normalization). Returns null when the doc is missing
 * or fails validation (tolerant: a malformed/absent report skips enrichment).
 */
export async function fetchReport(db: Firestore, runId: string): Promise<AuditReport | null> {
  const snap = await reportDoc(db, runId).get();
  if (!snap.exists) return null;
  const candidate = normalizeTimestamps({ id: 'main', ...snap.data() });
  const parsed = AuditReportSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Merge an `AuditEnrichment` onto the existing report doc without overwriting
 * other fields. Uses `set(..., { merge: true })` (not `update`) so an optimistic
 * PENDING write still succeeds if the report doc race-loses an unrelated field,
 * and stamps `updatedAt` with the server clock to match the audit-worker writer.
 */
export async function writeEnrichment(
  db: Firestore,
  runId: string,
  enrichment: AuditEnrichment,
): Promise<void> {
  await reportDoc(db, runId).set(
    {
      enrichment,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
