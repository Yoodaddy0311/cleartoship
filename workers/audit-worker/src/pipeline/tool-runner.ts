// Helpers for invoking external CLI analysis tools (Semgrep, OSV-Scanner, ...)
// with graceful skip semantics. If a tool is not installed (ENOENT) the
// pipeline should NOT crash — we surface a `notInstalled` flag so the caller
// can write a SKIPPED tool result and move on.

import { spawn } from 'node:child_process';

export interface SpawnResult {
  /** True when the binary was not found on PATH (ENOENT). */
  notInstalled: boolean;
  /** Exit code (null if the process was killed or never spawned). */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Wall clock duration in ms. */
  durationMs: number;
}

export interface SpawnOptions {
  /** Working directory for the child process. */
  cwd?: string;
  /** Max wall-clock duration before the process is killed. */
  timeoutMs?: number;
  /** Maximum stdout/stderr size we will buffer (bytes). */
  maxBufferBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER = 50 * 1024 * 1024; // 50 MB — JSON output can be large.

/**
 * Spawn an external CLI tool with `shell: false`. Never interpolates user
 * input into a shell command. Returns a structured result; on ENOENT sets
 * `notInstalled: true` so the caller can degrade gracefully.
 */
export function spawnTool(
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnOptions = {},
): Promise<SpawnResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER;
  const startedAt = Date.now();

  return new Promise<SpawnResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killed = false;

    let child;
    try {
      child = spawn(command, [...args], {
        cwd: options.cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      resolve({
        notInstalled: err.code === 'ENOENT',
        exitCode: null,
        stdout: '',
        stderr: err.message ?? String(e),
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* swallow */
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxBuffer) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxBuffer) stderr += chunk.toString('utf8');
    });

    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({
        notInstalled: e.code === 'ENOENT',
        exitCode: null,
        stdout,
        stderr: stderr + (e.message ?? String(e)),
        durationMs: Date.now() - startedAt,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        notInstalled: false,
        exitCode: killed ? null : code,
        stdout,
        stderr: killed ? stderr + '\n[killed by timeout]' : stderr,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}
