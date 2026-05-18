// Unit tests for the false-positive Firestore writer.
//
// We mock the firebase/firestore module so the tests neither touch a real
// project nor spin up an emulator. Coverage targets:
//   - readFalsePositive returns `{ isFalsePositive: false }` when missing
//   - readFalsePositive parses `isFalsePositive` only when strictly `true`
//   - markFalsePositive writes the expected payload + uses serverTimestamp
//   - unmarkFalsePositive deletes the document (does NOT soft-flag it)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const docMock = vi.fn();
const getDocMock = vi.fn();
const setDocMock = vi.fn();
const deleteDocMock = vi.fn();
const serverTimestampMock = vi.fn(() => 'SERVER_TS_SENTINEL');

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  serverTimestamp: () => serverTimestampMock(),
}));

vi.mock('@/lib/firebase/client', () => ({
  getClientFirestore: () => ({ __fake: 'db' }),
}));

const fakeDb = { __fake: 'getter-db' };
const fakeGetDb = () => fakeDb as unknown as ReturnType<
  typeof import('firebase/firestore').getFirestore
>;

const {
  readFalsePositive,
  markFalsePositive,
  unmarkFalsePositive,
} = await import('./false-positive.js');

beforeEach(() => {
  docMock.mockReset();
  getDocMock.mockReset();
  setDocMock.mockReset();
  deleteDocMock.mockReset();
  serverTimestampMock.mockClear();
  // doc() returns a sentinel ref that we can identify in setDoc/deleteDoc calls.
  docMock.mockImplementation((_db, path: string) => ({ __ref: path }));
});

describe('readFalsePositive', () => {
  it('returns `{ isFalsePositive: false }` when the doc is missing', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    const res = await readFalsePositive('run-1', 'find-1', fakeGetDb);
    expect(res).toEqual({ isFalsePositive: false, markedAt: null });
    expect(docMock).toHaveBeenCalledWith(fakeDb, 'auditRuns/run-1/feedback/find-1');
  });

  it('returns the persisted flag when the doc exists and is strictly true', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ isFalsePositive: true, markedAt: '2026-05-17T12:00:00Z' }),
    });
    const res = await readFalsePositive('run-2', 'find-2', fakeGetDb);
    expect(res).toEqual({
      isFalsePositive: true,
      markedAt: '2026-05-17T12:00:00Z',
    });
  });

  it('coerces non-boolean payloads to `false` (defensive against schema drift)', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ isFalsePositive: 'yes' }),
    });
    const res = await readFalsePositive('run-3', 'find-3', fakeGetDb);
    expect(res.isFalsePositive).toBe(false);
  });
});

describe('markFalsePositive', () => {
  it('writes the expected payload with serverTimestamp and merge=true', async () => {
    setDocMock.mockResolvedValue(undefined);
    await markFalsePositive('run-1', 'find-1', 'uid-abc', fakeGetDb);

    expect(docMock).toHaveBeenCalledWith(fakeDb, 'auditRuns/run-1/feedback/find-1');
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [ref, payload, opts] = setDocMock.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(ref).toEqual({ __ref: 'auditRuns/run-1/feedback/find-1' });
    expect(payload).toMatchObject({
      isFalsePositive: true,
      markedBy: 'uid-abc',
      findingId: 'find-1',
      runId: 'run-1',
    });
    expect(payload.markedAt).toBe('SERVER_TS_SENTINEL');
    expect(opts).toEqual({ merge: true });
  });

  it('propagates Firestore errors so the caller can roll back the UI', async () => {
    setDocMock.mockRejectedValue(new Error('permission-denied'));
    await expect(
      markFalsePositive('run-x', 'find-x', 'uid-x', fakeGetDb),
    ).rejects.toThrow('permission-denied');
  });
});

describe('unmarkFalsePositive', () => {
  it('deletes the doc (does not soft-flag with isFalsePositive: false)', async () => {
    deleteDocMock.mockResolvedValue(undefined);
    await unmarkFalsePositive('run-1', 'find-1', fakeGetDb);
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock).not.toHaveBeenCalled();
    const [ref] = deleteDocMock.mock.calls[0] as [unknown];
    expect(ref).toEqual({ __ref: 'auditRuns/run-1/feedback/find-1' });
  });
});
