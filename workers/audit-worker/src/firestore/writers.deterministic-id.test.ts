// Tests the deterministic evidence id contract surfaced by writeEvidence.
// Strategy: mock firebase-admin/firestore + ./client.js so writeEvidence runs
// against an in-memory fake. We capture the doc id passed to db.doc() for the
// evidence path and assert the documented contract:
//   id = `${findingId ?? 'orphan'}-${sha1(source|path|lineStart|lineEnd|snippet|type)[0..12]}`

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

// --- Capturing fake Firestore ---
interface DocCall { path: string; id: string }
const docCalls: DocCall[] = [];
const existingDocs = new Set<string>();

function makeFakeDb() {
  return {
    doc(path: string) {
      const id = path.split('/').pop() ?? '';
      docCalls.push({ path, id });
      return {
        get: vi.fn().mockResolvedValue({ exists: existingDocs.has(path), data: () => ({}) }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      };
    },
    runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
        set: vi.fn().mockResolvedValue(undefined),
      };
      return fn(tx);
    }),
  };
}

vi.mock('./client.js', () => ({
  getFirestoreClient: () => makeFakeDb(),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__serverTimestamp__',
    increment: (n: number) => ({ __increment__: n }),
  },
}));

// Import AFTER mocks are registered.
import { writeEvidence } from './writers.js';

beforeEach(() => {
  docCalls.length = 0;
  existingDocs.clear();
});

function expectedId(opts: {
  findingId: string | null;
  source: string;
  path: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  snippet: string | null;
  type: string;
}): string {
  const hashInput = [
    opts.source,
    opts.path ?? '',
    opts.lineStart ?? '',
    opts.lineEnd ?? '',
    opts.snippet ?? '',
    opts.type,
  ].join('|');
  const digest = createHash('sha1').update(hashInput).digest('hex').slice(0, 12);
  const prefix = opts.findingId ?? 'orphan';
  return `${prefix}-${digest}`;
}

const baseEvidence = {
  auditRunId: 'run-1',
  findingId: 'find-abc',
  type: 'CODE_SNIPPET' as const,
  source: 'semgrep',
  path: 'apps/web/lib/auth.ts',
  lineStart: 10,
  lineEnd: 14,
  url: null,
  selector: null,
  screenshotPath: null,
  snippet: 'const token = req.headers.authorization;',
  maskedValue: null,
  metadata: null,
};

describe('deterministic evidence id — same input -> same id', () => {
  it('produces the same id for two identical evidences', async () => {
    const id1 = await writeEvidence({ ...baseEvidence });
    const id2 = await writeEvidence({ ...baseEvidence });
    expect(id1).toBe(id2);
  });

  it('id matches the documented sha1-12 prefix algorithm', async () => {
    const id = await writeEvidence({ ...baseEvidence });
    expect(id).toBe(
      expectedId({
        findingId: 'find-abc',
        source: 'semgrep',
        path: 'apps/web/lib/auth.ts',
        lineStart: 10,
        lineEnd: 14,
        snippet: baseEvidence.snippet,
        type: 'CODE_SNIPPET',
      }),
    );
  });

  it('id contains exactly 12 hex chars after the prefix', async () => {
    const id = await writeEvidence({ ...baseEvidence });
    const hashPart = id.split('-').slice(-1)[0]!;
    expect(hashPart).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('deterministic evidence id — different inputs -> different ids', () => {
  it('different snippet yields different id', async () => {
    const id1 = await writeEvidence({ ...baseEvidence, snippet: 'A' });
    const id2 = await writeEvidence({ ...baseEvidence, snippet: 'B' });
    expect(id1).not.toBe(id2);
  });

  it('different source yields different id', async () => {
    const id1 = await writeEvidence({ ...baseEvidence, source: 'semgrep' });
    const id2 = await writeEvidence({ ...baseEvidence, source: 'osv' });
    expect(id1).not.toBe(id2);
  });

  it('different path yields different id', async () => {
    const id1 = await writeEvidence({ ...baseEvidence, path: 'a.ts' });
    const id2 = await writeEvidence({ ...baseEvidence, path: 'b.ts' });
    expect(id1).not.toBe(id2);
  });

  it('different lineStart yields different id', async () => {
    const id1 = await writeEvidence({ ...baseEvidence, lineStart: 10 });
    const id2 = await writeEvidence({ ...baseEvidence, lineStart: 11 });
    expect(id1).not.toBe(id2);
  });

  it('different lineEnd yields different id', async () => {
    const id1 = await writeEvidence({ ...baseEvidence, lineEnd: 14 });
    const id2 = await writeEvidence({ ...baseEvidence, lineEnd: 15 });
    expect(id1).not.toBe(id2);
  });

  it('different evidence type yields different id', async () => {
    const id1 = await writeEvidence({ ...baseEvidence, type: 'CODE_SNIPPET' });
    const id2 = await writeEvidence({ ...baseEvidence, type: 'FILE' });
    expect(id1).not.toBe(id2);
  });
});

describe('deterministic evidence id — null findingId -> orphan prefix', () => {
  it('uses "orphan" prefix when findingId is null', async () => {
    const id = await writeEvidence({ ...baseEvidence, findingId: null });
    expect(id).toMatch(/^orphan-[0-9a-f]{12}$/);
  });

  it('orphan id is still deterministic for identical evidence', async () => {
    const id1 = await writeEvidence({ ...baseEvidence, findingId: null });
    const id2 = await writeEvidence({ ...baseEvidence, findingId: null });
    expect(id1).toBe(id2);
  });

  it('orphan and non-orphan produce different ids for otherwise equal evidence', async () => {
    const idOrphan = await writeEvidence({ ...baseEvidence, findingId: null });
    const idAttached = await writeEvidence({ ...baseEvidence, findingId: 'find-abc' });
    expect(idOrphan).not.toBe(idAttached);
    expect(idOrphan.startsWith('orphan-')).toBe(true);
    expect(idAttached.startsWith('find-abc-')).toBe(true);
  });
});

describe('deterministic evidence id — null path/lineStart/lineEnd/snippet handled', () => {
  it('handles null path/lineStart/lineEnd/snippet without throwing', async () => {
    const id = await writeEvidence({
      ...baseEvidence,
      path: null,
      lineStart: null,
      lineEnd: null,
      snippet: null,
    });
    expect(id).toMatch(/^find-abc-[0-9a-f]{12}$/);
  });

  it('null fields collapse to empty string in hash input (matches spec)', async () => {
    const id = await writeEvidence({
      ...baseEvidence,
      path: null,
      lineStart: null,
      lineEnd: null,
      snippet: null,
    });
    expect(id).toBe(
      expectedId({
        findingId: 'find-abc',
        source: baseEvidence.source,
        path: null,
        lineStart: null,
        lineEnd: null,
        snippet: null,
        type: 'CODE_SNIPPET',
      }),
    );
  });
});
