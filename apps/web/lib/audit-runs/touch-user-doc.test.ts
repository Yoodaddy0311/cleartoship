// Tests for touchUserDoc (Sprint 1 Item #15 option a).
//
// Verifies that:
//   1. First call on a non-existent doc writes uid/isAnonymous/createdAt/lastSeenAt.
//   2. Subsequent call on an existing doc only merges isAnonymous + lastSeenAt
//      (preserves the original createdAt).
//   3. Anonymous flag round-trips correctly (true → false on upgrade).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setMock = vi.fn(async () => undefined);
const getMock = vi.fn();
const docMock = vi.fn(() => ({ set: setMock, get: getMock }));
const serverTimestampSentinel = { __serverTimestamp: true };

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => serverTimestampSentinel,
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({ doc: docMock }),
}));

import { touchUserDoc } from './touch-user-doc';

describe('touchUserDoc', () => {
  beforeEach(() => {
    setMock.mockClear();
    getMock.mockClear();
    docMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes full doc on first call when snap.exists is false', async () => {
    getMock.mockResolvedValueOnce({ exists: false });

    await touchUserDoc({ uid: 'anon-uid-1', isAnonymous: true });

    expect(docMock).toHaveBeenCalledWith('users/anon-uid-1');
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({
      uid: 'anon-uid-1',
      isAnonymous: true,
      createdAt: serverTimestampSentinel,
      lastSeenAt: serverTimestampSentinel,
    });
  });

  it('merges only lastSeenAt + isAnonymous on existing doc', async () => {
    getMock.mockResolvedValueOnce({ exists: true });

    await touchUserDoc({ uid: 'anon-uid-2', isAnonymous: true });

    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      { isAnonymous: true, lastSeenAt: serverTimestampSentinel },
      { merge: true },
    );
  });

  it('flips isAnonymous from true to false on upgrade', async () => {
    getMock.mockResolvedValueOnce({ exists: true });

    await touchUserDoc({ uid: 'upgraded-uid', isAnonymous: false });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ isAnonymous: false }),
      { merge: true },
    );
  });
});
