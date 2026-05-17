// S6-03: tests for the SKIPPED-tool aggregation contract on the worker side.
//
// Strategy mirrors `writers.deterministic-id.test.ts`: mock both
// `firebase-admin/firestore` and `./client.js` so we can exercise
// `aggregatePartialResultTools` + `markRunCompleted` end-to-end against an
// in-memory fake Firestore. The fake captures the `where('status','==','SKIPPED')`
// query and returns a configurable doc list so we can assert:
//   1. De-duplication: two SKIPPED writes for the same tool collapse to one
//      entry in `partialResultTools`.
//   2. Insertion order preservation: tool names appear in the order returned
//      by the Firestore iterator (which matches insertion order for auto-id
//      docs).
//   3. Non-string toolName values are filtered out defensively.
//   4. `markRunCompleted` writes the aggregated array onto the AuditRun doc.
//   5. An error inside the aggregation must NOT prevent the run from being
//      marked COMPLETED — the run completing is more important than the banner.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capturing fakes ---------------------------------------------------------

type SkippedDoc = { toolName: unknown };
const collectionState: {
  skippedDocs: SkippedDoc[];
  shouldThrow: boolean;
  lastWhere: Array<[string, string, string]>;
} = {
  skippedDocs: [],
  shouldThrow: false,
  lastWhere: [],
};

const updateCalls: Array<{ path: string; patch: Record<string, unknown> }> = [];

function makeFakeDb() {
  return {
    doc(path: string) {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          updateCalls.push({ path, patch });
          return Promise.resolve();
        }),
      };
    },
    collection(path: string) {
      void path;
      return {
        where(field: string, op: string, value: string) {
          collectionState.lastWhere.push([field, op, value]);
          return {
            async get() {
              if (collectionState.shouldThrow) {
                throw new Error('Firestore aggregation boom');
              }
              return {
                forEach(cb: (snap: { get: (k: string) => unknown }) => void) {
                  for (const d of collectionState.skippedDocs) {
                    cb({ get: (k: string) => (k === 'toolName' ? d.toolName : undefined) });
                  }
                },
              };
            },
          };
        },
      };
    },
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

// Import AFTER mocks.
import {
  aggregatePartialResultTools,
  markRunCompleted,
} from './writers.js';

beforeEach(() => {
  collectionState.skippedDocs = [];
  collectionState.shouldThrow = false;
  collectionState.lastWhere = [];
  updateCalls.length = 0;
});

describe('aggregatePartialResultTools', () => {
  it('returns [] when no SKIPPED tool results exist', async () => {
    collectionState.skippedDocs = [];
    const out = await aggregatePartialResultTools('run-1');
    expect(out).toEqual([]);
  });

  it('queries the toolResults sub-collection filtered to status === SKIPPED', async () => {
    await aggregatePartialResultTools('run-1');
    expect(collectionState.lastWhere).toEqual([['status', '==', 'SKIPPED']]);
  });

  it('returns unique tool names in insertion order', async () => {
    collectionState.skippedDocs = [
      { toolName: 'semgrep' },
      { toolName: 'osv-scanner' },
      { toolName: 'lighthouse' },
    ];
    const out = await aggregatePartialResultTools('run-1');
    expect(out).toEqual(['semgrep', 'osv-scanner', 'lighthouse']);
  });

  it('de-duplicates repeated tool names (two SKIPPED writes for same tool)', async () => {
    collectionState.skippedDocs = [
      { toolName: 'semgrep' },
      { toolName: 'semgrep' },
      { toolName: 'osv-scanner' },
    ];
    const out = await aggregatePartialResultTools('run-1');
    expect(out).toEqual(['semgrep', 'osv-scanner']);
  });

  it('filters out non-string toolName values defensively', async () => {
    collectionState.skippedDocs = [
      { toolName: 'semgrep' },
      { toolName: 42 },
      { toolName: null },
      { toolName: '' },
      { toolName: 'lighthouse' },
    ];
    const out = await aggregatePartialResultTools('run-1');
    expect(out).toEqual(['semgrep', 'lighthouse']);
  });
});

describe('markRunCompleted — writes partialResultTools onto the run doc', () => {
  it('writes the aggregated array under partialResultTools', async () => {
    collectionState.skippedDocs = [
      { toolName: 'semgrep' },
      { toolName: 'osv-scanner' },
    ];
    await markRunCompleted('run-1');
    const call = updateCalls.find((c) => c.path === 'auditRuns/run-1');
    expect(call).toBeTruthy();
    expect(call!.patch.partialResultTools).toEqual(['semgrep', 'osv-scanner']);
    expect(call!.patch.status).toBe('COMPLETED');
    expect(call!.patch.progress).toBe(100);
  });

  it('writes an empty array when nothing was SKIPPED', async () => {
    collectionState.skippedDocs = [];
    await markRunCompleted('run-1');
    const call = updateCalls.find((c) => c.path === 'auditRuns/run-1');
    expect(call!.patch.partialResultTools).toEqual([]);
  });

  it('still marks the run COMPLETED with [] when aggregation throws', async () => {
    collectionState.shouldThrow = true;
    await markRunCompleted('run-1');
    const call = updateCalls.find((c) => c.path === 'auditRuns/run-1');
    expect(call).toBeTruthy();
    expect(call!.patch.status).toBe('COMPLETED');
    expect(call!.patch.partialResultTools).toEqual([]);
  });
});
