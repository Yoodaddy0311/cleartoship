// Dependency vulnerability scan via OSV-Scanner CLI. Gracefully skips when
// the binary is not installed.

import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import type { Step } from './index.js';
import type { NormalizedFinding } from '../../adapters/index.js';
import { writeToolResult } from '../../firestore/writers.js';
import { spawnTool } from '../tool-runner.js';

interface OsvResult {
  results?: Array<{
    source?: { path?: string };
    packages?: Array<{
      package?: { name?: string; version?: string; ecosystem?: string };
      vulnerabilities?: Array<{
        id?: string;
        summary?: string;
        details?: string;
        severity?: Array<{ type?: string; score?: string }>;
        database_specific?: { severity?: string };
      }>;
    }>;
  }>;
}

function osvSeverity(s: string | undefined): 'P0' | 'P1' | 'P2' | 'P3' {
  switch ((s ?? '').toUpperCase()) {
    case 'CRITICAL':
      return 'P0';
    case 'HIGH':
      return 'P1';
    case 'MODERATE':
    case 'MEDIUM':
      return 'P2';
    default:
      return 'P3';
  }
}

// O2: 동일 (package + ghsaId + version) 조합은 단일 finding으로 합치고,
// 다른 manifest(예: package.json vs functions/package.json)에서 발견된 경우는
// path만 evidences 배열에 누적한다. dashboard / report 양쪽의 중복 출력을 막는다.
export function dedupOsvFindings(findings: NormalizedFinding[]): NormalizedFinding[] {
  const byKey = new Map<string, NormalizedFinding>();
  for (const f of findings) {
    const ev = f.evidences[0];
    const meta = (ev?.metadata ?? {}) as { id?: unknown; package?: unknown; version?: unknown };
    const pkg = typeof meta.package === 'string' ? meta.package : 'unknown';
    const id = typeof meta.id === 'string' ? meta.id : 'OSV-UNKNOWN';
    const ver = typeof meta.version === 'string' ? meta.version : '?';
    const key = `${pkg}|${id}|${ver}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, f);
      continue;
    }
    // 동일 vuln이 다른 manifest에서 보고된 경우 — path만 evidences에 누적.
    const seenPaths = new Set(existing.evidences.map((e) => e.path));
    for (const incoming of f.evidences) {
      if (!seenPaths.has(incoming.path)) {
        existing.evidences.push(incoming);
        seenPaths.add(incoming.path);
      }
    }
  }
  return Array.from(byKey.values());
}

function mapOsv(raw: OsvResult): NormalizedFinding[] {
  const findings: NormalizedFinding[] = [];
  for (const r of raw.results ?? []) {
    for (const pkg of r.packages ?? []) {
      for (const vuln of pkg.vulnerabilities ?? []) {
        const pkgName = pkg.package?.name ?? 'unknown';
        const pkgVer = pkg.package?.version ?? '?';
        const id = vuln.id ?? 'OSV-UNKNOWN';
        findings.push({
          title: `${pkgName}@${pkgVer} — ${id}`,
          category: 'SECURITY_PRIVACY',
          severity: osvSeverity(vuln.database_specific?.severity),
          confidence: 'HIGH',
          summary: vuln.summary ?? id,
          nonDeveloperExplanation:
            '사용 중인 라이브러리에서 알려진 보안 약점이 발견되었습니다. 최신 버전으로 업데이트하면 일반적으로 해결됩니다.',
          technicalExplanation: vuln.details ?? null,
          impact: '취약점 유형에 따라 데이터 노출/원격 실행 등 위험이 있을 수 있습니다.',
          recommendation: `${pkgName}을(를) 패치된 버전으로 업그레이드하고 lockfile을 재생성하세요.`,
          acceptanceCriteria: [
            `${pkgName}이 패치된 버전 이상으로 업그레이드되었다.`,
            'OSV 재스캔 시 동일 ID가 더 이상 보고되지 않는다.',
          ],
          tags: ['osv', 'dependency'],
          evidences: [
            {
              type: 'OSV',
              source: 'osv-scanner',
              path: r.source?.path ?? null,
              lineStart: null,
              lineEnd: null,
              url: `https://osv.dev/vulnerability/${id}`,
              selector: null,
              screenshotPath: null,
              snippet: null,
              maskedValue: null,
              metadata: {
                id,
                package: pkgName,
                version: pkgVer,
                ecosystem: pkg.package?.ecosystem ?? null,
              },
            },
          ],
        });
      }
    }
  }
  return dedupOsvFindings(findings).slice(0, 200);
}

async function findLockfiles(root: string): Promise<string[]> {
  const candidates = [
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'requirements.txt',
    'poetry.lock',
    'Gemfile.lock',
    'go.sum',
    'Cargo.lock',
    'composer.lock',
  ];
  const found: string[] = [];
  for (const c of candidates) {
    try {
      await fsp.access(path.join(root, c));
      found.push(c);
    } catch {
      /* missing — ignore */
    }
  }
  return found;
}

export const step07DependencyScan: Step = {
  step: 'RUN_DEPENDENCY_SCAN',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      ctx.log('warn', 'OSV-Scanner skipped — no clone path');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'osv-scanner',
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'no clone path' },
        artifactPath: null,
      });
      return;
    }

    const lockfiles = await findLockfiles(ctx.clonePath);
    if (lockfiles.length === 0) {
      ctx.log('info', 'No lockfiles detected; skipping OSV');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'osv-scanner',
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'no lockfiles found' },
        artifactPath: null,
      });
      return;
    }

    const result = await spawnTool(
      'osv-scanner',
      ['--format=json', '--recursive', ctx.clonePath],
      { timeoutMs: 180_000 },
    );

    if (result.notInstalled) {
      ctx.log('warn', 'osv-scanner not installed; skipping');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'osv-scanner',
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'osv-scanner binary not found on PATH', lockfiles },
        artifactPath: null,
      });
      return;
    }

    // OSV-Scanner returns exit code 1 when vulnerabilities are found.
    const ok = result.exitCode === 0 || result.exitCode === 1;
    if (!ok) {
      ctx.log('warn', 'osv-scanner non-success exit', {
        exitCode: result.exitCode,
        stderr: result.stderr.slice(0, 500),
      });
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'osv-scanner',
        toolVersion: 'unknown',
        status: 'FAILED',
        rawSummary: { exitCode: result.exitCode, stderr: result.stderr.slice(0, 2000) },
        artifactPath: null,
      });
      return;
    }

    let parsed: OsvResult = {};
    try {
      parsed = JSON.parse(result.stdout) as OsvResult;
    } catch (e) {
      ctx.log('warn', 'OSV JSON parse failed', { error: (e as Error).message });
    }

    const findings = mapOsv(parsed);
    state.pendingFindings.push(...findings);

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: 'osv-scanner',
      toolVersion: 'unknown',
      status: 'SUCCESS',
      rawSummary: { vulns: findings.length, lockfiles, durationMs: result.durationMs },
      artifactPath: null,
    });
    // BUG-1: mark RUN_DEPENDENCY_SCAN executed only on SUCCESS path.
    state.executedSteps.push('RUN_DEPENDENCY_SCAN');
    ctx.log('info', 'Dependency scan complete', { vulns: findings.length });
  },
};
