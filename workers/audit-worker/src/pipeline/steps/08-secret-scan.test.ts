// Tests for the RUN_SECRET_SCAN pipeline step (08-secret-scan.ts).
//
// Strategy:
//   - Use a real tmp clone directory (os.tmpdir()) so the step's recursive
//     `walk()` generator exercises the actual filesystem — including the
//     skip-dirs filter (.git / node_modules / dist / build / .next).
//   - Mock `../../firestore/writers.js` to capture `writeToolResult` calls
//     without touching Firestore.
//   - All secret-shaped strings are CONSTRUCTED AT RUNTIME from harmless
//     fragments so this test file itself contains no literal credential.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WorkerCtx } from '../../adapters/index.js';
import { createInitialState, type PipelineState } from './index.js';

const { writeToolResultMock } = vi.hoisted(() => ({
  writeToolResultMock: vi.fn(async () => 'tr-id'),
}));

vi.mock('../../firestore/writers.js', () => ({
  writeToolResult: writeToolResultMock,
  setRunCommitHash: vi.fn(),
}));

function makeCtx(overrides: Partial<WorkerCtx> = {}): WorkerCtx {
  return {
    runId: 'run-sec-' + Math.random().toString(36).slice(2, 10),
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: null,
    prdText: null,
    profileId: null,
    clonePath: null,
    log: vi.fn(),
    ...overrides,
  };
}

async function makeCloneDir(runId: string): Promise<string> {
  const dir = path.join(os.tmpdir(), `cleartoship-sec-${runId}`);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function cleanupDir(dir: string) {
  await fsp.rm(dir, { recursive: true, force: true });
}

// Build secret-shaped fixtures at runtime so this source file does not contain
// any literal credential pattern. The detection regexes look for the prefixes
// below followed by base62/uppercase content of a specific length.
function awsKeyFixture(): string {
  // AKIA + 16 chars of [A-Z0-9]
  return 'A' + 'KI' + 'A' + 'IOSFODNN' + '7EXAMPLE';
}
function ghPatFixture(): string {
  // ghp_ + 36 chars of [A-Za-z0-9]
  return 'g' + 'h' + 'p_' + 'a'.repeat(36);
}
function openaiKeyFixture(): string {
  // sk- + 32+ chars of [A-Za-z0-9]
  return 's' + 'k-' + 'b'.repeat(40);
}

describe('step08SecretScan', () => {
  let step: typeof import('./08-secret-scan.js').step08SecretScan;

  beforeEach(async () => {
    writeToolResultMock.mockClear();
    vi.resetModules();
    ({ step08SecretScan: step } = await import('./08-secret-scan.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no clonePath: writes SKIPPED tool result and pushes no findings', async () => {
    const ctx = makeCtx({ clonePath: null });
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);

    expect(writeToolResultMock).toHaveBeenCalledTimes(1);
    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      toolName: string;
      rawSummary: { reason: string };
    };
    expect(call.status).toBe('SKIPPED');
    expect(call.toolName).toBe('secret-scanner');
    expect(call.rawSummary.reason).toContain('no clone path');
    expect(state.pendingFindings).toHaveLength(0);
  });

  it('happy path: known AWS key in a file -> P0 finding with masked value (raw never persisted)', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDir(ctx.runId);
    ctx.clonePath = dir;
    const key = awsKeyFixture();
    const fileContent = `const cfg = {\n  awsKey: "${key}"\n}\n`;
    await fsp.writeFile(path.join(dir, 'config.js'), fileContent);
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(1);
    const f = state.pendingFindings[0]!;
    expect(f.severity).toBe('P0');
    expect(f.category).toBe('SECURITY_PRIVACY');
    expect(f.tags).toContain('secret-scan');
    expect(f.tags).toContain('aws-access-key-id');
    const ev = f.evidences[0]!;
    expect(ev.type).toBe('SECRET_SCAN');
    expect(ev.path).toBe('config.js');
    expect(ev.lineStart).toBe(2);
    expect(typeof ev.maskedValue).toBe('string');
    expect(ev.maskedValue!.startsWith('***')).toBe(true);
    // CRITICAL invariant: raw secret never appears in masked value or snippet
    expect(ev.maskedValue).not.toContain(key);
    expect(ev.snippet).toBeNull();
    expect(ev.metadata).toMatchObject({ pattern: 'aws-access-key-id' });

    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      rawSummary: { secrets: number; filesScanned: number };
    };
    expect(call.status).toBe('SUCCESS');
    expect(call.rawSummary.secrets).toBe(1);
    expect(call.rawSummary.filesScanned).toBeGreaterThanOrEqual(1);

    await cleanupDir(dir);
  });

  it('no matches: pushes empty findings and writes SUCCESS', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDir(ctx.runId);
    ctx.clonePath = dir;
    await fsp.writeFile(path.join(dir, 'safe.js'), 'export const greeting = "hello world";\n');
    await fsp.writeFile(path.join(dir, 'README.md'), '# README\n');
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(0);
    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      rawSummary: { secrets: number };
    };
    expect(call.status).toBe('SUCCESS');
    expect(call.rawSummary.secrets).toBe(0);

    await cleanupDir(dir);
  });

  it('skips heavy dirs (.git / node_modules / dist / build / .next)', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDir(ctx.runId);
    ctx.clonePath = dir;
    const awsKey = awsKeyFixture();
    const ghPat = ghPatFixture();
    // Place secrets inside skip dirs — they should NOT be reported.
    for (const skip of ['.git', 'node_modules', 'dist', 'build', '.next']) {
      await fsp.mkdir(path.join(dir, skip), { recursive: true });
      await fsp.writeFile(path.join(dir, skip, 'leak.txt'), `key=${awsKey}\n`);
    }
    // One real secret in src/ that SHOULD be detected.
    await fsp.mkdir(path.join(dir, 'src'), { recursive: true });
    await fsp.writeFile(path.join(dir, 'src', 'app.ts'), `// token=${ghPat}\n`);
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(1);
    const ev = state.pendingFindings[0]!.evidences[0]!;
    expect(ev.path).toBe('src/app.ts');
    expect(state.pendingFindings[0]!.tags).toContain('github-pat');

    await cleanupDir(dir);
  });

  it('skips binary files (NUL byte heuristic)', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDir(ctx.runId);
    ctx.clonePath = dir;
    const awsKey = awsKeyFixture();
    // Binary blob — secret-shaped bytes after a NUL byte.
    const bin = Buffer.concat([
      Buffer.from('preamble\0'),
      Buffer.from(`${awsKey}\n`, 'utf8'),
    ]);
    await fsp.writeFile(path.join(dir, 'data.bin'), bin);
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(0);
    const call = writeToolResultMock.mock.calls[0]![0] as {
      rawSummary: { skippedBinary: number };
    };
    expect(call.rawSummary.skippedBinary).toBeGreaterThanOrEqual(1);

    await cleanupDir(dir);
  });

  it('skips files by extension (.png, .pdf, .lock)', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDir(ctx.runId);
    ctx.clonePath = dir;
    const awsKey = awsKeyFixture();
    await fsp.writeFile(path.join(dir, 'photo.png'), `key=${awsKey}\n`);
    await fsp.writeFile(path.join(dir, 'manual.pdf'), `key=${awsKey}\n`);
    // File ending in `.lock` (extname === '.lock') is in SKIP_EXT.
    await fsp.writeFile(path.join(dir, 'Cargo.lock'), `key=${awsKey}\n`);
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(0);

    await cleanupDir(dir);
  });

  it('handles unrelated files gracefully (no throw, SUCCESS status)', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDir(ctx.runId);
    ctx.clonePath = dir;
    const openaiKey = openaiKeyFixture();
    // Real readable file with a secret — must still be detected.
    await fsp.writeFile(path.join(dir, 'real.env'), `OPENAI_KEY=${openaiKey}\n`);
    const state: PipelineState = createInitialState();

    await expect(step.execute(ctx, state)).resolves.toBeUndefined();
    expect(state.pendingFindings.length).toBeGreaterThanOrEqual(1);
    const call = writeToolResultMock.mock.calls[0]![0] as { status: string };
    expect(call.status).toBe('SUCCESS');

    await cleanupDir(dir);
  });

  it('caps findings at MAX_FINDINGS (100) — defensive truncation', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDir(ctx.runId);
    ctx.clonePath = dir;
    // Build a file with 150 valid AWS-key-shaped strings, one per line.
    const lines: string[] = [];
    const prefix = 'A' + 'K' + 'I' + 'A';
    for (let i = 0; i < 150; i++) {
      // Suffix must be 16 chars of [A-Z0-9].
      const suffix = i.toString().padStart(16, 'A').toUpperCase();
      lines.push(`key${i}=${prefix}${suffix}`);
    }
    await fsp.writeFile(path.join(dir, 'leaks.txt'), lines.join('\n') + '\n');
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);

    expect(state.pendingFindings.length).toBeLessThanOrEqual(100);
    expect(state.pendingFindings.length).toBeGreaterThan(50);

    await cleanupDir(dir);
  });
});
