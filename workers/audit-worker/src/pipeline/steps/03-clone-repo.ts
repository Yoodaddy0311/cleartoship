// Shallow clone the target GitHub repo into the OS tmp directory and walk
// the working tree so downstream steps have a real file list.

import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Step } from './index.js';
import { setRunCommitHash } from '../../firestore/writers.js';
import { recordStepOutcome } from '../lib/record-step-outcome.js';

const MAX_FILES = 20_000;
const MAX_DEPTH = 12;

// T1.1b cost guardrail: cap repo size to prevent unbounded clone/scan cost.
// Values are read at step execution time so tests / ops can override via env
// without rebuilding. Defaults: 500MB working tree, 5000 files.
function readPositiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function measureRepoBytes(root: string): Promise<number> {
  let total = 0;
  async function rec(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await rec(full, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = await fsp.stat(full);
          total += stat.size;
        } catch {
          // file vanished mid-walk — skip silently
        }
      }
    }
  }
  await rec(root, 0);
  return total;
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  '.cache',
  '.vercel',
  '.firebase',
  'dist',
  'build',
  'out',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.pnpm-store',
]);

async function walkTree(root: string): Promise<string[]> {
  const out: string[] = [];
  async function rec(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await rec(full, depth + 1);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  }
  await rec(root, 0);
  return out;
}

async function readHeadSha(clonePath: string): Promise<string | null> {
  try {
    const head = await fsp.readFile(path.join(clonePath, '.git', 'HEAD'), 'utf8');
    const trimmed = head.trim();
    if (trimmed.startsWith('ref: ')) {
      const refPath = path.join(clonePath, '.git', trimmed.slice(5));
      try {
        return (await fsp.readFile(refPath, 'utf8')).trim();
      } catch {
        const packed = await fsp.readFile(path.join(clonePath, '.git', 'packed-refs'), 'utf8');
        for (const line of packed.split('\n')) {
          if (line.endsWith(' ' + trimmed.slice(5))) return line.split(' ')[0]!;
        }
        return null;
      }
    }
    return trimmed || null;
  } catch {
    return null;
  }
}

export const step03CloneRepo: Step = {
  step: 'CLONE_REPO',
  async execute(ctx, state) {
    const dest = path.join(os.tmpdir(), `cleartoship-${ctx.runId}`);
    await fsp.rm(dest, { recursive: true, force: true });
    await fsp.mkdir(dest, { recursive: true });

    let simpleGit: typeof import('simple-git').simpleGit | null = null;
    try {
      ({ simpleGit } = await import('simple-git'));
    } catch (e) {
      ctx.log('warn', 'simple-git not available; using empty file tree', {
        error: (e as Error).message,
      });
      state.fileTree = [];
      ctx.clonePath = null;
      return;
    }

    try {
      // git ≥2.51 rejects several inherited env vars when not run inside an
      // already-trusted directory (CVE-2025-48384 / "the great git env audit"):
      //   - GIT_ASKPASS  → "Use of GIT_ASKPASS is not permitted ..."
      //   - GIT_TEMPLATE_DIR → "Use of GIT_TEMPLATE_DIR is not permitted ..."
      //   - GIT_PROXY_COMMAND, GIT_SSH(_COMMAND), etc.
      // Editors (VS Code, Cursor) set GIT_ASKPASS automatically, which bricks
      // EVERY worker clone in dev/CI inheriting that environment. We solve it
      // by building a minimal, explicit env (whitelist) and passing
      // GIT_TERMINAL_PROMPT=0 so git never blocks on interactive credentials.
      //
      // We intentionally do NOT set GIT_TEMPLATE_DIR to "suppress hooks":
      // template hooks only execute on commit/push; clone never invokes them,
      // so the previous "empty template dir" workaround was unnecessary.
      const baseEnv = process.env;
      const safeEnv: NodeJS.ProcessEnv = {
        PATH: baseEnv.PATH,
        HOME: baseEnv.HOME,
        USER: baseEnv.USER,
        USERPROFILE: baseEnv.USERPROFILE,
        LANG: baseEnv.LANG,
        LC_ALL: baseEnv.LC_ALL,
        TMPDIR: baseEnv.TMPDIR,
        TEMP: baseEnv.TEMP,
        TMP: baseEnv.TMP,
        SystemRoot: baseEnv.SystemRoot,
        APPDATA: baseEnv.APPDATA,
        LOCALAPPDATA: baseEnv.LOCALAPPDATA,
        GIT_TERMINAL_PROMPT: '0',
      };
      const git = simpleGit!(os.tmpdir()).env(safeEnv);
      await git.clone(ctx.repoUrl, dest, [
        '--depth',
        '1',
        '--single-branch',
        '--no-tags',
      ]);
    } catch (e) {
      const message = (e as Error).message;
      ctx.log('error', 'git clone failed', { error: message });
      state.pendingFindings.push({
        title: 'Repo 클론 실패',
        category: 'LAUNCH_READINESS',
        severity: 'P0',
        confidence: 'HIGH',
        summary: `git clone --depth=1 ${ctx.repoUrl} 실패: ${message}`,
        nonDeveloperExplanation:
          '저장소 코드를 가져올 수 없어 코드 기반 분석을 수행할 수 없습니다. URL이 올바른지, 공개 저장소인지 확인하세요.',
        technicalExplanation: `simple-git clone failed: ${message}`,
        impact: '정적 분석/시크릿 스캔/의존성 스캔 단계가 빈 상태로 진행됩니다.',
        recommendation: 'GitHub URL과 공개 여부, 네트워크 연결을 확인하고 다시 시도하세요.',
        acceptanceCriteria: ['repo가 정상적으로 clone 된다.'],
        tags: ['clone-failed'],
        evidences: [],
      });
      state.fileTree = [];
      ctx.clonePath = null;
      // BUG-1: clone failure still produces a P0 LAUNCH_READINESS finding —
      // that IS a measurement, so mark the step executed.
      recordStepOutcome(state, 'CLONE_REPO', 'CHECKPOINT');
      return;
    }

    const sha = await readHeadSha(dest);
    if (sha) await setRunCommitHash(ctx.runId, sha);

    const files = await walkTree(dest);

    // T1.1b: cost guardrail — abort if repo exceeds size/file caps. We measure
    // after walking so we count only files we'd actually scan (SKIP_DIRS
    // already filters node_modules / .git / build outputs). This avoids
    // false-positive blocks on repos with huge .git history that we already
    // shallow-cloned away.
    const maxFiles = readPositiveIntEnv('REPO_MAX_FILES', 5_000);
    const maxBytes = readPositiveIntEnv('REPO_MAX_BYTES', 500_000_000);
    const totalBytes = await measureRepoBytes(dest);
    if (files.length > maxFiles || totalBytes > maxBytes) {
      const reason = 'REPO_TOO_LARGE';
      ctx.log('warn', 'Repo exceeds guardrail caps — aborting audit', {
        files: files.length,
        bytes: totalBytes,
        maxFiles,
        maxBytes,
        reason,
      });
      state.pendingFindings.push({
        title: 'Repo가 감사 가능한 크기를 초과합니다',
        category: 'LAUNCH_READINESS',
        severity: 'P0',
        confidence: 'HIGH',
        summary:
          `Repo 크기/파일 수가 가드레일 한도를 초과해 감사를 중단했습니다 ` +
          `(files=${files.length}/${maxFiles}, bytes=${totalBytes}/${maxBytes}).`,
        nonDeveloperExplanation:
          '저장소가 너무 커서 끝까지 분석하면 비용이 너무 많이 듭니다. 부분 저장소나 모노레포의 한 패키지만 감사해보세요.',
        technicalExplanation:
          `Worker aborted after CLONE_REPO walk: files=${files.length} (cap ${maxFiles}), ` +
          `bytes=${totalBytes} (cap ${maxBytes}). Set REPO_MAX_FILES / REPO_MAX_BYTES ` +
          `env vars to raise caps if intentional.`,
        impact:
          '모든 후속 분석 단계(보안 스캔, 의존성 스캔, 기능 그래프 등)가 실행되지 않습니다.',
        recommendation:
          '1) 핵심 디렉터리만 별도 repo로 분리 후 다시 감사하거나 ' +
          '2) 운영자에게 REPO_MAX_FILES/REPO_MAX_BYTES 상한 조정을 요청하세요.',
        acceptanceCriteria: [
          `repo 파일 수 ≤ ${maxFiles}`,
          `repo 크기 ≤ ${Math.round(maxBytes / 1_000_000)}MB`,
        ],
        tags: ['repo-too-large', 'guardrail-tripped', reason],
        evidences: [],
      });
      state.fileTree = files;
      ctx.clonePath = dest;
      state.launchStatus = 'BLOCKED';
      state.abortReason = reason;
      recordStepOutcome(state, 'CLONE_REPO', 'CHECKPOINT');
      return;
    }

    state.fileTree = files;
    ctx.clonePath = dest;
    recordStepOutcome(state, 'CLONE_REPO', 'CHECKPOINT');
    ctx.log('info', 'Repo cloned', {
      fileCount: files.length,
      clonePath: dest,
      commit: sha ?? 'unknown',
      bytes: totalBytes,
    });
  },
};
