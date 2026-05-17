// Unit tests for the per-IP rate limit guardrail (T1.1a).
//
// Strategy mirrors daily-quota.test.ts: mock Admin Firestore + exercise the
// transaction branches (under-cap allow, at-cap reject, first-of-minute init,
// env override). Also covers IP-key sanitisation (XFF first-hop, IPv6,
// path-separator scrubbing, sentinel for missing IP).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminFirestoreMock } = vi.hoisted(() => ({
  getAdminFirestoreMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: getAdminFirestoreMock,
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
  const docRef = { path: 'system/rate-limit/per-ip/2026-05-17T11:30/ips/1.2.3.4' };
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

describe('normaliseIpKey', () => {
  it('returns "unknown" sentinel when input is null/undefined/empty', async () => {
    const { normaliseIpKey } = await import('./per-ip-rate-limit.js');
    expect(normaliseIpKey(null)).toBe('unknown');
    expect(normaliseIpKey(undefined)).toBe('unknown');
    expect(normaliseIpKey('')).toBe('unknown');
    expect(normaliseIpKey('   ')).toBe('unknown');
  });

  it('extracts the first hop from an x-forwarded-for chain', async () => {
    const { normaliseIpKey } = await import('./per-ip-rate-limit.js');
    expect(normaliseIpKey('1.2.3.4, 10.0.0.1, 172.16.0.1')).toBe('1.2.3.4');
  });

  it('preserves IPv6 (colon) and IPv4 (dot) characters', async () => {
    const { normaliseIpKey } = await import('./per-ip-rate-limit.js');
    expect(normaliseIpKey('2001:db8::1')).toBe('2001:db8::1');
    expect(normaliseIpKey('192.168.1.1')).toBe('192.168.1.1');
  });

  it('scrubs path-separators and other Firestore-unsafe chars', async () => {
    const { normaliseIpKey } = await import('./per-ip-rate-limit.js');
    // Attempt to escape the doc id with '/' or '..' must be neutralised.
    expect(normaliseIpKey('1.2.3.4/../secret')).toBe('1.2.3.4_.._secret');
    expect(normaliseIpKey('../../etc/passwd')).toBe('etc_passwd');
  });

  it('caps the key length to 100 chars (defensive against absurd headers)', async () => {
    const { normaliseIpKey } = await import('./per-ip-rate-limit.js');
    const long = 'a'.repeat(500);
    expect(normaliseIpKey(long).length).toBe(100);
  });
});

describe('reserveIpSlot', () => {
  beforeEach(() => {
    getAdminFirestoreMock.mockReset();
    delete process.env.RATE_LIMIT_PER_IP_PER_MIN;
    vi.useFakeTimers();
    // 2026-05-17T11:30:15Z → minute bucket '2026-05-17T11:30', 45s left in window.
    vi.setSystemTime(new Date('2026-05-17T11:30:15.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.RATE_LIMIT_PER_IP_PER_MIN;
  });

  it('under cap: increments counter and returns allowed=true with bucket info', async () => {
    const fs = makeFs({ existing: { count: 3, max: 10 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveIpSlot } = await import('./per-ip-rate-limit.js');

    const result = await reserveIpSlot('1.2.3.4');

    expect(result.allowed).toBe(true);
    expect(result.bucketId).toBe('2026-05-17T11:30');
    expect(result.ipKey).toBe('1.2.3.4');
    expect(result.count).toBe(4);
    expect(result.max).toBe(10);
    expect(result.retryAfterSeconds).toBe(45);
    expect(fs.db.doc).toHaveBeenCalledWith(
      'system/rate-limit/per-ip/2026-05-17T11:30/ips/1.2.3.4',
    );
    expect(fs.txUpdate).toHaveBeenCalledTimes(1);
    expect(fs.txSet).not.toHaveBeenCalled();
  });

  it('at cap: refuses to increment and returns allowed=false with same count', async () => {
    const fs = makeFs({ existing: { count: 10, max: 10 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveIpSlot } = await import('./per-ip-rate-limit.js');

    const result = await reserveIpSlot('1.2.3.4');

    expect(result.allowed).toBe(false);
    expect(result.count).toBe(10);
    expect(result.max).toBe(10);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(fs.txUpdate).not.toHaveBeenCalled();
    expect(fs.txSet).not.toHaveBeenCalled();
  });

  it('first request of the minute: creates the bucket doc with count=1 and ipKey', async () => {
    const fs = makeFs({ existing: null });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveIpSlot } = await import('./per-ip-rate-limit.js');

    const result = await reserveIpSlot('1.2.3.4');

    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    expect(result.max).toBe(10);
    expect(fs.txSet).toHaveBeenCalledTimes(1);
    const setPayload = fs.txSet.mock.calls[0]![1];
    expect(setPayload).toMatchObject({ count: 1, max: 10, ipKey: '1.2.3.4' });
    expect(fs.txUpdate).not.toHaveBeenCalled();
  });

  it('RATE_LIMIT_PER_IP_PER_MIN env override: lower cap takes precedence', async () => {
    process.env.RATE_LIMIT_PER_IP_PER_MIN = '2';
    const fs = makeFs({ existing: { count: 2, max: 10 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveIpSlot } = await import('./per-ip-rate-limit.js');

    const result = await reserveIpSlot('1.2.3.4');

    expect(result.allowed).toBe(false);
    expect(result.max).toBe(2);
    expect(fs.txUpdate).not.toHaveBeenCalled();
  });

  it('invalid RATE_LIMIT_PER_IP_PER_MIN env: falls back to default 10', async () => {
    process.env.RATE_LIMIT_PER_IP_PER_MIN = 'not-a-number';
    const fs = makeFs({ existing: { count: 5, max: 10 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveIpSlot } = await import('./per-ip-rate-limit.js');

    const result = await reserveIpSlot('1.2.3.4');

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(10);
  });

  it('bucket id rolls over at the next UTC minute', async () => {
    vi.setSystemTime(new Date('2026-05-17T11:31:00.000Z'));
    const fs = makeFs({ existing: null });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveIpSlot } = await import('./per-ip-rate-limit.js');

    const result = await reserveIpSlot('1.2.3.4');

    expect(result.bucketId).toBe('2026-05-17T11:31');
    expect(fs.db.doc).toHaveBeenCalledWith(
      'system/rate-limit/per-ip/2026-05-17T11:31/ips/1.2.3.4',
    );
  });

  it('null IP falls into the shared "unknown" bucket (local dev, missing header)', async () => {
    const fs = makeFs({ existing: { count: 5, max: 10 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveIpSlot } = await import('./per-ip-rate-limit.js');

    const result = await reserveIpSlot(null);

    expect(result.ipKey).toBe('unknown');
    expect(fs.db.doc).toHaveBeenCalledWith(
      'system/rate-limit/per-ip/2026-05-17T11:30/ips/unknown',
    );
    expect(result.allowed).toBe(true);
  });

  it('retryAfterSeconds clamps to >= 1 at end-of-minute boundary', async () => {
    // 0ms before the minute rollover → naive ceil would give 0; helper must clamp.
    vi.setSystemTime(new Date('2026-05-17T11:30:59.999Z'));
    const fs = makeFs({ existing: { count: 10, max: 10 } });
    getAdminFirestoreMock.mockReturnValue(fs.db);
    const { reserveIpSlot } = await import('./per-ip-rate-limit.js');

    const result = await reserveIpSlot('1.2.3.4');

    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
