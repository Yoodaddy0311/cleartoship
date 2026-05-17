// External-tool readiness probe.
//
// The audit pipeline shells out to semgrep / osv-scanner / lighthouse / git;
// when any of them is absent the pipeline silently produces zero findings,
// which is indistinguishable from a clean run. This module gives operators a
// one-shot way to confirm tool availability via `/healthz` before a demo.
//
// Design notes:
//   - We use `spawnSync(cmd, ['--version'])` per tool. The probe is short and
//     synchronous per-tool; we still wrap each in a Promise so the caller can
//     Promise.all the four probes for parallelism on multi-core machines.
//   - Failures (ENOENT, non-zero exit, sync throw, empty stdout) collapse into
//     `{ status: 'missing' }` — the endpoint must stay 200 in degraded mode.
//   - Version banners are normalised to the first non-empty line, trimmed,
//     to keep the JSON payload small and operator-friendly.

import { spawnSync } from 'node:child_process';

export const TOOL_NAMES = ['semgrep', 'osv-scanner', 'lighthouse', 'git'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type ToolStatus = 'found' | 'missing';

export interface ToolEntry {
  status: ToolStatus;
  version?: string;
}

export type ToolsHealth = Record<ToolName, ToolEntry>;

const PROBE_TIMEOUT_MS = 3000;

function firstNonEmptyLine(raw: string): string | null {
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function probeOne(tool: ToolName): ToolEntry {
  // Wrap the spawnSync call so any unexpected throw (e.g. invalid args on an
  // exotic platform) degrades to `missing` rather than rejecting the probe.
  try {
    // On Windows, npm-installed CLIs ship as `<name>.cmd` shims which can't
    // be spawned without a shell. We use `shell: true` AND forward the
    // current process env so the inherited PATH (with Python Scripts, npm
    // global, etc.) is preserved into the cmd.exe child.
    const isWin = process.platform === 'win32';
    const result = spawnSync(tool, ['--version'], {
      encoding: 'utf8',
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
      shell: isWin,
      env: process.env,
    });
    if (result.error || result.status !== 0) {
      return { status: 'missing' };
    }
    const stdout = typeof result.stdout === 'string'
      ? result.stdout
      : (result.stdout as unknown as Buffer | null)?.toString('utf8') ?? '';
    const version = firstNonEmptyLine(stdout);
    if (!version) {
      return { status: 'missing' };
    }
    return { status: 'found', version };
  } catch {
    return { status: 'missing' };
  }
}

export async function getToolsHealth(): Promise<ToolsHealth> {
  // Promise.all to fan out the per-tool probes. spawnSync itself is blocking,
  // but wrapping in async functions lets the JS scheduler interleave I/O.
  const entries = await Promise.all(
    TOOL_NAMES.map(async (tool) => [tool, probeOne(tool)] as const),
  );
  // Build the record immutably so callers can rely on the shape.
  const out = {} as ToolsHealth;
  for (const [tool, entry] of entries) {
    out[tool] = entry;
  }
  return out;
}

export function getToolsHealthSync(): ToolsHealth {
  // Sync variant for callers (like the Express /healthz handler) that must
  // respond on the same tick. Each spawnSync call is itself blocking, so
  // there's no performance benefit to going async here — only an interface
  // simplification that lets the route stay synchronous.
  const out = {} as ToolsHealth;
  for (const tool of TOOL_NAMES) {
    out[tool] = probeOne(tool);
  }
  return out;
}

export function overallToolsStatus(health: ToolsHealth): 'ok' | 'degraded' {
  for (const tool of TOOL_NAMES) {
    if (health[tool].status !== 'found') return 'degraded';
  }
  return 'ok';
}
