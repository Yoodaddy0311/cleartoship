import type {
  AuditReport,
  CategoryScore,
  Finding,
  LaunchStatus,
  Severity,
} from '@cleartoship/shared-types';
import { LAUNCH_STATUS_LABELS_KO } from '@cleartoship/shared-types';

/**
 * Render an AuditReport markdown body following `06_audit_report_template.md`.
 * The shape is intentionally readable and Claude/Cursor-pasteable.
 */

export interface RenderReportInput {
  projectName: string;
  repoUrl: string;
  deployUrl: string | null;
  commitHash: string | null;
  analyzedAt: string;
  techStack: ReadonlyArray<string>;
  readinessScore: number;
  launchStatus: LaunchStatus;
  categoryScores: ReadonlyArray<CategoryScore>;
  severityCounts: Record<Severity, number>;
  findings: ReadonlyArray<Finding>;
  graphSummary: string | null;
  oneLineSummary: string;
}

export function renderAuditReportMarkdown(input: RenderReportInput): string {
  const lines: string[] = [];

  lines.push(`# ${input.projectName} ClearToShip Audit Report`, '');

  // §1 Executive Summary
  lines.push('## 1. Executive Summary', '', '### 종합 판단', '', '```text');
  lines.push(`Product Readiness Score: ${input.readinessScore}/100`);
  lines.push(`출시 가능 상태: ${LAUNCH_STATUS_LABELS_KO[input.launchStatus]}`);
  lines.push(`P0 이슈: ${input.severityCounts.P0}개`);
  lines.push(`P1 이슈: ${input.severityCounts.P1}개`);
  lines.push(`P2 이슈: ${input.severityCounts.P2}개`);
  lines.push(`P3 이슈: ${input.severityCounts.P3}개`);
  lines.push('```', '', '### 한 줄 요약', '', `> ${input.oneLineSummary}`, '');

  // §1 Top 5
  lines.push('### 가장 먼저 볼 항목 TOP 5', '');
  lines.push('| 우선순위 | 항목 | 카테고리 | 이유 |');
  lines.push('|---:|---|---|---|');
  const topFive = sortBySeverity(input.findings).slice(0, 5);
  topFive.forEach((f, idx) => {
    const reason = (f.summary ?? f.title).replace(/\n/g, ' ');
    lines.push(`| ${idx + 1} | ${f.title} | ${f.category} | ${reason} |`);
  });
  if (topFive.length === 0) {
    lines.push('| - | (이슈 없음) | - | 양호 |');
  }
  lines.push('');

  // §2 Input
  lines.push('## 2. 입력 정보', '');
  lines.push('| 항목 | 값 |', '|---|---|');
  lines.push(`| GitHub Repo | ${input.repoUrl} |`);
  lines.push(`| Commit Hash | ${input.commitHash ?? '-'} |`);
  lines.push(`| 배포 URL | ${input.deployUrl ?? '-'} |`);
  lines.push(`| 분석 일시 | ${input.analyzedAt} |`);
  lines.push(`| 주요 기술 스택 | ${input.techStack.join(', ') || '-'} |`);
  lines.push('');

  // §3 Category scores
  lines.push('## 3. 영역별 점수', '');
  lines.push('| 카테고리 | 점수 | 상태 | 핵심 요약 |');
  lines.push('|---|---:|---|---|');
  for (const cs of input.categoryScores) {
    lines.push(
      `| ${cs.label} | ${cs.score} | ${categoryStatusLabel(cs.score)} | ${cs.summary ?? '-'} |`,
    );
  }
  lines.push('');

  // §4 Feature graph summary
  lines.push('## 4. 기능 관계도 요약', '', input.graphSummary ?? '_분석 데이터 부족_', '');

  // §5 P0 / §6 P1
  lines.push('## 5. P0 출시 차단 이슈', '');
  const p0List = input.findings.filter((f) => f.severity === 'P0');
  if (p0List.length === 0) {
    lines.push('> P0 이슈가 없습니다.', '');
  } else {
    p0List.forEach((f, idx) => lines.push(...renderFindingBlock(`P0-${pad(idx + 1)}`, f)));
  }

  lines.push('## 6. P1 핵심 개선 이슈', '');
  const p1List = input.findings.filter((f) => f.severity === 'P1');
  if (p1List.length === 0) {
    lines.push('> P1 이슈가 없습니다.', '');
  } else {
    p1List.forEach((f, idx) => lines.push(...renderFindingBlock(`P1-${pad(idx + 1)}`, f)));
  }

  // §14 disclaimer
  lines.push(
    '## 14. Disclaimer',
    '',
    '본 리포트는 GitHub Repo, 배포 URL, 업로드된 문서, 오픈소스 분석 도구 결과를 기반으로 자동 생성되었습니다. 로그인 뒤 비공개 화면, 외부 서비스 실제 계정 상태, 운영 DB 내부 데이터, 런타임 환경의 일부 문제는 분석 범위에서 제외될 수 있습니다.',
    '',
  );

  return lines.join('\n');
}

function sortBySeverity<T extends Pick<Finding, 'severity'>>(arr: ReadonlyArray<T>): T[] {
  const order: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return [...arr].sort((a, b) => order[a.severity] - order[b.severity]);
}

function categoryStatusLabel(score: number): string {
  if (score >= 85) return '양호';
  if (score >= 70) return '조건부';
  if (score >= 55) return '보완 필요';
  if (score >= 40) return '위험';
  return '부적합';
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function renderFindingBlock(id: string, f: Finding): string[] {
  const out: string[] = [];
  out.push(`### ${id}. ${f.title}`, '');
  out.push('| 항목 | 내용 |', '|---|---|');
  out.push(`| 카테고리 | ${f.category} |`);
  out.push(`| 위험도 | ${f.severity} |`);
  out.push(`| Confidence | ${f.confidence} |`);
  out.push('');
  out.push('**비개발자 설명**', '', f.nonDeveloperExplanation ?? f.summary, '');
  out.push('**전문가 근거**', '', '```text', f.technicalExplanation ?? '도구 근거 미상', '```', '');
  out.push('**영향**', '', f.impact ?? '_파악 중_', '');
  out.push('**개선 방향**', '', f.recommendation ?? '_파악 중_', '');
  if (f.acceptanceCriteria.length > 0) {
    out.push('**수용 기준**', '');
    for (const ac of f.acceptanceCriteria) out.push(`- [ ] ${ac}`);
    out.push('');
  }
  return out;
}

export function buildReport(args: RenderReportInput): Pick<
  AuditReport,
  'readinessScore' | 'launchStatus' | 'categoryScores' | 'severityCounts' | 'executiveSummary' | 'markdown'
> {
  return {
    readinessScore: args.readinessScore,
    launchStatus: args.launchStatus,
    categoryScores: [...args.categoryScores],
    severityCounts: args.severityCounts,
    executiveSummary: args.oneLineSummary,
    markdown: renderAuditReportMarkdown(args),
  };
}
