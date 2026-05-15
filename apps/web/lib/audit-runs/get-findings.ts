import { getAdminFirestore } from '@/lib/firebase/admin';
import {
  COLLECTION_PATHS,
  findingConverter,
  evidenceConverter,
} from '@/lib/firebase/collections';
import type {
  AuditCategory,
  Evidence,
  Finding,
  ListFindingsQuery,
  Severity,
} from '@cleartoship/shared-types';
import { checkRunOwnership } from './auth';

export interface ListFindingsResult {
  findings: Finding[];
  nextCursor: string | null;
}

export async function listFindings(
  runId: string,
  ownerId: string,
  query: ListFindingsQuery,
): Promise<ListFindingsResult | null> {
  // Lightweight ownership check — projects only the denormalized ownerId field
  // instead of fetching + zod-parsing the full AuditRun doc.
  const ownership = await checkRunOwnership(runId, ownerId);
  if (ownership !== 'OK') return null;

  const db = getAdminFirestore();
  let ref = db
    .collection(COLLECTION_PATHS.findings(runId))
    .withConverter(findingConverter) as FirebaseFirestore.Query<Finding>;

  if (query.severity) {
    ref = ref.where('severity', '==', query.severity satisfies Severity);
  }
  if (query.category) {
    ref = ref.where('category', '==', query.category satisfies AuditCategory);
  }
  ref = ref.orderBy('createdAt', 'desc');
  const limit = query.limit ?? 50;
  ref = ref.limit(limit + 1);
  if (query.cursor) {
    const cursorDoc = await db
      .doc(COLLECTION_PATHS.finding(runId, query.cursor))
      .withConverter(findingConverter)
      .get();
    if (cursorDoc.exists) ref = ref.startAfter(cursorDoc);
  }

  const snap = await ref.get();
  const docs = snap.docs.map((d) => d.data());
  const hasMore = docs.length > limit;
  const findings = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore && findings.length > 0 ? findings[findings.length - 1]!.id : null;
  return { findings, nextCursor };
}

export async function getFinding(
  runId: string,
  findingId: string,
  ownerId: string,
): Promise<{ finding: Finding; evidences: Evidence[] } | null> {
  const ownership = await checkRunOwnership(runId, ownerId);
  if (ownership !== 'OK') return null;

  const db = getAdminFirestore();
  const findingSnap = await db
    .doc(COLLECTION_PATHS.finding(runId, findingId))
    .withConverter(findingConverter)
    .get();
  if (!findingSnap.exists) return null;
  const finding = findingSnap.data();
  if (!finding) return null;

  // Cap evidence list at 200 to prevent runaway response sizes (a misbehaving
  // worker could emit thousands of evidence rows per finding). If we hit the
  // cap we surface a structured stderr warning so ops can detect truncation.
  const EVIDENCE_CAP = 200;
  const evidenceSnap = await db
    .collection(COLLECTION_PATHS.evidences(runId))
    .where('findingId', '==', findingId)
    .withConverter(evidenceConverter)
    .limit(EVIDENCE_CAP)
    .get();
  if (evidenceSnap.size === EVIDENCE_CAP) {
    process.stderr.write(
      JSON.stringify({
        level: 'warn',
        component: 'audit-runs.get-findings',
        message: 'Evidences truncated at cap',
        cap: EVIDENCE_CAP,
        runId,
        findingId,
      }) + '\n',
    );
  }

  return { finding, evidences: evidenceSnap.docs.map((d) => d.data()) };
}
