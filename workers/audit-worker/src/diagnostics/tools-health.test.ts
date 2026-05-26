// Tests for `tools-health.ts` — the external-tool readiness probe.
//
// Strategy:
//   - We mock `node:child_process`'s `spawnSync` so no real binaries are
//     invoked. Each test seeds the mock with either a success (exit 0 +
//     stdout containing a recognisable version banner) or failure
//     (ENOENT-like error, or non-zero exit) and asserts the shape of the
//     returned ToolsHealth record.
//   - The helper must call `--version` for each of: semgrep, osv-scanner,
//     lighthouse, git — in parallel via Promise.all (we assert the call
//     count plus the per-tool command).
//   - Missing tools MUST NOT throw — the helper returns
//     `{ status: 'missing' }` so the /healthz route can stay 200 even when
//     binaries are absent (degraded mode).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
}));

// Import after mocks are registered so the module-under-test resolves them.
const { getToolsHealth, TOOL_NAMES } = await import('./tools-health.js');

interface SpawnSyncResult {
  status: number | null;
  stdout: Buffer | string;
  stderr: Buffer | string;
  error?: NodeJS.ErrnoException;
}

function ok(stdout: string): SpawnSyncResult {
  return { status: 0, stdout: Buffer.from(stdout), stderr: Buffer.from('') };
}

function missing(): SpawnSyncResult {
  const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
  return { status: null, stdout: Buffer.from(''), stderr: Buffer.from(''), error: err };
}

function nonZero(stderr: string): SpawnSyncResult {
  return { status: 127, stdout: Buffer.from(''), stderr: Buffer.from(stderr) };
}

describe('getToolsHealth()', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes TOOL_NAMES with the full Phase 0+1+A surface', () => {
    expect(TOOL_NAMES).toEqual([
      'semgrep',
      'osv-scanner',
      'lighthouse',
      'git',
      'typescript-language-server',
    ]);
  });

  it('returns status=found with parsed version when all 4 tools succeed', async () => {
    spawnSyncMock.mockImplementation((cmd: string) => {
      if (cmd === 'semgrep') return ok('1.45.0\n');
      if (cmd === 'osv-scanner') return ok('osv-scanner version: 1.7.4\n');
      if (cmd === 'lighthouse') return ok('12.2.1\n');
      if (cmd === 'git') return ok('git version 2.43.0\n');
      throw new Error(`Unexpected cmd: ${cmd}`);
    });

    const health = await getToolsHealth();

    expect(health.semgrep).toEqual({ status: 'found', version: '1.45.0' });
    expect(health['osv-scanner']).toEqual({
      status: 'found',
      version: 'osv-scanner version: 1.7.4',
    });
    expect(health.lighthouse).toEqual({ status: 'found', version: '12.2.1' });
    expect(health.git).toEqual({ status: 'found', version: 'git version 2.43.0' });
  });

  it('returns status=missing (no throw) when spawnSync surfaces ENOENT', async () => {
    spawnSyncMock.mockReturnValue(missing());

    const health = await getToolsHealth();

    expect(health.semgrep.status).toBe('missing');
    expect(health.semgrep.version).toBeUndefined();
    expect(health['osv-scanner'].status).toBe('missing');
    expect(health.lighthouse.status).toBe('missing');
    expect(health.git.status).toBe('missing');
  });

  it('returns status=missing when the binary exits with a non-zero code', async () => {
    spawnSyncMock.mockReturnValue(nonZero('command not found'));

    const health = await getToolsHealth();

    expect(health.semgrep.status).toBe('missing');
    expect(health.git.status).toBe('missing');
  });

  it('invokes spawnSync exactly once per tool with the --version flag', async () => {
    spawnSyncMock.mockReturnValue(ok('1.0.0'));

    await getToolsHealth();

    // Phase A added the typescript-language-server probe — bump from 4 to 5.
    expect(spawnSyncMock).toHaveBeenCalledTimes(5);
    const calls = spawnSyncMock.mock.calls.map((c) => ({
      cmd: c[0] as string,
      args: c[1] as string[],
    }));
    const cmds = calls.map((c) => c.cmd).sort();
    expect(cmds).toEqual([
      'git',
      'lighthouse',
      'osv-scanner',
      'semgrep',
      'typescript-language-server',
    ]);
    for (const c of calls) {
      expect(c.args).toContain('--version');
    }
  });

  it('handles a mixed found/missing scenario per tool independently', async () => {
    spawnSyncMock.mockImplementation((cmd: string) => {
      if (cmd === 'semgrep') return ok('1.45.0');
      if (cmd === 'osv-scanner') return missing();
      if (cmd === 'lighthouse') return nonZero('bad');
      if (cmd === 'git') return ok('git version 2.43.0');
      return missing();
    });

    const health = await getToolsHealth();

    expect(health.semgrep).toEqual({ status: 'found', version: '1.45.0' });
    expect(health['osv-scanner'].status).toBe('missing');
    expect(health.lighthouse.status).toBe('missing');
    expect(health.git).toEqual({ status: 'found', version: 'git version 2.43.0' });
  });

  it('does not throw even when spawnSync itself throws synchronously', async () => {
    spawnSyncMock.mockImplementation(() => {
      throw new Error('catastrophic spawn failure');
    });

    const health = await getToolsHealth();

    expect(health.semgrep.status).toBe('missing');
    expect(health['osv-scanner'].status).toBe('missing');
    expect(health.lighthouse.status).toBe('missing');
    expect(health.git.status).toBe('missing');
  });

  it('trims trailing whitespace/newlines from the captured version banner', async () => {
    spawnSyncMock.mockReturnValue(ok('   1.45.0\r\n\n'));

    const health = await getToolsHealth();

    expect(health.semgrep.version).toBe('1.45.0');
  });

  it('truncates pathological multi-line stdout to a single first line', async () => {
    spawnSyncMock.mockReturnValue(
      ok('git version 2.43.0\nextra debug noise\nmore noise'),
    );

    const health = await getToolsHealth();

    // We only want a compact, single-line banner — operators want signal, not logs.
    expect(health.git.version).toBe('git version 2.43.0');
    expect(health.git.version).not.toContain('debug noise');
  });

  it('returns status=missing when stdout is empty even on exit 0 (no usable version)', async () => {
    spawnSyncMock.mockReturnValue(ok(''));

    const health = await getToolsHealth();

    // No version banner → cannot confirm the tool is operational.
    expect(health.semgrep.status).toBe('missing');
    expect(health.semgrep.version).toBeUndefined();
  });
});
