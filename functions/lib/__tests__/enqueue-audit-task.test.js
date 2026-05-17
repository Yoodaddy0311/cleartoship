"use strict";
// Tests for the Functions Cloud Tasks helper.
//
// Critical path: deterministic task name + ALREADY_EXISTS (gRPC code 6)
// dedupe — without this, racing the POST handler against the Firestore
// trigger would cause double-enqueue (and double audit execution).
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const enqueue_audit_task_js_1 = require("../lib/enqueue-audit-task.js");
const CONFIG = {
    project: 'demo',
    location: 'asia-northeast3',
    queue: 'audit-jobs',
    workerUrl: 'https://worker.example.com',
};
const PAYLOAD = {
    runId: 'run-123',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: null,
    prdText: null,
    commitHash: null,
};
const EXPECTED_QUEUE_PATH = 'projects/demo/locations/asia-northeast3/queues/audit-jobs';
const EXPECTED_TASK_NAME = `${EXPECTED_QUEUE_PATH}/tasks/audit-run-123`;
function makeMockClient(createTaskImpl) {
    return {
        queuePath: (p, l, q) => `projects/${p}/locations/${l}/queues/${q}`,
        createTask: vitest_1.vi.fn(createTaskImpl),
    };
}
(0, vitest_1.describe)('enqueueAuditTask', () => {
    // Spy on stdout to capture structured metric events without printing them
    // during the suite. process.stdout.write's overloaded signature trips
    // vitest's Mock generics, so we type as any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stdoutSpy;
    (0, vitest_1.beforeEach)(() => {
        (0, enqueue_audit_task_js_1.__resetClientForTests)(null);
        stdoutSpy = vitest_1.vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });
    (0, vitest_1.afterEach)(() => {
        stdoutSpy.mockRestore();
    });
    (0, vitest_1.it)('returns the task name and deduped=false on a fresh create', async () => {
        const mockClient = makeMockClient(async () => [{ name: EXPECTED_TASK_NAME }]);
        (0, enqueue_audit_task_js_1.__resetClientForTests)(mockClient);
        const result = await (0, enqueue_audit_task_js_1.enqueueAuditTask)(PAYLOAD, CONFIG);
        (0, vitest_1.expect)(result).toEqual({ taskName: EXPECTED_TASK_NAME, deduped: false });
        (0, vitest_1.expect)(mockClient.createTask).toHaveBeenCalledTimes(1);
        const call = mockClient.createTask.mock.calls[0]?.[0];
        (0, vitest_1.expect)(call.parent).toBe(EXPECTED_QUEUE_PATH);
        (0, vitest_1.expect)(call.task.name).toBe(EXPECTED_TASK_NAME);
        (0, vitest_1.expect)(call.task.httpRequest.url).toBe('https://worker.example.com/run');
    });
    (0, vitest_1.it)('emits audit_task.enqueue.created structured metric on a fresh create', async () => {
        const mockClient = makeMockClient(async () => [{ name: EXPECTED_TASK_NAME }]);
        (0, enqueue_audit_task_js_1.__resetClientForTests)(mockClient);
        await (0, enqueue_audit_task_js_1.enqueueAuditTask)(PAYLOAD, CONFIG);
        // Exactly one structured metric line emitted to stdout.
        const lines = stdoutSpy.mock.calls
            .map((c) => String(c[0]))
            .filter((l) => l.includes('audit_task.enqueue'));
        (0, vitest_1.expect)(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trim());
        (0, vitest_1.expect)(parsed.event).toBe('audit_task.enqueue.created');
        (0, vitest_1.expect)(parsed.runId).toBe('run-123');
        (0, vitest_1.expect)(parsed.taskName).toBe(EXPECTED_TASK_NAME);
        (0, vitest_1.expect)(typeof parsed.timestamp).toBe('string');
        // ISO 8601 sanity check
        (0, vitest_1.expect)(parsed.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
        // Metric must be a single line (Cloud Logging parses one JSON per line).
        (0, vitest_1.expect)(lines[0].endsWith('\n')).toBe(true);
        (0, vitest_1.expect)(lines[0].slice(0, -1)).not.toContain('\n');
    });
    (0, vitest_1.it)('swallows ALREADY_EXISTS (gRPC code 6) and returns deduped=true', async () => {
        const dupErr = Object.assign(new Error('Task name already exists'), { code: 6 });
        const mockClient = makeMockClient(async () => {
            throw dupErr;
        });
        (0, enqueue_audit_task_js_1.__resetClientForTests)(mockClient);
        const result = await (0, enqueue_audit_task_js_1.enqueueAuditTask)(PAYLOAD, CONFIG);
        (0, vitest_1.expect)(result).toEqual({ taskName: EXPECTED_TASK_NAME, deduped: true });
        (0, vitest_1.expect)(mockClient.createTask).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('emits audit_task.enqueue.deduped structured metric on ALREADY_EXISTS', async () => {
        const dupErr = Object.assign(new Error('Task name already exists'), { code: 6 });
        const mockClient = makeMockClient(async () => {
            throw dupErr;
        });
        (0, enqueue_audit_task_js_1.__resetClientForTests)(mockClient);
        await (0, enqueue_audit_task_js_1.enqueueAuditTask)(PAYLOAD, CONFIG);
        const lines = stdoutSpy.mock.calls
            .map((c) => String(c[0]))
            .filter((l) => l.includes('audit_task.enqueue'));
        (0, vitest_1.expect)(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trim());
        (0, vitest_1.expect)(parsed.event).toBe('audit_task.enqueue.deduped');
        (0, vitest_1.expect)(parsed.runId).toBe('run-123');
        (0, vitest_1.expect)(parsed.taskName).toBe(EXPECTED_TASK_NAME);
        (0, vitest_1.expect)(typeof parsed.timestamp).toBe('string');
    });
    (0, vitest_1.it)('re-throws any non-ALREADY_EXISTS error', async () => {
        const otherErr = Object.assign(new Error('Internal'), { code: 13 });
        const mockClient = makeMockClient(async () => {
            throw otherErr;
        });
        (0, enqueue_audit_task_js_1.__resetClientForTests)(mockClient);
        await (0, vitest_1.expect)((0, enqueue_audit_task_js_1.enqueueAuditTask)(PAYLOAD, CONFIG)).rejects.toThrow('Internal');
    });
    (0, vitest_1.it)('does NOT emit any metric event when a non-ALREADY_EXISTS error is thrown', async () => {
        const otherErr = Object.assign(new Error('Internal'), { code: 13 });
        const mockClient = makeMockClient(async () => {
            throw otherErr;
        });
        (0, enqueue_audit_task_js_1.__resetClientForTests)(mockClient);
        await (0, vitest_1.expect)((0, enqueue_audit_task_js_1.enqueueAuditTask)(PAYLOAD, CONFIG)).rejects.toThrow('Internal');
        const lines = stdoutSpy.mock.calls
            .map((c) => String(c[0]))
            .filter((l) => l.includes('audit_task.enqueue'));
        (0, vitest_1.expect)(lines).toHaveLength(0);
    });
});
//# sourceMappingURL=enqueue-audit-task.test.js.map