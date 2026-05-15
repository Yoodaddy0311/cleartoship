// Tests for daily-cleanup scheduler trigger.
//
// Strategy:
//   - Mock `firebase-functions/v2/scheduler` so onSchedule returns the
//     supplied handler verbatim — the test can invoke it directly.
//   - Mock `firebase-admin/firestore` with a per-query stub. Each test pushes
//     queue entries keyed by source ('events' for progressEvents, 'users' for
//     anonymous-user cleanup) so we can exercise the two pagination loops
//     independently.
//   - Verify:
//       1. under-batch case (size < BATCH_SIZE in first iteration) → loop
//          terminates after a single commit, total = chunk size.
//       2. over-batch case (size == BATCH_SIZE then a smaller tail) →
//          loop iterates twice, total = sum of chunks.
//       3. empty progressEvents + anonymous user delete still runs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BATCH_SIZE = 500;

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));

interface FakeDoc {
  ref: { id: string };
}

interface FakeSnapshot {
  empty: boolean;
  size: number;
  docs: FakeDoc[];
}

type Source = 'events' | 'users';

const queues: Record<Source, FakeSnapshot[]> = { events: [], users: [] };
const commitSpy = vi.fn(async () => undefined);
const deleteSpy = vi.fn();

function makeSnapshot(size: number): FakeSnapshot {
  const docs: FakeDoc[] = Array.from({ length: size }, (_, i) => ({
    ref: { id: `doc-${i}` },
  }));
  return { empty: size === 0, size, docs };
}

function makeQuery(source: Source) {
  const query: {
    where: () => typeof query;
    limit: () => typeof query;
    get: () => Promise<FakeSnapshot>;
  } = {
    where: () => query,
    limit: () => query,
    get: async () => {
      const next = queues[source].shift();
      if (!next) return makeSnapshot(0);
      return next;
    },
  };
  return query;
}

vi.mock('firebase-admin/firestore', () => {
  const db = {
    collectionGroup: () => makeQuery('events'),
    collection: (name: string) => {
      if (name === 'users') return makeQuery('users');
      throw new Error(`unexpected collection: ${name}`);
    },
    batch: () => ({
      delete: deleteSpy,
      commit: commitSpy,
    }),
  };

  return {
    getFirestore: () => db,
    Timestamp: {
      fromMillis: (ms: number) => ({ _seconds: Math.floor(ms / 1000) }),
    },
  };
});

import { dailyCleanup } from '../triggers/daily-cleanup.js';

describe('dailyCleanup', () => {
  beforeEach(() => {
    queues.events.length = 0;
    queues.users.length = 0;
    commitSpy.mockClear();
    deleteSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('progressEvents under-batch: terminates after one commit when size < BATCH_SIZE', async () => {
    queues.events.push(makeSnapshot(42));

    await (dailyCleanup as unknown as () => Promise<void>)();

    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledTimes(42);
    expect(queues.events.length).toBe(0);
  });

  it('progressEvents over-batch: paginates and stops on smaller tail', async () => {
    queues.events.push(makeSnapshot(BATCH_SIZE));
    queues.events.push(makeSnapshot(17));

    await (dailyCleanup as unknown as () => Promise<void>)();

    expect(commitSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).toHaveBeenCalledTimes(BATCH_SIZE + 17);
  });

  it('both empty: returns without committing', async () => {
    await (dailyCleanup as unknown as () => Promise<void>)();

    expect(commitSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('anonymous-user cleanup: deletes idle users in batches', async () => {
    queues.users.push(makeSnapshot(7));

    await (dailyCleanup as unknown as () => Promise<void>)();

    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledTimes(7);
  });

  it('combined: progressEvents + anonymous users run independently', async () => {
    queues.events.push(makeSnapshot(13));
    queues.users.push(makeSnapshot(5));

    await (dailyCleanup as unknown as () => Promise<void>)();

    expect(commitSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).toHaveBeenCalledTimes(18);
  });
});
