// Firestore converter tests — focused on the auditRunConverter contract:
//   1. fromFirestore parses with AuditRunSchema
//   2. fromFirestore coerces missing/undefined enqueueMode → null at the read
//      boundary (the schema is .nullable().optional(), but downstream consumers
//      expect EnqueueMode | null, never undefined)
//   3. toFirestore strips the synthetic `id` field (Firestore stores id as the
//      doc key, not inside the doc body)
//   4. Timestamps normalize to ISO strings via normalizeTimestamps
//
// Sibling-located on purpose: the review-gate hook only treats `<name>.test.ts`
// adjacent to `<name>.ts` as proof-of-coverage.

import { describe, it, expect } from 'vitest';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';
import { auditRunConverter, COLLECTION_PATHS } from './collections.js';
import type { AuditRun } from '@cleartoship/shared-types';

const ISO = '2026-05-16T05:00:00.000Z';

function makeSnap(id: string, data: DocumentData): QueryDocumentSnapshot<DocumentData> {
  return {
    id,
    data: () => data,
  } as unknown as QueryDocumentSnapshot<DocumentData>;
}

function validAuditRunData(over: Record<string, unknown> = {}) {
  return {
    projectId: 'proj-1',
    ownerId: 'user-1',
    status: 'RUNNING',
    currentStep: 'RUN_STATIC_ANALYSIS',
    progress: 42,
    commitHash: null,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    repoUrl: 'https://github.com/owner/repo',
    deployUrl: null,
    prdText: null,
    enqueueMode: 'cloud-tasks',
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

describe('auditRunConverter.fromFirestore', () => {
  it('parses a valid AuditRun document', () => {
    const snap = makeSnap('run-1', validAuditRunData());
    const parsed = auditRunConverter.fromFirestore(snap);
    expect(parsed.id).toBe('run-1');
    expect(parsed.enqueueMode).toBe('cloud-tasks');
    expect(parsed.status).toBe('RUNNING');
  });

  it('preserves null enqueueMode (pre-enqueue state)', () => {
    const snap = makeSnap('run-2', validAuditRunData({ enqueueMode: null }));
    const parsed = auditRunConverter.fromFirestore(snap);
    expect(parsed.enqueueMode).toBeNull();
  });

  it('coerces missing enqueueMode → null (legacy doc forward-compat)', () => {
    const { enqueueMode: _drop, ...legacy } = validAuditRunData();
    const snap = makeSnap('run-legacy', legacy);
    const parsed = auditRunConverter.fromFirestore(snap);
    // Critical contract: downstream consumers (AuditRunDto, DevPipelineBanner)
    // expect `EnqueueMode | null`, never `undefined`. The converter is the
    // single point where this normalization happens.
    expect(parsed.enqueueMode).toBeNull();
    expect(parsed.enqueueMode).not.toBeUndefined();
  });

  it('coerces explicit undefined enqueueMode → null', () => {
    const snap = makeSnap('run-undef', validAuditRunData({ enqueueMode: undefined }));
    const parsed = auditRunConverter.fromFirestore(snap);
    expect(parsed.enqueueMode).toBeNull();
  });

  it.each(['cloud-tasks', 'direct-worker', 'stub'] as const)(
    'accepts %s as a valid enqueueMode',
    (mode) => {
      const snap = makeSnap('run-x', validAuditRunData({ enqueueMode: mode }));
      const parsed = auditRunConverter.fromFirestore(snap);
      expect(parsed.enqueueMode).toBe(mode);
    },
  );

  it('rejects an unknown enqueueMode literal at parse time', () => {
    const snap = makeSnap('run-bad', validAuditRunData({ enqueueMode: 'http' }));
    expect(() => auditRunConverter.fromFirestore(snap)).toThrow();
  });

  it('normalizes Firestore Timestamp objects to ISO strings', () => {
    const fakeTimestamp = {
      toDate: () => new Date('2026-05-16T05:00:00.000Z'),
    };
    const snap = makeSnap(
      'run-ts',
      validAuditRunData({ createdAt: fakeTimestamp, updatedAt: fakeTimestamp }),
    );
    const parsed = auditRunConverter.fromFirestore(snap);
    expect(parsed.createdAt).toBe(ISO);
    expect(parsed.updatedAt).toBe(ISO);
  });

  it('uses snapshot id as the document id (not data.id)', () => {
    // The data does NOT contain `id` — Firestore stores it as the doc key.
    const snap = makeSnap('snap-id-123', validAuditRunData());
    const parsed = auditRunConverter.fromFirestore(snap);
    expect(parsed.id).toBe('snap-id-123');
  });
});

describe('auditRunConverter.toFirestore', () => {
  it('strips the synthetic id field before write', () => {
    const model: AuditRun = {
      id: 'run-1',
      projectId: 'proj-1',
      ownerId: 'user-1',
      status: 'RUNNING',
      currentStep: 'RUN_STATIC_ANALYSIS',
      progress: 42,
      commitHash: null,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      repoUrl: 'https://github.com/owner/repo',
      deployUrl: null,
      prdText: null,
      enqueueMode: 'cloud-tasks',
      createdAt: ISO,
      updatedAt: ISO,
    };
    const out = auditRunConverter.toFirestore(model);
    expect(out).not.toHaveProperty('id');
    expect(out.projectId).toBe('proj-1');
    expect(out.enqueueMode).toBe('cloud-tasks');
  });
});

describe('COLLECTION_PATHS', () => {
  it('produces the canonical audit-run paths', () => {
    expect(COLLECTION_PATHS.auditRun('run-1')).toBe('auditRuns/run-1');
    expect(COLLECTION_PATHS.findings('run-1')).toBe('auditRuns/run-1/findings');
    expect(COLLECTION_PATHS.reportDoc('run-1')).toBe('auditRuns/run-1/report/main');
    expect(COLLECTION_PATHS.improvementPrdDoc('run-1')).toBe(
      'auditRuns/run-1/improvementPrd/main',
    );
  });

  it('produces user-scoped project paths', () => {
    expect(COLLECTION_PATHS.user('uid-1')).toBe('users/uid-1');
    expect(COLLECTION_PATHS.project('uid-1', 'proj-1')).toBe(
      'users/uid-1/projects/proj-1',
    );
  });
});
