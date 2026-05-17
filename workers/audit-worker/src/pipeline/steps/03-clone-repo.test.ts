// Tests for the CLONE_REPO pipeline step (03-clone-repo.ts).
//
// Strategy:
//   - Use the real fs in a fresh tmpdir directory under os.tmpdir() so the
//     step's tmp-path logic exercises the actual filesystem (no fs mocking).
//   - Mock `simple-git` so we can simulate successful clones, clone failures,
//     and "module not available" (failed dynamic import). The step calls
//     `simpleGit({ baseDir }).clone(...)`, so the mock returns a chainable
//     object whose `clone` is a vi.fn we can program per-test.
//   - Mock `../../firestore/writers.js` to capture `setRunCommitHash` calls
//     without touching Firestore.
//   - Build a `WorkerCtx` and `PipelineState` inline; the step writes to both.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WorkerCtx } from '../../adapters/index.js';
import { createInitialState, type PipelineState } from './index.js';

// --- Mocks ---
// Hoisted refs — vi.mock factories run before module top-level code, so any
// variables they reference must be hoisted with vi.hoisted().
const { cloneMock, envMock, gitChain, setRunCommitHashMock } = vi.hoisted(() => {
  const cloneMock = vi.fn();
  const envMock = vi.fn();
  const gitChain: { clone: typeof cloneMock; env: typeof envMock } = {
    clone: cloneMock,
    env: envMock,
  };
  envMock.mockImplementation(() => gitChain);
  return {
    cloneMock,
    envMock,
    gitChain,
    setRunCommitHashMock: vi.fn(async () => undefined),
  };
});

// We program simpleGit per-test; default returns a working clone harness.
// `env()` must return the same object so the chain `simpleGit(...).env(...).clone(...)`
// resolves to our cloneMock — mirrors simple-git's fluent API. envMock captures
// the env arg so tests can assert sanitization (e.g. GIT_ASKPASS removed).
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => gitChain),
}));

vi.mock('../../firestore/writers.js', () => ({
  setRunCommitHash: setRunCommitHashMock,
  writeToolResult: vi.fn(),
}));

function makeCtx(overrides: Partial<WorkerCtx> = {}): WorkerCtx {
  return {
    runId: 'test-run-' + Math.random().toString(36).slice(2, 10),
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

async function cleanupTmp(ctx: WorkerCtx) {
  const dest = path.join(os.tmpdir(), `cleartoship-${ctx.runId}`);
  await fsp.rm(dest, { recursive: true, force: true });
}

describe('step03CloneRepo', () => {
  let step: typeof import('./03-clone-repo.js').step03CloneRepo;

  beforeEach(async () => {
    cloneMock.mockReset();
    envMock.mockClear();
    envMock.mockImplementation(() => gitChain);
    setRunCommitHashMock.mockClear();
    vi.resetModules();
    ({ step03CloneRepo: step } = await import('./03-clone-repo.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: invokes git.clone with shallow clone args and target tmp path', async () => {
    const ctx = makeCtx({ repoUrl: 'https://github.com/example/repo' });
    const state: PipelineState = createInitialState();
    const expectedDest = path.join(os.tmpdir(), `cleartoship-${ctx.runId}`);

    cloneMock.mockImplementationOnce(async (_url: string, dest: string) => {
      // Simulate git creating a .git/HEAD pointing at a commit on main.
      await fsp.mkdir(path.join(dest, '.git', 'refs', 'heads'), { recursive: true });
      await fsp.writeFile(path.join(dest, '.git', 'HEAD'), 'ref: refs/heads/main\n');
      await fsp.writeFile(path.join(dest, '.git', 'refs', 'heads', 'main'), 'abc123def456\n');
      await fsp.writeFile(path.join(dest, 'README.md'), '# hi\n');
    });

    await step.execute(ctx, state);

    expect(cloneMock).toHaveBeenCalledTimes(1);
    const [url, dest, args] = cloneMock.mock.calls[0] as [string, string, string[]];
    expect(url).toBe('https://github.com/example/repo');
    expect(dest).toBe(expectedDest);
    expect(args).toContain('--depth');
    expect(args).toContain('1');
    expect(args).toContain('--single-branch');
    expect(args).toContain('--no-tags');

    // Side effects: clonePath set, fileTree populated, commit hash written.
    expect(ctx.clonePath).toBe(expectedDest);
    expect(state.fileTree.length).toBeGreaterThan(0);
    expect(state.fileTree).toContain('README.md');
    expect(setRunCommitHashMock).toHaveBeenCalledWith(ctx.runId, 'abc123def456');

    await cleanupTmp(ctx);
  });

  it('clone fails: pushes a P0 LAUNCH_READINESS finding and continues with empty tree', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    cloneMock.mockRejectedValueOnce(new Error('Repository not found'));

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(1);
    const finding = state.pendingFindings[0]!;
    expect(finding.severity).toBe('P0');
    expect(finding.category).toBe('LAUNCH_READINESS');
    expect(finding.title).toContain('Repo');
    expect(finding.tags).toContain('clone-failed');
    expect(finding.summary).toContain('Repository not found');
    expect(state.fileTree).toEqual([]);
    expect(ctx.clonePath).toBeNull();
    expect(setRunCommitHashMock).not.toHaveBeenCalled();

    await cleanupTmp(ctx);
  });

  it('disk write: creates a fresh dest directory under os.tmpdir()', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();
    const expectedDest = path.join(os.tmpdir(), `cleartoship-${ctx.runId}`);

    // Pre-populate the target so we can assert the step recreates it.
    await fsp.mkdir(expectedDest, { recursive: true });
    await fsp.writeFile(path.join(expectedDest, 'leftover.txt'), 'stale');

    cloneMock.mockImplementationOnce(async (_url: string, dest: string) => {
      // After clone, the leftover should be gone (step rm -rf the dir first).
      const entries = await fsp.readdir(dest);
      expect(entries).toEqual([]);
      await fsp.writeFile(path.join(dest, 'new.txt'), 'fresh');
    });

    await step.execute(ctx, state);

    expect(state.fileTree).toContain('new.txt');
    expect(state.fileTree).not.toContain('leftover.txt');

    await cleanupTmp(ctx);
  });

  it('walks subdirectories but skips heavy dirs like node_modules and .git', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();

    cloneMock.mockImplementationOnce(async (_url: string, dest: string) => {
      await fsp.mkdir(path.join(dest, 'src'), { recursive: true });
      await fsp.mkdir(path.join(dest, 'node_modules', 'pkg'), { recursive: true });
      await fsp.mkdir(path.join(dest, '.git'), { recursive: true });
      await fsp.writeFile(path.join(dest, 'src', 'index.ts'), '');
      await fsp.writeFile(path.join(dest, 'node_modules', 'pkg', 'index.js'), '');
      await fsp.writeFile(path.join(dest, '.git', 'HEAD'), 'deadbeef\n');
      await fsp.writeFile(path.join(dest, 'package.json'), '{}');
    });

    await step.execute(ctx, state);

    expect(state.fileTree).toContain('package.json');
    expect(state.fileTree).toContain('src/index.ts');
    // Skip dirs filtered.
    expect(state.fileTree.some((p) => p.startsWith('node_modules/'))).toBe(false);
    expect(state.fileTree.some((p) => p.startsWith('.git/'))).toBe(false);

    await cleanupTmp(ctx);
  });

  it('reads HEAD as direct sha (detached) and persists commit hash', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();

    cloneMock.mockImplementationOnce(async (_url: string, dest: string) => {
      await fsp.mkdir(path.join(dest, '.git'), { recursive: true });
      // Detached HEAD: just a raw sha (no "ref: " prefix).
      await fsp.writeFile(path.join(dest, '.git', 'HEAD'), 'deadbeefcafe1234\n');
      await fsp.writeFile(path.join(dest, 'a.txt'), '');
    });

    await step.execute(ctx, state);

    expect(setRunCommitHashMock).toHaveBeenCalledWith(ctx.runId, 'deadbeefcafe1234');

    await cleanupTmp(ctx);
  });

  it('sanitizes env: drops GIT_ASKPASS/SSH_ASKPASS and forces GIT_TERMINAL_PROMPT=0', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();

    // Simulate VS Code/Cursor leaking GIT_ASKPASS into the worker's env —
    // git ≥2.51 would otherwise abort the clone with "GIT_ASKPASS not permitted".
    const originalAskpass = process.env.GIT_ASKPASS;
    const originalSshAskpass = process.env.SSH_ASKPASS;
    const originalPrompt = process.env.GIT_TERMINAL_PROMPT;
    process.env.GIT_ASKPASS = '/some/leaked/askpass.sh';
    process.env.SSH_ASKPASS = '/some/leaked/ssh-askpass.sh';
    process.env.GIT_TERMINAL_PROMPT = '1';

    cloneMock.mockImplementationOnce(async (_url: string, dest: string) => {
      await fsp.writeFile(path.join(dest, 'ok.txt'), '');
    });

    try {
      await step.execute(ctx, state);
    } finally {
      if (originalAskpass === undefined) delete process.env.GIT_ASKPASS;
      else process.env.GIT_ASKPASS = originalAskpass;
      if (originalSshAskpass === undefined) delete process.env.SSH_ASKPASS;
      else process.env.SSH_ASKPASS = originalSshAskpass;
      if (originalPrompt === undefined) delete process.env.GIT_TERMINAL_PROMPT;
      else process.env.GIT_TERMINAL_PROMPT = originalPrompt;
    }

    expect(envMock).toHaveBeenCalledTimes(1);
    const passedEnv = envMock.mock.calls[0]![0] as NodeJS.ProcessEnv;
    expect(passedEnv.GIT_ASKPASS).toBeUndefined();
    expect(passedEnv.SSH_ASKPASS).toBeUndefined();
    expect(passedEnv.GIT_TERMINAL_PROMPT).toBe('0');
    // Clone still proceeded successfully despite the leaked env.
    expect(cloneMock).toHaveBeenCalledTimes(1);
    expect(state.fileTree).toContain('ok.txt');

    await cleanupTmp(ctx);
  });

  it('missing HEAD file: skips commit hash write but does not throw', async () => {
    const ctx = makeCtx();
    const state: PipelineState = createInitialState();

    cloneMock.mockImplementationOnce(async (_url: string, dest: string) => {
      // No .git/HEAD at all.
      await fsp.writeFile(path.join(dest, 'only.txt'), 'x');
    });

    await step.execute(ctx, state);

    expect(setRunCommitHashMock).not.toHaveBeenCalled();
    expect(state.fileTree).toContain('only.txt');
    expect(ctx.clonePath).not.toBeNull();

    await cleanupTmp(ctx);
  });
});
