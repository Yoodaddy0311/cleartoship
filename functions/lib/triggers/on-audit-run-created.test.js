"use strict";
// Tests for the Firestore onCreate trigger that enqueues audit tasks.
//
// Strategy:
//   - Mock `firebase-functions/v2/firestore` so `onDocumentCreated` returns the
//     supplied handler verbatim — the test can invoke it directly with a
//     synthetic event.
//   - Mock `../lib/enqueue-audit-task.js` so we can assert payload shape and
//     toggle error paths without touching real Cloud Tasks.
//   - Stub env vars (FUNCTIONS_EMULATOR / CLOUD_TASKS_PROJECT / AUDIT_WORKER_URL)
//     in beforeEach and unstub in afterEach so tests stay independent.
//   - Each test imports the trigger module dynamically AFTER env is configured
//     because the module reads env at load-time and caches them in top-level
//     consts.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const enqueueMock = vitest_1.vi.fn();
const handlerCapture = { fn: null };
vitest_1.vi.mock('firebase-functions/v2/firestore', () => ({
    onDocumentCreated: (_opts, handler) => {
        handlerCapture.fn = handler;
        return handler;
    },
}));
vitest_1.vi.mock('../lib/enqueue-audit-task.js', () => ({
    enqueueAuditTask: enqueueMock,
}));
// Mock firebase-admin/firestore so `FieldValue.serverTimestamp()` resolves
// without bootstrapping the real Admin SDK. The trigger calls it when writing
// the enqueueMode update; we just need a sentinel the assertions can compare.
const SERVER_TIMESTAMP = Symbol('serverTimestamp');
vitest_1.vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: () => SERVER_TIMESTAMP,
    },
}));
// makeEvent now also stitches a mock DocumentReference onto `event.data.ref`
// so the trigger's post-enqueue `ref.update(...)` call can be asserted. Tests
// that don't care about the update can ignore `updateMock`; tests that do
// (the enqueueMode-persistence cases below) read it back via the returned
// object.
function makeEvent(runId, data) {
    // Use untyped `vi.fn()` so its inferred Mock signature matches the looser
    // `ReturnType<typeof vi.fn>` shape the FakeEvent interface expects. Typing
    // it as `vi.fn(async () => undefined)` narrows the return to `Promise<undefined>`
    // which vitest's Mock<any[], unknown> doesn't assign to.
    const updateMock = vitest_1.vi.fn();
    updateMock.mockResolvedValue(undefined);
    return {
        params: { runId },
        data: data === undefined
            ? undefined
            : { data: () => data, ref: { update: updateMock } },
        updateMock,
    };
}
const VALID_DATA = {
    ownerId: 'owner-1',
    projectId: 'proj-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: 'https://example.com',
    prdText: 'PRD body',
};
// Snapshot of relevant env vars so we can restore between tests. The trigger
// reads env at import time, so we re-import the module in each test after
// configuring env to control which branch is taken.
const ENV_KEYS = [
    'FUNCTIONS_EMULATOR',
    'CLOUD_TASKS_PROJECT',
    'GCP_PROJECT',
    'AUDIT_WORKER_URL',
    'AUDIT_WORKER_INVOKER_SA',
    'CLOUD_TASKS_LOCATION',
    'CLOUD_TASKS_QUEUE',
];
(0, vitest_1.describe)('onAuditRunCreated trigger', () => {
    const original = {};
    (0, vitest_1.beforeEach)(() => {
        for (const k of ENV_KEYS)
            original[k] = process.env[k];
        enqueueMock.mockReset();
        handlerCapture.fn = null;
        vitest_1.vi.resetModules();
    });
    (0, vitest_1.afterEach)(() => {
        for (const k of ENV_KEYS) {
            if (original[k] === undefined)
                delete process.env[k];
            else
                process.env[k] = original[k];
        }
        vitest_1.vi.restoreAllMocks();
    });
    async function loadTrigger() {
        const mod = await Promise.resolve().then(() => __importStar(require('./on-audit-run-created.js')));
        // Side-effect: importing registers the handler via onDocumentCreated mock.
        return mod;
    }
    (0, vitest_1.it)('production: invokes enqueueAuditTask with correctly-shaped payload', async () => {
        process.env.FUNCTIONS_EMULATOR = 'false';
        process.env.CLOUD_TASKS_PROJECT = 'demo';
        process.env.AUDIT_WORKER_URL = 'https://worker.example.com';
        process.env.AUDIT_WORKER_INVOKER_SA = 'invoker@demo.iam.gserviceaccount.com';
        enqueueMock.mockResolvedValueOnce({
            taskName: 'projects/demo/locations/asia-northeast3/queues/audit-jobs/tasks/audit-run-1',
            deduped: false,
        });
        await loadTrigger();
        (0, vitest_1.expect)(handlerCapture.fn).not.toBeNull();
        await handlerCapture.fn(makeEvent('run-1', VALID_DATA));
        (0, vitest_1.expect)(enqueueMock).toHaveBeenCalledTimes(1);
        const [payload, config] = enqueueMock.mock.calls[0];
        (0, vitest_1.expect)(payload).toEqual({
            runId: 'run-1',
            projectId: 'proj-1',
            ownerId: 'owner-1',
            repoUrl: 'https://github.com/example/repo',
            deployUrl: 'https://example.com',
            prdText: 'PRD body',
            commitHash: null,
        });
        (0, vitest_1.expect)(config.project).toBe('demo');
        (0, vitest_1.expect)(config.workerUrl).toBe('https://worker.example.com');
        (0, vitest_1.expect)(config.invokerSa).toBe('invoker@demo.iam.gserviceaccount.com');
    });
    (0, vitest_1.it)('emulator: takes the emulator branch even when CLOUD_TASKS_PROJECT is unset', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        delete process.env.CLOUD_TASKS_PROJECT;
        delete process.env.GCP_PROJECT;
        process.env.AUDIT_WORKER_URL = 'https://worker.local';
        enqueueMock.mockResolvedValueOnce({
            taskName: 'dev-direct-run-2-xyz',
            deduped: false,
        });
        await loadTrigger();
        await handlerCapture.fn(makeEvent('run-2', VALID_DATA));
        (0, vitest_1.expect)(enqueueMock).toHaveBeenCalledTimes(1);
        const [, config] = enqueueMock.mock.calls[0];
        (0, vitest_1.expect)(config.project).toBe(''); // empty in emulator mode
        (0, vitest_1.expect)(config.workerUrl).toBe('https://worker.local');
    });
    (0, vitest_1.it)('production without CLOUD_TASKS_PROJECT: skips enqueue (does NOT call helper)', async () => {
        process.env.FUNCTIONS_EMULATOR = 'false';
        delete process.env.CLOUD_TASKS_PROJECT;
        delete process.env.GCP_PROJECT;
        process.env.AUDIT_WORKER_URL = 'https://worker.example.com';
        await loadTrigger();
        await handlerCapture.fn(makeEvent('run-3', VALID_DATA));
        (0, vitest_1.expect)(enqueueMock).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('missing AUDIT_WORKER_URL: skips enqueue regardless of mode', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        delete process.env.AUDIT_WORKER_URL;
        await loadTrigger();
        await handlerCapture.fn(makeEvent('run-4', VALID_DATA));
        (0, vitest_1.expect)(enqueueMock).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('missing required fields (no ownerId): does not enqueue', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        process.env.AUDIT_WORKER_URL = 'https://worker.local';
        await loadTrigger();
        await handlerCapture.fn(makeEvent('run-5', { projectId: 'p', repoUrl: 'https://github.com/x/y' }));
        (0, vitest_1.expect)(enqueueMock).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('empty snapshot data: returns early without throwing', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        process.env.AUDIT_WORKER_URL = 'https://worker.local';
        await loadTrigger();
        await (0, vitest_1.expect)(handlerCapture.fn(makeEvent('run-6', undefined))).resolves.toBeUndefined();
        (0, vitest_1.expect)(enqueueMock).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('omits optional deployUrl/prdText as null when absent', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        process.env.AUDIT_WORKER_URL = 'https://worker.local';
        enqueueMock.mockResolvedValueOnce({ taskName: 'name', deduped: false });
        await loadTrigger();
        await handlerCapture.fn(makeEvent('run-7', {
            ownerId: 'o',
            projectId: 'p',
            repoUrl: 'https://github.com/x/y',
        }));
        const [payload] = enqueueMock.mock.calls[0];
        (0, vitest_1.expect)(payload.deployUrl).toBeNull();
        (0, vitest_1.expect)(payload.prdText).toBeNull();
        (0, vitest_1.expect)(payload.commitHash).toBeNull();
    });
    (0, vitest_1.it)('enqueue helper throws: error is re-thrown to surface to retry policy', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        process.env.AUDIT_WORKER_URL = 'https://worker.local';
        enqueueMock.mockRejectedValueOnce(new Error('cloud tasks boom'));
        const stderrSpy = vitest_1.vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        await loadTrigger();
        await (0, vitest_1.expect)(handlerCapture.fn(makeEvent('run-8', VALID_DATA))).rejects.toThrow('cloud tasks boom');
        // Error path should log at least once before re-throwing.
        (0, vitest_1.expect)(stderrSpy).toHaveBeenCalled();
        stderrSpy.mockRestore();
    });
    (0, vitest_1.it)('deduped result logs the dedupe message (no throw)', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        process.env.AUDIT_WORKER_URL = 'https://worker.local';
        enqueueMock.mockResolvedValueOnce({ taskName: 'name', deduped: true });
        const stderrSpy = vitest_1.vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        await loadTrigger();
        await handlerCapture.fn(makeEvent('run-9', VALID_DATA));
        const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
        (0, vitest_1.expect)(logged).toContain('already enqueued');
        stderrSpy.mockRestore();
    });
    // -------------------------------------------------------------------------
    // enqueueMode persistence (Task J — symmetry with direct API path).
    // The trigger writes back the dispatch route onto the AuditRun doc so the
    // read side can tell which path handled the run. These cases exercise the
    // three branches (cloud-tasks / direct-worker / stub) plus the idempotency
    // guard that prevents double-enqueue when the direct API path raced ahead.
    // -------------------------------------------------------------------------
    (0, vitest_1.it)('persists enqueueMode = "cloud-tasks" on production enqueue success', async () => {
        process.env.FUNCTIONS_EMULATOR = 'false';
        process.env.CLOUD_TASKS_PROJECT = 'demo';
        process.env.AUDIT_WORKER_URL = 'https://worker.example.com';
        enqueueMock.mockResolvedValueOnce({
            taskName: 'projects/demo/locations/asia-northeast3/queues/audit-jobs/tasks/audit-run-ct',
            deduped: false,
        });
        await loadTrigger();
        const event = makeEvent('run-ct', VALID_DATA);
        await handlerCapture.fn(event);
        (0, vitest_1.expect)(event.updateMock).toHaveBeenCalledTimes(1);
        const updatePayload = event.updateMock.mock.calls[0][0];
        (0, vitest_1.expect)(updatePayload.enqueueMode).toBe('cloud-tasks');
        // serverTimestamp() must be attached so the converter sees a fresh
        // updatedAt — we mocked it to a sentinel symbol above.
        (0, vitest_1.expect)(updatePayload.updatedAt).toBeTypeOf('symbol');
    });
    (0, vitest_1.it)('persists enqueueMode = "direct-worker" on emulator/dev enqueue success', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        delete process.env.CLOUD_TASKS_PROJECT;
        delete process.env.GCP_PROJECT;
        process.env.AUDIT_WORKER_URL = 'https://worker.local';
        enqueueMock.mockResolvedValueOnce({
            taskName: 'dev-direct-run-dw-xyz',
            deduped: false,
        });
        await loadTrigger();
        const event = makeEvent('run-dw', VALID_DATA);
        await handlerCapture.fn(event);
        (0, vitest_1.expect)(event.updateMock).toHaveBeenCalledTimes(1);
        const updatePayload = event.updateMock.mock.calls[0][0];
        (0, vitest_1.expect)(updatePayload.enqueueMode).toBe('direct-worker');
    });
    (0, vitest_1.it)('persists enqueueMode = "stub" when AUDIT_WORKER_URL is unset (skipped enqueue)', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        delete process.env.AUDIT_WORKER_URL;
        await loadTrigger();
        const event = makeEvent('run-stub', VALID_DATA);
        await handlerCapture.fn(event);
        // Helper must NOT be called in the stub branch — the env pre-check is
        // what determines this; the helper would have to be invoked to even
        // attempt a real dispatch.
        (0, vitest_1.expect)(enqueueMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(event.updateMock).toHaveBeenCalledTimes(1);
        const updatePayload = event.updateMock.mock.calls[0][0];
        (0, vitest_1.expect)(updatePayload.enqueueMode).toBe('stub');
    });
    (0, vitest_1.it)('persists enqueueMode = "stub" when production has no CLOUD_TASKS_PROJECT', async () => {
        process.env.FUNCTIONS_EMULATOR = 'false';
        delete process.env.CLOUD_TASKS_PROJECT;
        delete process.env.GCP_PROJECT;
        process.env.AUDIT_WORKER_URL = 'https://worker.example.com';
        await loadTrigger();
        const event = makeEvent('run-stub-prod', VALID_DATA);
        await handlerCapture.fn(event);
        (0, vitest_1.expect)(enqueueMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(event.updateMock).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(event.updateMock.mock.calls[0][0]).toMatchObject({ enqueueMode: 'stub' });
    });
    (0, vitest_1.it)('idempotency: when enqueueMode is already set, does NOT enqueue or update', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        process.env.AUDIT_WORKER_URL = 'https://worker.local';
        await loadTrigger();
        const event = makeEvent('run-already', {
            ...VALID_DATA,
            // Simulates the direct API path having raced ahead and stamped the run.
            enqueueMode: 'cloud-tasks',
        });
        await handlerCapture.fn(event);
        (0, vitest_1.expect)(enqueueMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(event.updateMock).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('idempotency: null enqueueMode is treated as "not set" and trigger proceeds', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        process.env.AUDIT_WORKER_URL = 'https://worker.local';
        enqueueMock.mockResolvedValueOnce({ taskName: 'name', deduped: false });
        await loadTrigger();
        const event = makeEvent('run-null', { ...VALID_DATA, enqueueMode: null });
        await handlerCapture.fn(event);
        (0, vitest_1.expect)(enqueueMock).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(event.updateMock).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(event.updateMock.mock.calls[0][0]).toMatchObject({ enqueueMode: 'direct-worker' });
    });
    (0, vitest_1.it)('persistEnqueueMode failure is swallowed (does not re-throw from handler)', async () => {
        process.env.FUNCTIONS_EMULATOR = 'true';
        process.env.AUDIT_WORKER_URL = 'https://worker.local';
        enqueueMock.mockResolvedValueOnce({ taskName: 'name', deduped: false });
        const stderrSpy = vitest_1.vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        await loadTrigger();
        const event = makeEvent('run-update-fail', VALID_DATA);
        event.updateMock.mockRejectedValueOnce(new Error('firestore offline'));
        // The enqueue itself succeeded; failing to label the doc must not poison
        // the handler — otherwise Functions retries and we risk double dispatch.
        await (0, vitest_1.expect)(handlerCapture.fn(event)).resolves.toBeUndefined();
        const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
        (0, vitest_1.expect)(logged).toContain('Failed to persist enqueueMode');
        stderrSpy.mockRestore();
    });
});
//# sourceMappingURL=on-audit-run-created.test.js.map