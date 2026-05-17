"use strict";
// Tests for the emulator-bypass branch of enqueueAuditTask.
//
// The Cloud Tasks happy-path + ALREADY_EXISTS dedupe path is covered by
// `functions/src/__tests__/enqueue-audit-task.test.ts`. This sibling file
// targets the previously-untested branch:
//   - isEmulatorOrDev() => true when FUNCTIONS_EMULATOR === 'true'
//   - postDirectlyToWorker() => HTTP POST to {workerUrl}/run with
//     Content-Type: application/json + X-Dev-Mode: 1 + serialized payload
//   - Failed fetch is swallowed (warn log via stderr), function still resolves
//
// We exercise these helpers through the public `enqueueAuditTask` entry point
// because the helpers are intentionally module-private. `FUNCTIONS_EMULATOR`
// is stubbed and restored in afterEach so subsequent tests are unaffected.
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
const PAYLOAD = {
    runId: 'run-emu-1',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: null,
    prdText: null,
    commitHash: null,
};
const CONFIG = {
    project: 'demo',
    location: 'asia-northeast3',
    queue: 'audit-jobs',
    workerUrl: 'https://worker.example.com/',
};
(0, vitest_1.describe)('enqueueAuditTask — emulator bypass (postDirectlyToWorker)', () => {
    const originalEmu = process.env.FUNCTIONS_EMULATOR;
    let fetchMock;
    (0, vitest_1.beforeEach)(() => {
        fetchMock = vitest_1.vi.fn(async () => new Response('ok', { status: 200 }));
        vitest_1.vi.stubGlobal('fetch', fetchMock);
        vitest_1.vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllGlobals();
        vitest_1.vi.unstubAllEnvs();
        if (originalEmu === undefined) {
            delete process.env.FUNCTIONS_EMULATOR;
        }
        else {
            process.env.FUNCTIONS_EMULATOR = originalEmu;
        }
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)('POSTs directly to {workerUrl}/run with JSON body and X-Dev-Mode header', async () => {
        const { enqueueAuditTask } = await Promise.resolve().then(() => __importStar(require('./enqueue-audit-task.js')));
        const result = await enqueueAuditTask(PAYLOAD, CONFIG);
        (0, vitest_1.expect)(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('https://worker.example.com/run');
        (0, vitest_1.expect)(init.method).toBe('POST');
        const headers = init.headers;
        (0, vitest_1.expect)(headers['Content-Type']).toBe('application/json');
        (0, vitest_1.expect)(headers['X-Dev-Mode']).toBe('1');
        (0, vitest_1.expect)(typeof init.body).toBe('string');
        (0, vitest_1.expect)(JSON.parse(init.body)).toEqual(PAYLOAD);
        (0, vitest_1.expect)(result.deduped).toBe(false);
        (0, vitest_1.expect)(result.taskName).toMatch(/^dev-direct-run-emu-1-/);
    });
    (0, vitest_1.it)('strips trailing slashes from workerUrl before appending /run', async () => {
        const { enqueueAuditTask } = await Promise.resolve().then(() => __importStar(require('./enqueue-audit-task.js')));
        await enqueueAuditTask(PAYLOAD, { ...CONFIG, workerUrl: 'https://worker.example.com///' });
        const [url] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('https://worker.example.com/run');
    });
    (0, vitest_1.it)('swallows fetch errors (fire-and-forget) and still returns a result', async () => {
        fetchMock.mockRejectedValueOnce(new Error('connection refused'));
        const stderrSpy = vitest_1.vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        const { enqueueAuditTask } = await Promise.resolve().then(() => __importStar(require('./enqueue-audit-task.js')));
        const result = await enqueueAuditTask(PAYLOAD, CONFIG);
        (0, vitest_1.expect)(result.deduped).toBe(false);
        (0, vitest_1.expect)(result.taskName).toMatch(/^dev-direct-run-emu-1-/);
        (0, vitest_1.expect)(stderrSpy).toHaveBeenCalled();
        const logged = String(stderrSpy.mock.calls[0]?.[0] ?? '');
        (0, vitest_1.expect)(logged).toContain('Dev direct POST to worker failed');
        stderrSpy.mockRestore();
    });
});
(0, vitest_1.describe)('enqueueAuditTask — isEmulatorOrDev gate', () => {
    const originalEmu = process.env.FUNCTIONS_EMULATOR;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.stubGlobal('fetch', vitest_1.vi.fn(async () => new Response('ok', { status: 200 })));
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllGlobals();
        vitest_1.vi.unstubAllEnvs();
        if (originalEmu === undefined) {
            delete process.env.FUNCTIONS_EMULATOR;
        }
        else {
            process.env.FUNCTIONS_EMULATOR = originalEmu;
        }
    });
    (0, vitest_1.it)('does NOT take the direct-POST branch when FUNCTIONS_EMULATOR is unset', async () => {
        vitest_1.vi.stubEnv('FUNCTIONS_EMULATOR', '');
        const { enqueueAuditTask, __resetClientForTests } = await Promise.resolve().then(() => __importStar(require('./enqueue-audit-task.js')));
        const createTask = vitest_1.vi.fn(async () => [
            { name: 'projects/demo/locations/asia-northeast3/queues/audit-jobs/tasks/audit-run-emu-1' },
        ]);
        __resetClientForTests({
            queuePath: (p, l, q) => `projects/${p}/locations/${l}/queues/${q}`,
            createTask,
        });
        await enqueueAuditTask(PAYLOAD, CONFIG);
        (0, vitest_1.expect)(createTask).toHaveBeenCalledTimes(1);
        // fetch must NOT have been called because we didn't take the emu branch.
        (0, vitest_1.expect)(globalThis.fetch.mock.calls.length).toBe(0);
        __resetClientForTests(null);
    });
    (0, vitest_1.it)('takes the direct-POST branch when FUNCTIONS_EMULATOR === "true"', async () => {
        vitest_1.vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
        const { enqueueAuditTask } = await Promise.resolve().then(() => __importStar(require('./enqueue-audit-task.js')));
        await enqueueAuditTask(PAYLOAD, CONFIG);
        (0, vitest_1.expect)(globalThis.fetch.mock.calls.length).toBe(1);
    });
});
//# sourceMappingURL=enqueue-audit-task.test.js.map