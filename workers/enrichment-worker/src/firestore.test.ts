import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import type { AuditEnrichment } from '@cleartoship/shared-types';
import { fetchReport, fetchRun, writeEnrichment } from './firestore.js';

const ISO = '2026-05-27T00:00:00.000Z';
const TS = Timestamp.fromDate(new Date(ISO));

/** A valid AuditRun as Firestore would store it (Timestamps, no `id`). */
function runDocData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId: 'p1',
    ownerId: 'u1',
    status: 'COMPLETED',
    currentStep: null,
    progress: 100,
    commitHash: 'sha-123',
    startedAt: TS,
    completedAt: TS,
    errorMessage: null,
    repoUrl: 'https://github.com/acme/widget',
    deployUrl: null,
    prdText: null,
    aiEnhanced: true,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

/** A valid AuditReport as Firestore would store it (Timestamps, no `id`). */
function reportDocData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    auditRunId: 'run-1',
    readinessScore: 72,
    launchStatus: 'CONDITIONAL',
    categoryScores: [
      { category: 'PRODUCT_INTENT', score: null, label: 'Product Intent', summary: null, origin: 'none' },
    ],
    severityCounts: { P0: 0, P1: 1, P2: 2, P3: 3 },
    executiveSummary: '대체로 양호',
    markdown: '# Report',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

/**
 * Build a fake Firestore whose `.doc(path)` returns a ref with mocked
 * `.get()`/`.set()`. `docs` maps an exact path to its stored data (or null
 * for a non-existent doc). `setSpy` captures writes.
 */
function fakeDb(
  docs: Record<string, Record<string, unknown> | null>,
  setSpy = vi.fn(),
): { db: Firestore; setSpy: ReturnType<typeof vi.fn> } {
  const db = {
    doc(path: string) {
      const data = docs[path];
      return {
        async get() {
          return {
            exists: data != null,
            id: path.split('/').pop() ?? '',
            data: () => data ?? undefined,
          };
        },
        async set(value: unknown, options?: unknown) {
          setSpy(path, value, options);
        },
      };
    },
  } as unknown as Firestore;
  return { db, setSpy };
}

describe('fetchRun', () => {
  it('returns null when the run doc is missing', async () => {
    const { db } = fakeDb({ 'auditRuns/run-1': null });
    expect(await fetchRun(db, 'run-1')).toBeNull();
  });

  it('parses a valid run, normalizing Timestamps to ISO', async () => {
    const { db } = fakeDb({ 'auditRuns/run-1': runDocData() });
    const run = await fetchRun(db, 'run-1');
    expect(run).not.toBeNull();
    expect(run?.id).toBe('run-1');
    expect(run?.commitHash).toBe('sha-123');
    expect(run?.aiEnhanced).toBe(true);
    expect(run?.createdAt).toBe(ISO);
    // legacy-default: missing partialResultTools normalizes to []
    expect(run?.partialResultTools).toEqual([]);
  });

  it('returns null on a schema-invalid run', async () => {
    const { db } = fakeDb({ 'auditRuns/run-1': runDocData({ repoUrl: 'not-a-url' }) });
    expect(await fetchRun(db, 'run-1')).toBeNull();
  });
});

describe('fetchReport', () => {
  it('returns null when the report doc is missing', async () => {
    const { db } = fakeDb({ 'auditRuns/run-1/report/main': null });
    expect(await fetchReport(db, 'run-1')).toBeNull();
  });

  it('parses a valid report with id "main" and ISO timestamps', async () => {
    const { db } = fakeDb({ 'auditRuns/run-1/report/main': reportDocData() });
    const report = await fetchReport(db, 'run-1');
    expect(report).not.toBeNull();
    expect(report?.id).toBe('main');
    expect(report?.readinessScore).toBe(72);
    expect(report?.updatedAt).toBe(ISO);
  });

  it('returns null on a schema-invalid report', async () => {
    const { db } = fakeDb({ 'auditRuns/run-1/report/main': reportDocData({ readinessScore: 999 }) });
    expect(await fetchReport(db, 'run-1')).toBeNull();
  });
});

describe('writeEnrichment', () => {
  const enrichment: AuditEnrichment = {
    status: 'DONE',
    commitSha: 'sha-123',
    categories: [],
    totalTokens: 1500,
    generatedAt: ISO,
  };

  it('merges enrichment + updatedAt onto the report doc', async () => {
    const { db, setSpy } = fakeDb({ 'auditRuns/run-1/report/main': reportDocData() });
    await writeEnrichment(db, 'run-1', enrichment);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const [path, value, options] = setSpy.mock.calls[0]!;
    expect(path).toBe('auditRuns/run-1/report/main');
    expect((value as { enrichment: AuditEnrichment }).enrichment).toEqual(enrichment);
    expect((value as { updatedAt: unknown }).updatedAt).toBeDefined();
    expect(options).toEqual({ merge: true });
  });
});
