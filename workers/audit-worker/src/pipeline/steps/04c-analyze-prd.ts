// T2.1 / W2-C — ANALYZE_PRD step (No-LLM keyword matching).
//
// Reads candidate doc files from the clone root (README*, CHANGELOG*, CONTRIBUTING*,
// STATUS*, ROADMAP*, docs/PRD*, docs/spec*, package.json#description) and runs
// each through `analyzePrdText`. The merged result lives on `state.prdAnalysis`
// for step11 (`buildClaimMismatchFindings`) to surface mismatches against the
// measured W1-A / severity signals.
//
// No LLM, no network. Pure filesystem + regex.

import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  analyzePrdText,
  emptyPrdAnalysis,
  mergePrdAnalyses,
  type PrdAnalysis,
} from '@cleartoship/audit-core';
import type { Step } from './index.js';
import { recordStepOutcome } from '../lib/record-step-outcome.js';

const ROOT_DOC_CANDIDATES: ReadonlyArray<string> = [
  'README.md',
  'README.txt',
  'README.rst',
  'README',
  'CHANGELOG.md',
  'CHANGELOG',
  'CONTRIBUTING.md',
  'STATUS.md',
  'ROADMAP.md',
];

const NESTED_DOC_CANDIDATES: ReadonlyArray<string> = [
  'docs/PRD.md',
  'docs/prd.md',
  'docs/PRODUCT.md',
  'docs/spec.md',
  'docs/specification.md',
  'docs/README.md',
];

async function safeRead(absPath: string): Promise<string | null> {
  try {
    return await fsp.readFile(absPath, 'utf8');
  } catch {
    return null;
  }
}

async function readPackageDescription(clonePath: string): Promise<string | null> {
  const raw = await safeRead(path.join(clonePath, 'package.json'));
  if (!raw) return null;
  try {
    const pkg = JSON.parse(raw) as { description?: unknown; version?: unknown };
    const parts: string[] = [];
    if (typeof pkg.description === 'string') parts.push(pkg.description);
    if (typeof pkg.version === 'string') parts.push(`version ${pkg.version}`);
    return parts.length > 0 ? parts.join('\n') : null;
  } catch {
    return null;
  }
}

// W2-A: 사용자 업로드 PRD source 식별자. step04c 의 로그/finding 경로에서
// 파일시스템 후보와 구분되도록 고정된 sentinel 을 사용한다 (AC5 가 이 정확한
// 문자열을 sources 배열에서 확인).
const USER_PRD_SOURCE = 'user-prd-upload';

export async function collectPrdAnalysis(
  clonePath: string,
  userPrdText?: string | null,
): Promise<PrdAnalysis> {
  const parts: PrdAnalysis[] = [];
  for (const rel of [...ROOT_DOC_CANDIDATES, ...NESTED_DOC_CANDIDATES]) {
    const text = await safeRead(path.join(clonePath, rel));
    if (text) parts.push(analyzePrdText(text, rel));
  }
  const pkgDescription = await readPackageDescription(clonePath);
  if (pkgDescription) parts.push(analyzePrdText(pkgDescription, 'package.json'));
  // W2-A: 사용자가 /audits/new 에서 업로드/입력한 PRD 본문 병합. createAuditRun
  // 단계에서 trim+null 정규화가 이미 끝났으므로 여기서는 truthy 만 확인하면
  // 충분하다. 빈 문자열이 도달하면 false-positive sources 항목이 생길 위험이
  // 있어 한 번 더 trim 가드.
  if (userPrdText && userPrdText.trim().length > 0) {
    parts.push(analyzePrdText(userPrdText, USER_PRD_SOURCE));
  }
  return parts.length === 0 ? emptyPrdAnalysis() : mergePrdAnalyses(parts);
}

export const step04cAnalyzePrd: Step = {
  step: 'ANALYZE_PRD',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      ctx.log('warn', 'PRD analysis: no clone path; skipping', {});
      return;
    }
    state.prdAnalysis = await collectPrdAnalysis(ctx.clonePath, ctx.prdText);
    recordStepOutcome(state, 'ANALYZE_PRD', 'CHECKPOINT');
    ctx.log('info', 'PRD analysis complete', {
      mvpClaimed: state.prdAnalysis.mvpClaimed,
      betaClaimed: state.prdAnalysis.betaClaimed,
      productionClaimed: state.prdAnalysis.productionClaimed,
      sources: state.prdAnalysis.sources,
      hits: state.prdAnalysis.keywords.length,
    });
  },
};
