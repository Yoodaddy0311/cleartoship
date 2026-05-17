"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const BATCH_SIZE = 500;
vitest_1.vi.mock('firebase-functions/v2/scheduler', () => ({
    onSchedule: (_opts, handler) => handler,
}));
const queues = { events: [], users: [] };
const commitSpy = vitest_1.vi.fn(async () => undefined);
const deleteSpy = vitest_1.vi.fn();
function makeSnapshot(size) {
    const docs = Array.from({ length: size }, (_, i) => ({
        ref: { id: `doc-${i}` },
    }));
    return { empty: size === 0, size, docs };
}
function makeQuery(source) {
    const query = {
        where: () => query,
        limit: () => query,
        get: async () => {
            const next = queues[source].shift();
            if (!next)
                return makeSnapshot(0);
            return next;
        },
    };
    return query;
}
vitest_1.vi.mock('firebase-admin/firestore', () => {
    const db = {
        collectionGroup: () => makeQuery('events'),
        collection: (name) => {
            if (name === 'users')
                return makeQuery('users');
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
            fromMillis: (ms) => ({ _seconds: Math.floor(ms / 1000) }),
        },
    };
});
const daily_cleanup_js_1 = require("../triggers/daily-cleanup.js");
(0, vitest_1.describe)('dailyCleanup', () => {
    (0, vitest_1.beforeEach)(() => {
        queues.events.length = 0;
        queues.users.length = 0;
        commitSpy.mockClear();
        deleteSpy.mockClear();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('progressEvents under-batch: terminates after one commit when size < BATCH_SIZE', async () => {
        queues.events.push(makeSnapshot(42));
        await daily_cleanup_js_1.dailyCleanup();
        (0, vitest_1.expect)(commitSpy).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(deleteSpy).toHaveBeenCalledTimes(42);
        (0, vitest_1.expect)(queues.events.length).toBe(0);
    });
    (0, vitest_1.it)('progressEvents over-batch: paginates and stops on smaller tail', async () => {
        queues.events.push(makeSnapshot(BATCH_SIZE));
        queues.events.push(makeSnapshot(17));
        await daily_cleanup_js_1.dailyCleanup();
        (0, vitest_1.expect)(commitSpy).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(deleteSpy).toHaveBeenCalledTimes(BATCH_SIZE + 17);
    });
    (0, vitest_1.it)('both empty: returns without committing', async () => {
        await daily_cleanup_js_1.dailyCleanup();
        (0, vitest_1.expect)(commitSpy).not.toHaveBeenCalled();
        (0, vitest_1.expect)(deleteSpy).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('anonymous-user cleanup: deletes idle users in batches', async () => {
        queues.users.push(makeSnapshot(7));
        await daily_cleanup_js_1.dailyCleanup();
        (0, vitest_1.expect)(commitSpy).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(deleteSpy).toHaveBeenCalledTimes(7);
    });
    (0, vitest_1.it)('combined: progressEvents + anonymous users run independently', async () => {
        queues.events.push(makeSnapshot(13));
        queues.users.push(makeSnapshot(5));
        await daily_cleanup_js_1.dailyCleanup();
        (0, vitest_1.expect)(commitSpy).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(deleteSpy).toHaveBeenCalledTimes(18);
    });
});
//# sourceMappingURL=daily-cleanup.test.js.map