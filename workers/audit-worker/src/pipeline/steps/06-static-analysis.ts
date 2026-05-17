// Semgrep CE static analysis. Invokes `semgrep --config=auto --json` against
// the cloned working tree. Gracefully skips when the binary is not present.

import type { Step } from './index.js';
import type { NormalizedFinding } from '../../adapters/index.js';
import { writeToolResult } from '../../firestore/writers.js';
import { spawnTool } from '../tool-runner.js';
import { recordStepOutcome } from '../lib/record-step-outcome.js';
import { explainRuleFamily } from '@cleartoship/audit-core';

interface SemgrepResult {
  results?: Array<{
    check_id?: string;
    path?: string;
    start?: { line?: number };
    end?: { line?: number };
    extra?: {
      message?: string;
      severity?: string;
      lines?: string;
      metadata?: Record<string, unknown>;
    };
  }>;
  errors?: unknown[];
}

const SEV_MAP: Record<string, 'P0' | 'P1' | 'P2' | 'P3'> = {
  ERROR: 'P0',
  WARNING: 'P1',
  INFO: 'P2',
};

// SSOT: rule-family explanations live in `@cleartoship/audit-core/i18n/
// rule-family-explanations`. Worker only adds a severity-urgency suffix.
function urgencySuffix(severity: 'P0' | 'P1' | 'P2' | 'P3'): string {
  if (severity === 'P0') return '⚠️ 가능한 한 빨리 고쳐주세요.';
  if (severity === 'P1') return '🔧 출시 전에 확인하면 좋아요.';
  return '💡 시간 될 때 점검해두세요.';
}

function explainSemgrepRule(ruleId: string, severity: 'P0' | 'P1' | 'P2' | 'P3'): string {
  const resolved = explainRuleFamily(ruleId, 'ko');
  if (resolved) return `${resolved.summary} ${urgencySuffix(severity)}`;
  return '코드 검사 도구가 잠재적 보안/품질 문제를 발견했습니다. 어떤 코드인지는 아래 “기술 설명”을 참고하고, 해당 라인을 검토해주세요.';
}

function mapResults(raw: SemgrepResult): NormalizedFinding[] {
  if (!raw.results || raw.results.length === 0) return [];
  return raw.results.slice(0, 200).map((r) => {
    const ruleId = r.check_id ?? 'semgrep-unknown';
    const sevKey = (r.extra?.severity ?? 'INFO').toUpperCase();
    const severity = SEV_MAP[sevKey] ?? 'P2';
    const message = r.extra?.message ?? ruleId;
    return {
      title: `Semgrep: ${ruleId}`,
      category: 'SECURITY_PRIVACY',
      severity,
      confidence: 'MEDIUM',
      summary: message,
      nonDeveloperExplanation: explainSemgrepRule(ruleId, severity),
      technicalExplanation: `Semgrep rule ${ruleId} matched ${r.path}:${r.start?.line ?? '?'}.`,
      impact: '취약점 유형에 따라 보안/품질 영향이 달라질 수 있습니다.',
      recommendation: '해당 라인을 검토하고 규칙 가이드라인에 따라 수정하세요.',
      acceptanceCriteria: ['해당 패턴이 재발하지 않도록 코드가 수정되었다.'],
      tags: ['semgrep', sevKey.toLowerCase()],
      evidences: [
        {
          type: 'SEMGREP',
          source: 'semgrep',
          path: r.path ?? null,
          lineStart: r.start?.line ?? null,
          lineEnd: r.end?.line ?? null,
          url: null,
          selector: null,
          screenshotPath: null,
          snippet: r.extra?.lines ?? null,
          maskedValue: null,
          metadata: { rule: ruleId, ...(r.extra?.metadata ?? {}) },
        },
      ],
    };
  });
}

export const step06StaticAnalysis: Step = {
  step: 'RUN_STATIC_ANALYSIS',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      ctx.log('warn', 'Semgrep skipped — no clone path');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'semgrep',
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'no clone path' },
        artifactPath: null,
      });
      return;
    }

    const result = await spawnTool(
      'semgrep',
      ['--config=auto', '--json', '--quiet', '--timeout=60', '--metrics=off', ctx.clonePath],
      { timeoutMs: 180_000 },
    );

    if (result.notInstalled) {
      ctx.log('warn', 'Semgrep not installed; skipping');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'semgrep',
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'semgrep binary not found on PATH' },
        artifactPath: null,
      });
      return;
    }

    // Semgrep exits 1 when findings exist — treat 0 and 1 as success.
    const ok = result.exitCode === 0 || result.exitCode === 1;
    if (!ok) {
      ctx.log('warn', 'Semgrep exited non-success', {
        exitCode: result.exitCode,
        stderr: result.stderr.slice(0, 500),
      });
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'semgrep',
        toolVersion: 'unknown',
        status: 'FAILED',
        rawSummary: { exitCode: result.exitCode, stderr: result.stderr.slice(0, 2000) },
        artifactPath: null,
      });
      return;
    }

    let parsed: SemgrepResult = {};
    try {
      parsed = JSON.parse(result.stdout) as SemgrepResult;
    } catch (e) {
      ctx.log('warn', 'Semgrep JSON parse failed', { error: (e as Error).message });
    }

    const findings = mapResults(parsed);
    state.pendingFindings.push(...findings);

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: 'semgrep',
      toolVersion: 'unknown',
      status: 'SUCCESS',
      rawSummary: {
        findings: findings.length,
        rawCount: parsed.results?.length ?? 0,
        durationMs: result.durationMs,
      },
      artifactPath: null,
    });
    // BUG-1: only mark RUN_STATIC_ANALYSIS as executed on the SUCCESS path.
    // The skip/fail branches above already returned without pushing.
    recordStepOutcome(state, 'RUN_STATIC_ANALYSIS', 'CHECKPOINT');
    ctx.log('info', 'Static analysis complete', { findings: findings.length });
  },
};
