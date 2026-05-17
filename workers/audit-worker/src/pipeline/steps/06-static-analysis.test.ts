// Tests for the RUN_STATIC_ANALYSIS pipeline step (06-static-analysis.ts).
//
// Strategy:
//   - Mock `../tool-runner.js` so `spawnTool` returns controlled SpawnResult
//     objects. The step inspects `notInstalled` / `exitCode` / `stdout` /
//     `stderr` — we cover each branch.
//   - Mock `../../firestore/writers.js` so we capture `writeToolResult` calls
//     and assert the status string (SUCCESS / SKIPPED / FAILED).
//   - Build a `WorkerCtx` and `PipelineState` inline; the step writes findings
//     to `state.pendingFindings`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerCtx } from '../../adapters/index.js';
import { createInitialState, type PipelineState } from './index.js';

// Hoisted refs — vi.mock factories run before module top-level code.
const { spawnToolMock, writeToolResultMock } = vi.hoisted(() => ({
  spawnToolMock: vi.fn(),
  writeToolResultMock: vi.fn(async () => 'tr-id'),
}));

vi.mock('../tool-runner.js', () => ({
  spawnTool: spawnToolMock,
}));

vi.mock('../../firestore/writers.js', () => ({
  writeToolResult: writeToolResultMock,
  setRunCommitHash: vi.fn(),
}));

function makeCtx(overrides: Partial<WorkerCtx> = {}): WorkerCtx {
  return {
    runId: 'run-1',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: null,
    prdText: null,
    profileId: null,
    clonePath: '/tmp/cleartoship-run-1',
    log: vi.fn(),
    ...overrides,
  };
}

function makeSemgrepJson(results: unknown[]): string {
  return JSON.stringify({ results });
}

describe('step06StaticAnalysis', () => {
  let step: typeof import('./06-static-analysis.js').step06StaticAnalysis;

  beforeEach(async () => {
    spawnToolMock.mockReset();
    writeToolResultMock.mockClear();
    vi.resetModules();
    ({ step06StaticAnalysis: step } = await import('./06-static-analysis.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no clonePath: writes SKIPPED tool result and returns without spawning semgrep', async () => {
    const ctx = makeCtx({ clonePath: null });
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);

    expect(spawnToolMock).not.toHaveBeenCalled();
    expect(writeToolResultMock).toHaveBeenCalledTimes(1);
    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      toolName: string;
      rawSummary: { reason: string };
    };
    expect(call.status).toBe('SKIPPED');
    expect(call.toolName).toBe('semgrep');
    expect(call.rawSummary.reason).toContain('no clone path');
    expect(state.pendingFindings).toHaveLength(0);
  });

  it('semgrep not installed: writes SKIPPED with notInstalled marker reason', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: true,
      exitCode: null,
      stdout: '',
      stderr: 'ENOENT',
      durationMs: 12,
    });

    await step.execute(ctx, state);

    expect(spawnToolMock).toHaveBeenCalledTimes(1);
    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      rawSummary: { reason: string };
    };
    expect(call.status).toBe('SKIPPED');
    expect(call.rawSummary.reason).toContain('not found');
    expect(state.pendingFindings).toHaveLength(0);
  });

  it('happy path: parses semgrep JSON and pushes normalized findings', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 1, // semgrep exit 1 when findings exist — still success
      stdout: makeSemgrepJson([
        {
          check_id: 'javascript.lang.eval',
          path: 'src/bad.js',
          start: { line: 10 },
          end: { line: 12 },
          extra: {
            message: 'eval() detected',
            severity: 'ERROR',
            lines: 'eval(x)',
            metadata: { cwe: 'CWE-95' },
          },
        },
        {
          check_id: 'python.lang.warn',
          path: 'app.py',
          start: { line: 3 },
          extra: { message: 'pickle is unsafe', severity: 'WARNING' },
        },
      ]),
      stderr: '',
      durationMs: 500,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(2);
    const first = state.pendingFindings[0]!;
    expect(first.title).toContain('javascript.lang.eval');
    expect(first.category).toBe('SECURITY_PRIVACY');
    expect(first.severity).toBe('P0'); // ERROR -> P0
    expect(first.tags).toContain('semgrep');
    expect(first.evidences[0]!.path).toBe('src/bad.js');
    expect(first.evidences[0]!.lineStart).toBe(10);
    expect(first.evidences[0]!.metadata).toMatchObject({
      rule: 'javascript.lang.eval',
      cwe: 'CWE-95',
    });

    const second = state.pendingFindings[1]!;
    expect(second.severity).toBe('P1'); // WARNING -> P1

    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      rawSummary: { findings: number; rawCount: number };
    };
    expect(call.status).toBe('SUCCESS');
    expect(call.rawSummary.findings).toBe(2);
    expect(call.rawSummary.rawCount).toBe(2);
  });

  it('exit code 0 (no findings): writes SUCCESS with empty findings array', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 0,
      stdout: makeSemgrepJson([]),
      stderr: '',
      durationMs: 100,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(0);
    const call = writeToolResultMock.mock.calls[0]![0] as { status: string };
    expect(call.status).toBe('SUCCESS');
  });

  it('semgrep crashes (non 0/1 exit): writes FAILED, does NOT kill pipeline', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 2,
      stdout: '',
      stderr: 'segfault',
      durationMs: 50,
    });

    await expect(step.execute(ctx, state)).resolves.toBeUndefined();
    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      rawSummary: { exitCode: number; stderr: string };
    };
    expect(call.status).toBe('FAILED');
    expect(call.rawSummary.exitCode).toBe(2);
    expect(call.rawSummary.stderr).toContain('segfault');
    expect(state.pendingFindings).toHaveLength(0);
  });

  it('null exit code (killed by timeout): treated as failure', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: null,
      stdout: '',
      stderr: '[killed by timeout]',
      durationMs: 180_000,
    });

    await step.execute(ctx, state);

    const call = writeToolResultMock.mock.calls[0]![0] as { status: string };
    expect(call.status).toBe('FAILED');
  });

  it('malformed JSON output: logs warning but still writes SUCCESS with 0 findings', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 0,
      stdout: 'not valid json {',
      stderr: '',
      durationMs: 100,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(0);
    const call = writeToolResultMock.mock.calls[0]![0] as { status: string };
    expect(call.status).toBe('SUCCESS');
    // log should have been called with a warn for parse failure.
    const logCalls = (ctx.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(logCalls.some((c) => String(c[1]).includes('JSON parse failed'))).toBe(true);
  });

  it('passes correct semgrep CLI args to spawnTool (config=auto, json, target=clonePath)', async () => {
    const ctx = makeCtx({ clonePath: '/tmp/cleartoship-X' });
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 0,
      stdout: makeSemgrepJson([]),
      stderr: '',
      durationMs: 1,
    });

    await step.execute(ctx, state);

    const [cmd, args] = spawnToolMock.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('semgrep');
    expect(args).toContain('--config=auto');
    expect(args).toContain('--json');
    expect(args).toContain('/tmp/cleartoship-X');
  });

  it('truncates raw results to first 200 entries', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    const many = Array.from({ length: 250 }, (_, i) => ({
      check_id: `r-${i}`,
      path: `f${i}.js`,
      start: { line: 1 },
      extra: { message: 'x', severity: 'INFO' },
    }));
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 1,
      stdout: makeSemgrepJson(many),
      stderr: '',
      durationMs: 200,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(200);
    const call = writeToolResultMock.mock.calls[0]![0] as {
      rawSummary: { rawCount: number; findings: number };
    };
    expect(call.rawSummary.rawCount).toBe(250);
    expect(call.rawSummary.findings).toBe(200);
  });

  it('nonDeveloperExplanation pulls phrasing from audit-core RULE_FAMILY (SSOT)', async () => {
    // Anchored to the audit-core sql-injection entry's KO summary. If the
    // SSOT dictionary is replaced or this id renamed, this test fails first —
    // catching any future drift back into a worker-local definition.
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 1,
      stdout: makeSemgrepJson([
        {
          check_id: 'javascript.lang.security.audit.sql-injection.detect',
          path: 'src/db.js',
          start: { line: 7 },
          extra: { message: 'SQLi sink', severity: 'ERROR' },
        },
        {
          check_id: 'totally-unknown-family-xyz',
          path: 'src/whatever.js',
          start: { line: 1 },
          extra: { message: 'misc', severity: 'INFO' },
        },
      ]),
      stderr: '',
      durationMs: 200,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(2);
    const matched = state.pendingFindings[0]!;
    expect(matched.nonDeveloperExplanation).toContain('파라미터 바인딩');
    expect(matched.nonDeveloperExplanation).toContain('가능한 한 빨리 고쳐주세요');

    const fallback = state.pendingFindings[1]!;
    expect(fallback.nonDeveloperExplanation).toContain('코드 검사 도구가 잠재적');
  });
});
