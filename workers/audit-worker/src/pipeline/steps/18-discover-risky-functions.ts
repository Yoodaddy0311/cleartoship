// DISCOVER_RISKY_FUNCTIONS — identifies risky function candidates via name and
// body heuristics (auth, payment, hard-delete, PII, auth-boundary,
// untransactioned data mutation). Pre-LLM stage: severity is estimated P2 and
// findings are tagged 'risky-function' for later verification.

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import type { Step } from './index.js';
import type { NormalizedFinding } from '../../adapters/index.js';
import {
  discoverRiskyFunctions,
  type RiskCategory,
  type RiskyFunction,
} from '@cleartoship/audit-core';
import type { AuditCategory } from '@cleartoship/shared-types';
import { writeToolResult } from '../../firestore/writers.js';

const MAX_RISKY = 30;

const CATEGORY_TO_AUDIT: Record<RiskCategory, AuditCategory> = {
  auth: 'SECURITY_PRIVACY',
  payment: 'BACKEND_API',
  delete: 'BACKEND_API',
  pii: 'SECURITY_PRIVACY',
  'auth-boundary': 'SECURITY_PRIVACY',
  'data-mutation': 'BACKEND_API',
};

function riskyToFinding(r: RiskyFunction): NormalizedFinding {
  return {
    title: `위험 함수 후보: ${r.name} (${r.category})`,
    category: CATEGORY_TO_AUDIT[r.category],
    severity: 'P2',
    confidence: 'LOW',
    summary: `${r.path}:${r.line}의 ${r.name} 함수가 ${r.category} 동작을 수행하는 것으로 보입니다. ${r.reason}`,
    nonDeveloperExplanation:
      '권한, 결제, 삭제, 개인정보 등 민감한 동작을 수행하는 것으로 보이는 함수가 발견됐어요. 개발자 검토가 필요합니다.',
    technicalExplanation: `Heuristic match — category=${r.category}, file=${r.path}:${r.line}, reason="${r.reason}".`,
    impact:
      '권한 체크 누락, 트랜잭션 누락, 감사 로그 누락 등이 있을 경우 데이터 유실/탈취 위험이 있습니다.',
    recommendation: `이 함수는 ${r.category} 동작을 하는 것으로 보입니다. 권한 체크, 트랜잭션, 감사 로그가 있는지 검토하세요.`,
    acceptanceCriteria: [
      '해당 함수의 권한 체크/인증 경계가 명시적으로 검증되었다.',
      '데이터 변경 시 트랜잭션과 감사 로그가 포함되어 있다.',
    ],
    tags: ['risky-function', r.category],
    evidences: [
      {
        type: 'CODE_SNIPPET',
        source: 'risky-function-discovery',
        path: r.path,
        lineStart: r.line,
        lineEnd: r.line,
        url: null,
        selector: null,
        screenshotPath: null,
        snippet: r.snippet,
        maskedValue: null,
        metadata: {
          category: r.category,
          reason: r.reason,
          importedFrom: r.importedFrom,
        },
      },
    ],
  };
}

export const step18DiscoverRiskyFunctions: Step = {
  step: 'DISCOVER_RISKY_FUNCTIONS',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      ctx.log('warn', 'Risky function discovery skipped — no clone path');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'risky-function-discovery',
        toolVersion: '1.0.0',
        status: 'SKIPPED',
        rawSummary: { reason: 'no clone path' },
        artifactPath: null,
      });
      return;
    }

    if (state.fileTree.length === 0) {
      ctx.log('info', 'Risky function discovery skipped — empty file tree');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'risky-function-discovery',
        toolVersion: '1.0.0',
        status: 'SKIPPED',
        rawSummary: { reason: 'empty file tree' },
        artifactPath: null,
      });
      return;
    }

    const clonePath = ctx.clonePath;
    const risky = await discoverRiskyFunctions({
      projectRoot: clonePath,
      fileTree: state.fileTree,
      maxFunctions: MAX_RISKY,
      readFile: async (rel) => {
        const full = path.join(clonePath, rel);
        try {
          return await fsp.readFile(full, 'utf8');
        } catch {
          return '';
        }
      },
    });

    state.riskyFunctions = risky;

    const findings = risky.map(riskyToFinding);
    state.pendingFindings.push(...findings);

    const byCategory: Record<string, number> = {};
    for (const r of risky) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    }

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: 'risky-function-discovery',
      toolVersion: '1.0.0',
      status: 'SUCCESS',
      rawSummary: {
        riskyFunctions: risky.length,
        findingsEmitted: findings.length,
        byCategory,
      },
      artifactPath: null,
    });
    ctx.log('info', 'Risky function discovery complete', {
      count: risky.length,
      byCategory,
    });
  },
};
