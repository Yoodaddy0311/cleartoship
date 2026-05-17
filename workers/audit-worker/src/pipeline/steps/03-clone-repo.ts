// Shallow clone the target GitHub repo into the OS tmp directory and walk
// the working tree so downstream steps have a real file list.

import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Step } from './index.js';
import { setRunCommitHash } from '../../firestore/writers.js';

const MAX_FILES = 20_000;
const MAX_DEPTH = 12;
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
      state.executedSteps.push('CLONE_REPO');
      return;
    }

    const sha = await readHeadSha(dest);
    if (sha) await setRunCommitHash(ctx.runId, sha);

    const files = await walkTree(dest);
    state.fileTree = files;
    ctx.clonePath = dest;
    state.executedSteps.push('CLONE_REPO');
    ctx.log('info', 'Repo cloned', {
      fileCount: files.length,
      clonePath: dest,
      commit: sha ?? 'unknown',
    });
  },
};
