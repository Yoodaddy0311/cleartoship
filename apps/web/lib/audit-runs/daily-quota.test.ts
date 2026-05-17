// Unit tests for the global daily quota guardrail (T1.1c).
//
// Strategy:
//   - Mock the Admin Firestore client so we exercise the transaction logic
//     without hitting a real Firestore.
//   - The quota module reads `system/quota/daily/{YYYY-MM-DD}` and increments
//     atomically via runTransaction. Tests cover: under-cap allow, at-cap
//     reject, first-of-day initialise, env override of DAILY_AUDIT_LIMIT.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminFirestoreMock, recordDailyQuotaUsageMock } = vi.hoisted(() => ({
  getAdminFirestoreMock: vi.fn(),
  recordDailyQuotaUsageMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: getAdminFirestoreMock,
}));

vi.mock('@/lib/observability/metrics', () => ({
  recordDailyQuotaUsage: recordDailyQuotaUsageMock,
}));

interface FsMock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { doc: any; runTransaction: any };
  docRef: { path: string };
  txGet: ReturnType<typeof vi.fn>;
  txSet: ReturnType<typeof vi.fn>;
  txUpdate: ReturnType<typeof vi.fn>;
}

function makeFs(opts: {
  existing?: { count: number; max?: number } | null;
}): FsMock {
  const docRef = { path: 'system/quota/daily/2026-05-17' };
  const txGet = vi.fn().mockResolvedValue({
    exists: opts.existing !== null && opts.existing !== undefined,
    data: () => opts.existing ?? undefined,
  });
  const txSet = vi.fn();
  const txUpdate = vi.fn();
  const runTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({ get: txGet, set: txSet, update: txUpdate });
  });
  const db = {
    doc: vi.fn(() => docRef),
    runTransaction,
  };
  return { db, docRef, txGet, txSet, txUpdate };
}

describe('reserveDailyQuotaSlot', () => {
  beforeEach(() => {
    getAdminFirestoreMock.mockReset();
    recordDailyQuotaUsageMock.mockReset();
    delete process.env.DAILY_AUDIT_LIMIT;
    vi.useFakeTimers();
    // 2026-05-17T11:30:00Z — task assignment time, UTC midnight is the bucket
    // boundary, so this falls in the 2026-05-17 bucket.
    vi.setSystemTime(new Date('2026-05-17T11:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.DAILY_AUDIT_LIMIT;
  });

  it('under cap: increments counter and returns allowed=true with bucket info', async () => {
    const fs = makeFs({ existing: { count: 5, max: 1000 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveDailyQuotaSlot } = await import('./daily-quota.js');

    const result = await reserveDailyQuotaSlot();

    expect(result.allowed).toBe(true);
    expect(result.bucketId).toBe('2026-05-17');
    expect(result.count).toBe(6);
    expect(result.max).toBe(1000);
    expect(fs.db.doc).toHaveBeenCalledWith('system/quota/daily/2026-05-17');
    expect(fs.txUpdate).toHaveBeenCalledTimes(1);
    expect(fs.txSet).not.toHaveBeenCalled();
  });

  it('at cap: refuses to increment and returns allowed=false with same count', async () => {
    const fs = makeFs({ existing: { count: 1000, max: 1000 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveDailyQuotaSlot } = await import('./daily-quota.js');

    const result = await reserveDailyQuotaSlot();

    expect(result.allowed).toBe(false);
    expect(result.count).toBe(1000);
    expect(result.max).toBe(1000);
    expect(fs.txUpdate).not.toHaveBeenCalled();
    expect(fs.txSet).not.toHaveBeenCalled();
  });

  it('over cap (race-carried): refuses; existing count exceeds max but not double-billed', async () => {
    const fs = makeFs({ existing: { count: 1001, max: 1000 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveDailyQuotaSlot } = await import('./daily-quota.js');

    const result = await reserveDailyQuotaSlot();

    expect(result.allowed).toBe(false);
    expect(result.count).toBe(1001);
    expect(fs.txUpdate).not.toHaveBeenCalled();
  });

  it('first run of the day: creates the bucket doc with count=1 and stored max', async () => {
    const fs = makeFs({ existing: null });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveDailyQuotaSlot } = await import('./daily-quota.js');

    const result = await reserveDailyQuotaSlot();

    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    expect(result.max).toBe(1000);
    expect(fs.txSet).toHaveBeenCalledTimes(1);
    const setPayload = fs.txSet.mock.calls[0]![1];
    expect(setPayload).toMatchObject({ count: 1, max: 1000 });
    expect(fs.txUpdate).not.toHaveBeenCalled();
  });

  it('DAILY_AUDIT_LIMIT env override: respects the lower cap', async () => {
    process.env.DAILY_AUDIT_LIMIT = '3';
    const fs = makeFs({ existing: { count: 3, max: 3 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveDailyQuotaSlot } = await import('./daily-quota.js');

    const result = await reserveDailyQuotaSlot();

    expect(result.allowed).toBe(false);
    expect(result.max).toBe(3);
  });

  it('DAILY_AUDIT_LIMIT env override: lower limit takes precedence over stored max', async () => {
    // Operator lowered the cap mid-day. Stored max=1000 but env says 50 — the
    // new env value should win so a lower limit is enforced immediately.
    process.env.DAILY_AUDIT_LIMIT = '50';
    const fs = makeFs({ existing: { count: 60, max: 1000 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveDailyQuotaSlot } = await import('./daily-quota.js');

    const result = await reserveDailyQuotaSlot();

    expect(result.allowed).toBe(false);
    expect(result.max).toBe(50);
  });

  it('invalid DAILY_AUDIT_LIMIT env: falls back to default 1000', async () => {
    process.env.DAILY_AUDIT_LIMIT = 'not-a-number';
    const fs = makeFs({ existing: { count: 5, max: 1000 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveDailyQuotaSlot } = await import('./daily-quota.js');

    const result = await reserveDailyQuotaSlot();

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(1000);
  });

  it('bucket id rolls over at UTC midnight (different day → different doc path)', async () => {
    vi.setSystemTime(new Date('2026-05-18T00:00:01.000Z'));
    const fs = makeFs({ existing: null });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveDailyQuotaSlot } = await import('./daily-quota.js');

    const result = await reserveDailyQuotaSlot();

    expect(result.bucketId).toBe('2026-05-18');
    expect(fs.db.doc).toHaveBeenCalledWith('system/quota/daily/2026-05-18');
    expect(result.allowed).toBe(true);
  });

  // T1.1c-FU — verify the metric emit wires up correctly. The emitter itself
  // is exercised in observability/metrics.test.ts; here we only assert the
  // contract: (post-count, effective max, bucket id) are forwarded.
  it('emits daily quota usage metric on allow path (count, max, bucketId)', async () => {
    const fs = makeFs({ existing: { count: 42, max: 1000 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveDailyQuotaSlot } = await import('./daily-quota.js');

    await reserveDailyQuotaSlot();

    expect(recordDailyQuotaUsageMock).toHaveBeenCalledTimes(1);
    expect(recordDailyQuotaUsageMock).toHaveBeenCalledWith(
      43,
      1000,
      '2026-05-17',
    );
  });

  it('emits daily quota usage metric on deny path (read-only count, no double-billed)', async () => {
    // At-cap path — emit should still happen so the dashboard reflects the
    // instantaneous bucket state. Count must be the read-only value (not +1).
    const fs = makeFs({ existing: { count: 1000, max: 1000 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveDailyQuotaSlot } = await import('./daily-quota.js');

    await reserveDailyQuotaSlot();

    expect(recordDailyQuotaUsageMock).toHaveBeenCalledTimes(1);
    expect(recordDailyQuotaUsageMock).toHaveBeenCalledWith(
      1000,
      1000,
      '2026-05-17',
    );
  });
});
