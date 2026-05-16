// Unit tests for getFinding evidence cap behavior (Item #14 — Sprint 1
// safety net for runaway evidence lists). Firestore admin and ownership
// check are mocked end-to-end so the test runs purely in-process.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Hoisted mocks -----------------------------------------------------------
const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));
const { whereMock } = vi.hoisted(() => ({ whereMock: vi.fn() }));
const { withConverterMock } = vi.hoisted(() => ({ withConverterMock: vi.fn() }));
const { collectionMock } = vi.hoisted(() => ({ collectionMock: vi.fn() }));
const { docMock } = vi.hoisted(() => ({ docMock: vi.fn() }));
const { checkRunOwnershipMock } = vi.hoisted(() => ({ checkRunOwnershipMock: vi.fn() }));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({
    collection: collectionMock,
    doc: docMock,
  }),
}));

vi.mock('@/lib/firebase/collections', () => ({
  COLLECTION_PATHS: {
    evidences: (runId: string) => `auditRuns/${runId}/evidences`,
    finding: (runId: string, findingId: string) =>
      `auditRuns/${runId}/findings/${findingId}`,
  },
  findingConverter: { toFirestore: () => ({}), fromFirestore: () => ({}) },
  evidenceConverter: { toFirestore: () => ({}), fromFirestore: () => ({}) },
}));

vi.mock('./auth', () => ({
  checkRunOwnership: checkRunOwnershipMock,
}));

// --- Helpers -----------------------------------------------------------------
interface EvidenceRow {
  id: string;
  findingId: string;
}
function makeEvidenceDocs(count: number): Array<{ data: () => EvidenceRow }> {
  return Array.from({ length: count }, (_, i) => ({
    data: () => ({ id: `ev-${i}`, findingId: 'finding-1' }),
  }));
}

function setupFindingSnap(exists: boolean, data: Record<string, unknown> | null) {
  // db.doc(...).withConverter(...).get() chain for the finding fetch
  const findingChain = {
    withConverter: () => ({
      get: async () => ({
        exists,
        data: () => data,
      }),
    }),
  };
  docMock.mockReturnValue(findingChain);
}

function setupEvidenceCollection(docs: Array<{ data: () => EvidenceRow }>) {
  // db.collection(path).where(...).withConverter(...).limit(N).get()
  const terminal = { get: getMock };
  limitMock.mockReturnValue(terminal);
  withConverterMock.mockReturnValue({ limit: limitMock });
  whereMock.mockReturnValue({ withConverter: withConverterMock });
  collectionMock.mockReturnValue({ where: whereMock });
  getMock.mockResolvedValue({ size: docs.length, docs });
}

// --- Tests -------------------------------------------------------------------
describe('getFinding — evidence cap (Item #14)', () => {
  // Use the no-op write spy as `any` because process.stderr.write's overloaded
  // signature trips vi.SpyInstance's generic constraints. The runtime behavior
  // (recording calls) is what matters.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;
  const originalEvidenceCap = process.env.EVIDENCE_CAP;

  beforeEach(() => {
    vi.resetAllMocks();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    checkRunOwnershipMock.mockResolvedValue('OK');
    setupFindingSnap(true, { id: 'finding-1', title: 't' });
    // Ensure each test starts with the default cap unless it overrides.
    delete process.env.EVIDENCE_CAP;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    if (originalEvidenceCap === undefined) {
      delete process.env.EVIDENCE_CAP;
    } else {
      process.env.EVIDENCE_CAP = originalEvidenceCap;
    }
    vi.resetModules();
  });

  it('applies .limit(200) and warns when evidence count hits the cap', async () => {
    setupEvidenceCollection(makeEvidenceDocs(200));
    const { getFinding } = await import('./get-findings');
    const result = await getFinding('run-1', 'finding-1', 'owner-1');

    // Returned at most 200 evidences
    expect(result).not.toBeNull();
    expect(result!.evidences).toHaveLength(200);
    // Truncated flag exposed for the API layer
    expect(result!.truncated).toBe(true);

    // .limit(200) was invoked on the chain
    expect(limitMock).toHaveBeenCalledWith(200);

    // Structured warn emitted to stderr
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const written = String(stderrSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(written.trim());
    expect(parsed.level).toBe('warn');
    expect(parsed.message).toMatch(/truncated/i);
    expect(parsed.cap).toBe(200);
    expect(parsed.runId).toBe('run-1');
    expect(parsed.findingId).toBe('finding-1');
  });

  it('returns truncated=false when evidence count is below the cap', async () => {
    setupEvidenceCollection(makeEvidenceDocs(5));
    const { getFinding } = await import('./get-findings');
    const result = await getFinding('run-1', 'finding-1', 'owner-1');

    expect(result).not.toBeNull();
    expect(result!.evidences).toHaveLength(5);
    expect(result!.truncated).toBe(false);
    // No warn log when below the cap
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('honors EVIDENCE_CAP env override when valid', async () => {
    process.env.EVIDENCE_CAP = '50';
    setupEvidenceCollection(makeEvidenceDocs(50));
    const { getFinding } = await import('./get-findings');
    const result = await getFinding('run-1', 'finding-1', 'owner-1');

    expect(result!.truncated).toBe(true);
    expect(result!.evidences).toHaveLength(50);
    expect(limitMock).toHaveBeenCalledWith(50);
    // Warn payload should reflect the overridden cap.
    const written = String(stderrSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(written.trim());
    expect(parsed.cap).toBe(50);
  });

  it('falls back to default cap and warns when EVIDENCE_CAP is invalid (NaN)', async () => {
    process.env.EVIDENCE_CAP = 'not-a-number';
    setupEvidenceCollection(makeEvidenceDocs(10));
    const { getFinding } = await import('./get-findings');
    await getFinding('run-1', 'finding-1', 'owner-1');

    expect(limitMock).toHaveBeenCalledWith(200);
    // First write is the invalid-env warn; the cap-hit warn would not fire
    // because 10 < 200.
    const firstWrite = String(stderrSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(firstWrite.trim());
    expect(parsed.level).toBe('warn');
    expect(parsed.message).toMatch(/Invalid EVIDENCE_CAP/);
    expect(parsed.rawValue).toBe('not-a-number');
    expect(parsed.fallback).toBe(200);
  });

  it.each([
    ['0', '0'],
    ['-5', '-5'],
    ['1.5', '1.5'],
  ])('falls back to default cap when EVIDENCE_CAP is %s', async (envValue) => {
    process.env.EVIDENCE_CAP = envValue;
    setupEvidenceCollection(makeEvidenceDocs(3));
    const { getFinding } = await import('./get-findings');
    await getFinding('run-1', 'finding-1', 'owner-1');

    expect(limitMock).toHaveBeenCalledWith(200);
    const firstWrite = String(stderrSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(firstWrite.trim());
    expect(parsed.message).toMatch(/Invalid EVIDENCE_CAP/);
  });
});
