// Tests for the CLEANUP pipeline step (15-cleanup.ts).
//
// Strategy:
//   - Use a real tmp directory (os.tmpdir()) so the step's `fsp.rm` exercises
//     the actual filesystem; this is more faithful than a `node:fs` mock and
//     covers the recursive: true / force: true branch.
//   - The step does not call any Firestore writer, but we still mock the
//     module to keep parity with other tests in the suite and to ensure no
//     accidental network call is attempted.
//   - Build `WorkerCtx` and `PipelineState` inline; the step mutates
//     `ctx.clonePath` to null and clears `state.pendingFindings`,
//     `state.detectedFeatures`, and `state.fileTree`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WorkerCtx } from '../../adapters/index.js';
import { createInitialState, type PipelineState } from './index.js';

vi.mock('../../firestore/writers.js', () => ({
  writeToolResult: vi.fn(),
  setRunCommitHash: vi.fn(),
}));

function makeCtx(overrides: Partial<WorkerCtx> = {}): WorkerCtx {
  return {
    runId: 'run-cleanup-' + Math.random().toString(36).slice(2, 10),
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: null,
    prdText: null,
    clonePath: null,
    log: vi.fn(),
    ...overrides,
  };
}

async function makePopulatedCloneDir(runId: string): Promise<string> {
  const dir = path.join(os.tmpdir(), `cleartoship-cleanup-${runId}`);
  await fsp.mkdir(path.join(dir, 'src'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'src', 'index.ts'), 'export const x = 1;\n');
  await fsp.writeFile(path.join(dir, 'README.md'), '# hi\n');
  return dir;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

describe('step15Cleanup', () => {
  let step: typeof import('./15-cleanup.js').step15Cleanup;

  beforeEach(async () => {
    vi.resetModules();
    ({ step15Cleanup: step } = await import('./15-cleanup.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes the populated clone directory and nullifies ctx.clonePath', async () => {
    const ctx = makeCtx();
    const dir = await makePopulatedCloneDir(ctx.runId);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();

    expect(await exists(dir)).toBe(true);
    await step.execute(ctx, state);

    expect(await exists(dir)).toBe(false);
    expect(ctx.clonePath).toBeNull();
  });

  it('clears in-memory state (pendingFindings, detectedFeatures, fileTree)', async () => {
    const ctx = makeCtx({ clonePath: null });
    const state: PipelineState = createInitialState();
    state.pendingFindings.push({
      title: 'leftover',
      category: 'SECURITY_PRIVACY',
      severity: 'P0',
      confidence: 'HIGH',
      summary: '',
      nonDeveloperExplanation: '',
      technicalExplanation: null,
      impact: '',
      recommendation: '',
      acceptanceCriteria: [],
      tags: [],
      evidences: [],
    });
    state.detectedFeatures.push({
      id: 'feat-1',
      type: 'feature',
      label: 'leftover',
      status: 'partial',
      confidence: 'LOW',
      summary: null,
    });
    state.fileTree.push('src/a.ts', 'src/b.ts');

    await step.execute(ctx, state);

    expect(state.pendingFindings).toEqual([]);
    expect(state.detectedFeatures).toEqual([]);
    expect(state.fileTree).toEqual([]);
  });

  it('handles missing clone directory: no throw, ctx.clonePath still nulled', async () => {
    const ctx = makeCtx();
    const missing = path.join(os.tmpdir(), `cleartoship-cleanup-nope-${ctx.runId}`);
    ctx.clonePath = missing;
    const state: PipelineState = createInitialState();

    // Sanity: dir really does not exist.
    expect(await exists(missing)).toBe(false);

    await expect(step.execute(ctx, state)).resolves.toBeUndefined();
    expect(ctx.clonePath).toBeNull();
  });

  it('idempotent: running twice in sequence is safe (no throw on second run)', async () => {
    const ctx = makeCtx();
    const dir = await makePopulatedCloneDir(ctx.runId);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);
    expect(ctx.clonePath).toBeNull();
    expect(await exists(dir)).toBe(false);

    // Second invocation — clonePath is already null, must not throw.
    await expect(step.execute(ctx, state)).resolves.toBeUndefined();
    expect(ctx.clonePath).toBeNull();
  });

  it('no clonePath set: still completes successfully (does not touch fs)', async () => {
    const ctx = makeCtx({ clonePath: null });
    const state: PipelineState = createInitialState();

    await expect(step.execute(ctx, state)).resolves.toBeUndefined();
    expect(ctx.clonePath).toBeNull();
    // Log should still mention completion.
    const logCalls = (ctx.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(logCalls.some((c) => String(c[1]).includes('Cleanup complete'))).toBe(true);
  });

  it('fs.rm failure: caught and logged as warn, does not throw', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    // Inject a path that will fail rm on some platforms. To force failure
    // deterministically we mock fsp.rm via vi.spyOn after re-importing.
    const fsMod = await import('node:fs');
    const rmSpy = vi.spyOn(fsMod.promises, 'rm').mockRejectedValueOnce(new Error('EBUSY'));
    ctx.clonePath = path.join(os.tmpdir(), `cleartoship-cleanup-busy-${ctx.runId}`);

    await expect(step.execute(ctx, state)).resolves.toBeUndefined();
    expect(rmSpy).toHaveBeenCalled();
    // clonePath nulled even when rm failed (per current step behaviour).
    expect(ctx.clonePath).toBeNull();
    const logCalls = (ctx.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(logCalls.some((c) => c[0] === 'warn' && String(c[1]).includes('Cleanup'))).toBe(true);

    rmSpy.mockRestore();
  });
});
