import type { Step, PipelineState } from './index.js';
import type {
  CategoryScore,
  Finding,
  LaunchStatus,
} from '@cleartoship/shared-types';
import {
  buildCoverageMatrix,
  buildReport,
  type DetectedFeatureHint,
} from '@cleartoship/audit-core';
import { getFirestoreClient } from '../../firestore/client.js';
import { writeReport } from '../../firestore/writers.js';

export const step13GenerateReport: Step = {
  step: 'GENERATE_REPORT',
  async execute(ctx, state) {
    // Reload findings from Firestore so the report references stable ids.
    const db = getFirestoreClient();
    const snap = await db.collection(`auditRuns/${ctx.runId}/findings`).get();
    const findings: Finding[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        auditRunId: ctx.runId,
        title: data.title,
        category: data.category,
        severity: data.severity,
        confidence: data.confidence,
        status: data.status ?? 'OPEN',
        summary: data.summary,
        nonDeveloperExplanation: data.nonDeveloperExplanation ?? null,
        technicalExplanation: data.technicalExplanation ?? null,
        impact: data.impact ?? null,
        recommendation: data.recommendation ?? null,
        acceptanceCriteria: data.acceptanceCriteria ?? [],
        tags: data.tags ?? [],
        evidenceCount: data.evidenceCount ?? 0,
        createdAt: new Date().toISOString(),
      };
    });

    const categoryScores: CategoryScore[] = state.categoryScores ?? [];

    const oneLine = composeOneLineSummary(
      state.readinessScore,
      state.severityCounts,
      state.launchStatus,
    );

    // L-P0-5 (USP-2) — PRD Coverage Matrix. Built here (not in step04c) so we
    // can cross-reference the final persisted findings + stable detected
    // features. ctx.prdText may be null when the user didn't upload one — in
    // that case buildCoverageMatrix returns [] and the renderer skips §2.1.
    const coverageMatrix = buildCoverageMatrix({
      prdText: ctx.prdText,
      detectedFeatures: toFeatureHints(state),
      findings,
    });
    state.prdCoverageMatrix = [...coverageMatrix];

    const report = buildReport({
      projectName: deriveProjectName(ctx.repoUrl),
      repoUrl: ctx.repoUrl,
      deployUrl: ctx.deployUrl,
      commitHash: null,
      analyzedAt: new Date().toISOString(),
      techStack: state.techStack,
      readinessScore: state.readinessScore,
      launchStatus: state.launchStatus,
      categoryScores,
      severityCounts: state.severityCounts,
      findings,
      graphSummary: null,
      oneLineSummary: oneLine,
      coverageMatrix,
    });

    await writeReport(ctx.runId, {
      auditRunId: ctx.runId,
      readinessScore: report.readinessScore,
      launchStatus: report.launchStatus,
      categoryScores: report.categoryScores,
      severityCounts: report.severityCounts,
      executiveSummary: report.executiveSummary,
      markdown: report.markdown,
      ...(report.coverageMatrix ? { coverageMatrix: report.coverageMatrix } : {}),
      // L-P0-3: persist the deterministic ship verdict alongside the
      // markdown so the dashboard can render the §1 한 줄 결론 chip without
      // re-parsing the markdown body. buildReport always populates this
      // field (audit-core SSOT — worker never inlines the rules).
      ...(report.shipVerdict ? { shipVerdict: report.shipVerdict } : {}),
      // PR-A4-fix — source-driven inventory evidence flags surfaced in the
      // dashboard's strengths panel. Persisted so the web app can render
      // the positive cards without re-deriving them.
      inventorySignals: state.inventorySignals,
      // Audit Quality Roadmap §4.1 — 7-Question Launch Gate verdict. Optional
      // on the schema; only written when step12 produced one (older runs and
      // guardrail-blocked runs simply omit it → dashboard hides the chip).
      ...(state.launchGate ? { launchGate: state.launchGate } : {}),
    });
    ctx.log('info', 'Report generated', {
      length: report.markdown.length,
      coverageEntries: coverageMatrix.length,
      shipVerdict: report.shipVerdict?.verdict ?? null,
    });
  },
};

/**
 * Adapt `state.detectedFeatures` into the lean DetectedFeatureHint shape that
 * the coverage-matrix builder consumes. Keeps the SSOT inside audit-core (the
 * worker only knows how to flatten its own state).
 */
function toFeatureHints(state: PipelineState): DetectedFeatureHint[] {
  return state.detectedFeatures.map((feat) => ({
    id: feat.id,
    label: feat.label,
    primaryPath: feat.summary ?? feat.label,
    keywords: tokenizeLabel(feat.label),
  }));
}

function tokenizeLabel(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[\s/\\,.\-_()'"`]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function deriveProjectName(repoUrl: string): string {
  const m = /\/([^/]+?)(?:\.git)?\/?$/.exec(repoUrl);
  return m?.[1] ?? 'project';
}

export function composeOneLineSummary(
  score: number,
  counts: Record<'P0' | 'P1' | 'P2' | 'P3', number>,
  launchStatus: LaunchStatus,
): string {
  if (launchStatus === 'INDETERMINATE') {
    return '분석 표면이 부족해 출시 준비도를 산정하지 못했습니다. 도구 설치/배포 URL/PRD 입력을 보강한 뒤 다시 분석해 주세요.';
  }
  if (launchStatus === 'BLOCKED') {
    return '비용 가드레일이 작동해 감사를 중단했습니다. 저장소 크기/파일 수 한도를 확인하거나 운영자에게 상한 조정을 요청하세요.';
  }
  if (score >= 85) {
    return `이 프로젝트는 출시 준비도 ${score}점으로 양호한 상태입니다. 세부 개선 항목만 확인하세요.`;
  }
  if (counts.P0 > 0) {
    return `이 프로젝트는 출시 준비도 ${score}점이며, P0 출시 차단 이슈 ${counts.P0}개가 있어 우선 해결이 필요합니다.`;
  }
  return `이 프로젝트는 출시 준비도 ${score}점입니다. P1 이슈 ${counts.P1}개부터 차례로 개선하세요.`;
}
