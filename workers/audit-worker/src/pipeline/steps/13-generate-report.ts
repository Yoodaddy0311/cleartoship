import type { Step } from './index.js';
import type { CategoryScore, Finding, LaunchStatus } from '@cleartoship/shared-types';
import { buildReport } from '@cleartoship/audit-core';
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

    const categoryScores: CategoryScore[] =
      (state as unknown as { __categoryScores?: CategoryScore[] }).__categoryScores ?? [];

    const oneLine = composeOneLineSummary(
      state.readinessScore,
      state.severityCounts,
      state.launchStatus,
    );

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
    });

    await writeReport(ctx.runId, {
      auditRunId: ctx.runId,
      readinessScore: report.readinessScore,
      launchStatus: report.launchStatus,
      categoryScores: report.categoryScores,
      severityCounts: report.severityCounts,
      executiveSummary: report.executiveSummary,
      markdown: report.markdown,
    });
    ctx.log('info', 'Report generated', { length: report.markdown.length });
  },
};

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
  if (score >= 85) {
    return `이 프로젝트는 출시 준비도 ${score}점으로 양호한 상태입니다. 세부 개선 항목만 확인하세요.`;
  }
  if (counts.P0 > 0) {
    return `이 프로젝트는 출시 준비도 ${score}점이며, P0 출시 차단 이슈 ${counts.P0}개가 있어 우선 해결이 필요합니다.`;
  }
  return `이 프로젝트는 출시 준비도 ${score}점입니다. P1 이슈 ${counts.P1}개부터 차례로 개선하세요.`;
}
