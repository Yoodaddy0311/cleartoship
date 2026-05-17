// Tests for the RUN_DEPENDENCY_SCAN pipeline step (07-dependency-scan.ts).
//
// Strategy:
//   - Mock `../tool-runner.js` so `spawnTool` returns controlled SpawnResult
//     objects (covers notInstalled / exit codes / parse failures).
//   - Mock `../../firestore/writers.js` so we capture `writeToolResult` calls
//     and assert status (SUCCESS / SKIPPED / FAILED).
//   - Use a real tmp clone directory so the step's lockfile detection
//     (`findLockfiles` -> fsp.access) exercises the real filesystem. This
//     mirrors `03-clone-repo.test.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WorkerCtx } from '../../adapters/index.js';
import { createInitialState, type PipelineState } from './index.js';

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
    runId: 'run-osv-' + Math.random().toString(36).slice(2, 10),
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

async function makeCloneDirWithLockfile(runId: string, files: string[]): Promise<string> {
  const dir = path.join(os.tmpdir(), `cleartoship-osv-${runId}`);
  await fsp.mkdir(dir, { recursive: true });
  for (const f of files) {
    await fsp.writeFile(path.join(dir, f), '{}');
  }
  return dir;
}

async function cleanupDir(dir: string) {
  await fsp.rm(dir, { recursive: true, force: true });
}

function makeOsvJson(packages: Array<{
  name: string;
  version: string;
  ecosystem?: string;
  vulns: Array<{ id?: string; summary?: string; severity?: string; details?: string }>;
}>, sourcePath = '/tmp/cleartoship-osv/package-lock.json'): string {
  return JSON.stringify({
    results: [
      {
        source: { path: sourcePath },
        packages: packages.map((p) => ({
          package: { name: p.name, version: p.version, ecosystem: p.ecosystem ?? 'npm' },
          vulnerabilities: p.vulns.map((v) => ({
            id: v.id ?? 'OSV-1',
            summary: v.summary ?? 'vuln',
            details: v.details ?? null,
            database_specific: { severity: v.severity ?? 'MODERATE' },
          })),
        })),
      },
    ],
  });
}

describe('step07DependencyScan', () => {
  let step: typeof import('./07-dependency-scan.js').step07DependencyScan;

  beforeEach(async () => {
    spawnToolMock.mockReset();
    writeToolResultMock.mockClear();
    vi.resetModules();
    ({ step07DependencyScan: step } = await import('./07-dependency-scan.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no clonePath: writes SKIPPED tool result and does not spawn osv-scanner', async () => {
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
    expect(call.toolName).toBe('osv-scanner');
    expect(call.rawSummary.reason).toContain('no clone path');
    expect(state.pendingFindings).toHaveLength(0);
  });

  it('no lockfiles in clone: writes SKIPPED without invoking osv-scanner', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, []); // empty dir
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();

    await step.execute(ctx, state);

    expect(spawnToolMock).not.toHaveBeenCalled();
    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      rawSummary: { reason: string };
    };
    expect(call.status).toBe('SKIPPED');
    expect(call.rawSummary.reason).toContain('no lockfiles');

    await cleanupDir(dir);
  });

  it('osv-scanner not installed: writes SKIPPED with notInstalled reason', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, ['package-lock.json']);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: true,
      exitCode: null,
      stdout: '',
      stderr: 'ENOENT',
      durationMs: 5,
    });

    await step.execute(ctx, state);

    expect(spawnToolMock).toHaveBeenCalledTimes(1);
    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      rawSummary: { reason: string; lockfiles: string[] };
    };
    expect(call.status).toBe('SKIPPED');
    expect(call.rawSummary.reason).toContain('not found');
    expect(call.rawSummary.lockfiles).toContain('package-lock.json');
    expect(state.pendingFindings).toHaveLength(0);

    await cleanupDir(dir);
  });

  it('happy path: maps OSV vulns to normalized findings with severity P0/P1/P2/P3', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, ['package-lock.json']);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 1, // osv-scanner returns 1 when vulns found — still success
      stdout: makeOsvJson([
        {
          name: 'lodash',
          version: '4.17.20',
          vulns: [
            { id: 'GHSA-aaa', summary: 'proto pollution', severity: 'CRITICAL' },
          ],
        },
        {
          name: 'axios',
          version: '0.21.0',
          vulns: [
            { id: 'GHSA-bbb', summary: 'ssrf', severity: 'HIGH' },
            { id: 'GHSA-ccc', summary: 'minor', severity: 'MODERATE' },
            { id: 'GHSA-ddd', summary: 'tiny', severity: 'LOW' },
          ],
        },
      ]),
      stderr: '',
      durationMs: 300,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(4);
    const sev = state.pendingFindings.map((f) => f.severity);
    expect(sev).toEqual(['P0', 'P1', 'P2', 'P3']);
    const first = state.pendingFindings[0]!;
    expect(first.category).toBe('SECURITY_PRIVACY');
    expect(first.title).toContain('lodash@4.17.20');
    expect(first.title).toContain('GHSA-aaa');
    expect(first.tags).toContain('osv');
    expect(first.tags).toContain('dependency');
    expect(first.evidences[0]!.type).toBe('OSV');
    expect(first.evidences[0]!.url).toContain('osv.dev/vulnerability/GHSA-aaa');
    expect(first.evidences[0]!.metadata).toMatchObject({
      id: 'GHSA-aaa',
      package: 'lodash',
      version: '4.17.20',
      ecosystem: 'npm',
    });

    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      rawSummary: { vulns: number; lockfiles: string[] };
    };
    expect(call.status).toBe('SUCCESS');
    expect(call.rawSummary.vulns).toBe(4);
    expect(call.rawSummary.lockfiles).toContain('package-lock.json');

    await cleanupDir(dir);
  });

  it('exit code 2 (osv-scanner crash): writes FAILED but pipeline survives', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, ['package-lock.json']);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 2,
      stdout: '',
      stderr: 'fatal: bad json',
      durationMs: 50,
    });

    await expect(step.execute(ctx, state)).resolves.toBeUndefined();
    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      rawSummary: { exitCode: number; stderr: string };
    };
    expect(call.status).toBe('FAILED');
    expect(call.rawSummary.exitCode).toBe(2);
    expect(call.rawSummary.stderr).toContain('fatal: bad json');
    expect(state.pendingFindings).toHaveLength(0);

    await cleanupDir(dir);
  });

  it('malformed JSON: logs warn but writes SUCCESS with 0 findings', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, ['pnpm-lock.yaml']);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 0,
      stdout: 'not json {',
      stderr: '',
      durationMs: 10,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(0);
    const call = writeToolResultMock.mock.calls[0]![0] as { status: string };
    expect(call.status).toBe('SUCCESS');
    const logCalls = (ctx.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(logCalls.some((c) => String(c[1]).includes('OSV JSON parse failed'))).toBe(true);

    await cleanupDir(dir);
  });

  it('truncates raw findings to first 200 entries', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, ['package-lock.json']);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();
    const manyVulns = Array.from({ length: 250 }, (_, i) => ({
      id: `OSV-${i}`,
      summary: 'x',
      severity: 'LOW',
    }));
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 1,
      stdout: makeOsvJson([{ name: 'pkg', version: '1.0', vulns: manyVulns }]),
      stderr: '',
      durationMs: 200,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(200);
    const call = writeToolResultMock.mock.calls[0]![0] as {
      status: string;
      rawSummary: { vulns: number };
    };
    expect(call.status).toBe('SUCCESS');
    expect(call.rawSummary.vulns).toBe(200);

    await cleanupDir(dir);
  });

  it('passes correct CLI args (--format=json --recursive <clonePath>) to spawnTool', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, ['package-lock.json']);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 0,
      stdout: '{}',
      stderr: '',
      durationMs: 1,
    });

    await step.execute(ctx, state);

    const [cmd, args] = spawnToolMock.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('osv-scanner');
    expect(args).toContain('--format=json');
    expect(args).toContain('--recursive');
    expect(args).toContain(dir);

    await cleanupDir(dir);
  });

  // O2: (package + ghsaId + version) 기준 dedup. 라운드3 self-audit에서
  // vite@5.4.21 GHSA-4w7w-66w2-5vf9 / esbuild@0.21.5 GHSA-67mh-4wv8-2f99 /
  // @tootallnate/once@2.0.1 GHSA-vpq2-c234-7xj6 가 각 2회 출력되던 회귀를 막는다.
  it('dedups identical (pkg+ghsaId+version) across results — single finding emitted', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, ['package-lock.json']);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();
    // 동일 source.path, 동일 (pkg, version, id) 가 두 번 보고된 경우.
    const dupStdout = JSON.stringify({
      results: [
        {
          source: { path: '/repo/package-lock.json' },
          packages: [
            {
              package: { name: 'vite', version: '5.4.21', ecosystem: 'npm' },
              vulnerabilities: [
                {
                  id: 'GHSA-4w7w-66w2-5vf9',
                  summary: 'vite dev server SSRF',
                  database_specific: { severity: 'HIGH' },
                },
              ],
            },
          ],
        },
        {
          source: { path: '/repo/package-lock.json' },
          packages: [
            {
              package: { name: 'vite', version: '5.4.21', ecosystem: 'npm' },
              vulnerabilities: [
                {
                  id: 'GHSA-4w7w-66w2-5vf9',
                  summary: 'vite dev server SSRF',
                  database_specific: { severity: 'HIGH' },
                },
              ],
            },
          ],
        },
      ],
    });
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 1,
      stdout: dupStdout,
      stderr: '',
      durationMs: 100,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(1);
    const finding = state.pendingFindings[0]!;
    expect(finding.title).toContain('vite@5.4.21');
    expect(finding.title).toContain('GHSA-4w7w-66w2-5vf9');
    // 동일 path는 evidences에 중복 누적되지 않는다.
    expect(finding.evidences).toHaveLength(1);
    expect(finding.evidences[0]!.path).toBe('/repo/package-lock.json');

    await cleanupDir(dir);
  });

  it('merges paths when same (pkg+ghsaId+version) appears in different manifests', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, ['package-lock.json']);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();
    // 동일 vuln 이 root + functions 의 두 manifest에서 발견 → finding 1건, evidences 2건.
    const multiManifestStdout = JSON.stringify({
      results: [
        {
          source: { path: '/repo/package-lock.json' },
          packages: [
            {
              package: { name: 'esbuild', version: '0.21.5', ecosystem: 'npm' },
              vulnerabilities: [
                {
                  id: 'GHSA-67mh-4wv8-2f99',
                  summary: 'esbuild dev server',
                  database_specific: { severity: 'MODERATE' },
                },
              ],
            },
          ],
        },
        {
          source: { path: '/repo/functions/package-lock.json' },
          packages: [
            {
              package: { name: 'esbuild', version: '0.21.5', ecosystem: 'npm' },
              vulnerabilities: [
                {
                  id: 'GHSA-67mh-4wv8-2f99',
                  summary: 'esbuild dev server',
                  database_specific: { severity: 'MODERATE' },
                },
              ],
            },
          ],
        },
      ],
    });
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 1,
      stdout: multiManifestStdout,
      stderr: '',
      durationMs: 100,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(1);
    const finding = state.pendingFindings[0]!;
    expect(finding.evidences).toHaveLength(2);
    const paths = finding.evidences.map((e) => e.path).sort();
    expect(paths).toEqual([
      '/repo/functions/package-lock.json',
      '/repo/package-lock.json',
    ]);
  });

  it('does NOT dedup different versions of same package + same GHSA', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, ['package-lock.json']);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 1,
      stdout: makeOsvJson([
        {
          name: '@tootallnate/once',
          version: '2.0.1',
          vulns: [{ id: 'GHSA-vpq2-c234-7xj6', severity: 'MODERATE' }],
        },
        {
          name: '@tootallnate/once',
          version: '1.1.2',
          vulns: [{ id: 'GHSA-vpq2-c234-7xj6', severity: 'MODERATE' }],
        },
      ]),
      stderr: '',
      durationMs: 100,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(2);
    const versions = state.pendingFindings
      .map((f) => (f.evidences[0]!.metadata as { version: string }).version)
      .sort();
    expect(versions).toEqual(['1.1.2', '2.0.1']);

    await cleanupDir(dir);
  });

  it('does NOT dedup different packages with same GHSA id (defensive — should be impossible in practice)', async () => {
    const ctx = makeCtx();
    const dir = await makeCloneDirWithLockfile(ctx.runId, ['package-lock.json']);
    ctx.clonePath = dir;
    const state: PipelineState = createInitialState();
    spawnToolMock.mockResolvedValueOnce({
      notInstalled: false,
      exitCode: 1,
      stdout: makeOsvJson([
        { name: 'pkg-a', version: '1.0.0', vulns: [{ id: 'GHSA-xxxx', severity: 'HIGH' }] },
        { name: 'pkg-b', version: '1.0.0', vulns: [{ id: 'GHSA-xxxx', severity: 'HIGH' }] },
      ]),
      stderr: '',
      durationMs: 100,
    });

    await step.execute(ctx, state);

    expect(state.pendingFindings).toHaveLength(2);

    await cleanupDir(dir);
  });
});

describe('dedupOsvFindings (unit)', () => {
  // Pure-function tests for the dedup helper — independent of step plumbing.
  // 라운드3 회귀 매트릭스: vite / esbuild / @tootallnate/once 가 각 2회 출력되던 케이스.
  it('collapses 3 round-3 regression vulns from 6 raw entries to 3 findings', async () => {
    const { dedupOsvFindings } = await import('./07-dependency-scan.js');
    const make = (pkg: string, ver: string, id: string, manifestPath: string) => ({
      title: `${pkg}@${ver} — ${id}`,
      category: 'SECURITY_PRIVACY' as const,
      severity: 'P1' as const,
      confidence: 'HIGH' as const,
      summary: id,
      nonDeveloperExplanation: null,
      technicalExplanation: null,
      impact: null,
      recommendation: null,
      acceptanceCriteria: [],
      tags: ['osv', 'dependency'],
      evidences: [
        {
          type: 'OSV' as const,
          source: 'osv-scanner',
          path: manifestPath,
          lineStart: null,
          lineEnd: null,
          url: `https://osv.dev/vulnerability/${id}`,
          selector: null,
          screenshotPath: null,
          snippet: null,
          maskedValue: null,
          metadata: { id, package: pkg, version: ver, ecosystem: 'npm' },
        },
      ],
    });
    const raw = [
      make('vite', '5.4.21', 'GHSA-4w7w-66w2-5vf9', '/repo/package-lock.json'),
      make('vite', '5.4.21', 'GHSA-4w7w-66w2-5vf9', '/repo/package-lock.json'),
      make('esbuild', '0.21.5', 'GHSA-67mh-4wv8-2f99', '/repo/package-lock.json'),
      make('esbuild', '0.21.5', 'GHSA-67mh-4wv8-2f99', '/repo/package-lock.json'),
      make('@tootallnate/once', '2.0.1', 'GHSA-vpq2-c234-7xj6', '/repo/package-lock.json'),
      make('@tootallnate/once', '2.0.1', 'GHSA-vpq2-c234-7xj6', '/repo/package-lock.json'),
    ];
    const deduped = dedupOsvFindings(raw);
    expect(deduped).toHaveLength(3);
    const titles = deduped.map((f) => f.title).sort();
    expect(titles[0]).toContain('@tootallnate/once@2.0.1');
    expect(titles[1]).toContain('esbuild@0.21.5');
    expect(titles[2]).toContain('vite@5.4.21');
  });

  it('returns empty array for empty input', async () => {
    const { dedupOsvFindings } = await import('./07-dependency-scan.js');
    expect(dedupOsvFindings([])).toEqual([]);
  });
});
