import type {
  AuditReport,
  CategoryScore,
  CoverageMatrixEntry,
  Finding,
  LaunchStatus,
  Severity,
  ShipVerdict,
} from '@cleartoship/shared-types';
import { LAUNCH_STATUS_LABELS_KO } from '@cleartoship/shared-types';
import {
  W1B_CHECKLIST,
  W1B_FINE_PATTERNS,
  getW1BItem,
  isW1BId,
} from '../intent/w1b-checklist.js';
import { W1A_CHECKLIST, isW1AId } from '../intent/w1a-checklist.js';
import {
  BUSINESS_READINESS_CHECKLIST,
  isBusinessReadinessId,
} from '../intent/business-checklist.js';
import { renderCoverageMatrixMarkdown } from '../render-coverage-matrix.js';
import { renderShipVerdict, renderShipVerdictMarkdown } from '../render-ship-verdict.js';

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
  /**
   * L-P0-5 (USP-2) — PRD Coverage Matrix entries (one row per claim). When
   * omitted or empty, the §2.1 PRD Coverage Matrix subsection is skipped so
   * runs without an uploaded PRD render identically to the legacy layout.
   */
  coverageMatrix?: ReadonlyArray<CoverageMatrixEntry>;
  /**
   * L-P0-3 — optional pre-computed ship verdict. When supplied, renders before
   * §1 Executive Summary as the "한 줄 결론" header. When omitted, the renderer
   * derives one from `findings` + `readinessScore` + `severityCounts` via
   * `renderShipVerdict` so the header is never missing the verdict line —
   * older callers that don't yet pre-compute keep working unchanged.
   */
  shipVerdict?: ShipVerdict;
}

export function renderAuditReportMarkdown(input: RenderReportInput): string {
  const lines: string[] = [];

  lines.push(`# ${input.projectName} ClearToShip Audit Report`, '');

  // L-P0-3: §1 한 줄 결론 — deterministic verdict block prepended above the
  // Executive Summary so the reader sees the single-line conclusion first.
  // Verdict is worker-supplied when available (same object persists on the
  // AuditReport doc); otherwise we derive one from the inputs to keep the
  // markdown surface self-healing.
  //
  // INDETERMINATE branch: the §1 Executive Summary intentionally masks numeric
  // signals (N/A 판단 불가), so we suppress the ship-verdict block too — its
  // score/Confidence/Top-blockers line would otherwise re-surface the very
  // numbers the INDETERMINATE policy hides.
  if (input.launchStatus !== 'INDETERMINATE') {
    const verdict =
      input.shipVerdict ??
      renderShipVerdict({
        scores: input.categoryScores,
        findings: input.findings,
        profile: null,
        launchStatus: input.launchStatus,
        overallScore: input.readinessScore,
      });
    lines.push(
      renderShipVerdictMarkdown(verdict, { findings: input.findings }),
    );
  }

  // §1 Executive Summary
  // INDETERMINATE: 분석 표면 부족 → dashboard 헤더(N/A 판단 불가) / 영역 카드 / 한 줄 요약과
  // 패리티를 맞추기 위해 점수/P-count 노출을 모두 N/A로 대체. 정상 분기는 기존 그대로.
  const isIndeterminate = input.launchStatus === 'INDETERMINATE';
  lines.push('## 1. Executive Summary', '', '### 종합 판단', '', '```text');
  lines.push(
    `Product Readiness Score: ${isIndeterminate ? 'N/A' : `${input.readinessScore}/100`}`,
  );
  lines.push(`출시 가능 상태: ${LAUNCH_STATUS_LABELS_KO[input.launchStatus]}`);
  lines.push(`P0 이슈: ${isIndeterminate ? 'N/A' : `${input.severityCounts.P0}개`}`);
  lines.push(`P1 이슈: ${isIndeterminate ? 'N/A' : `${input.severityCounts.P1}개`}`);
  lines.push(`P2 이슈: ${isIndeterminate ? 'N/A' : `${input.severityCounts.P2}개`}`);
  lines.push(`P3 이슈: ${isIndeterminate ? 'N/A' : `${input.severityCounts.P3}개`}`);
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

  // §1 W1-A launch readiness checklist (T1.2-FU). Default-pass model: a W1-A
  // item is FAIL only when at least one finding tagged with its sub-ID exists.
  // The worker emits one P2 finding per FAIL'd item from evaluateW1AChecklist.
  lines.push(...renderW1ASection(input.findings));

  // §2 Input
  lines.push('## 2. 입력 정보', '');
  lines.push('| 항목 | 값 |', '|---|---|');
  lines.push(`| GitHub Repo | ${input.repoUrl} |`);
  lines.push(`| Commit Hash | ${input.commitHash ?? '-'} |`);
  lines.push(`| 배포 URL | ${input.deployUrl ?? '-'} |`);
  lines.push(`| 분석 일시 | ${input.analyzedAt} |`);
  lines.push(`| 주요 기술 스택 | ${input.techStack.join(', ') || '-'} |`);
  lines.push('');

  // §2.1 PRD Coverage Matrix (L-P0-5 / USP-2). Only rendered when the worker
  // attached entries — runs without a user PRD skip the entire subsection per
  // spec §C.6 (PRD 없음 edge case).
  if (input.coverageMatrix && input.coverageMatrix.length > 0) {
    const coverageMd = renderCoverageMatrixMarkdown(input.coverageMatrix, {
      includeHeading: false,
    });
    if (coverageMd.length > 0) {
      lines.push('### §2.1 PRD Coverage Matrix', '');
      lines.push(coverageMd);
    }
  }

  // §3 Category scores
  lines.push('## 3. 영역별 점수', '');
  lines.push('| 카테고리 | 점수 | 상태 | 핵심 요약 |');
  lines.push('|---|---:|---|---|');
  for (const cs of input.categoryScores) {
    const scoreCell = cs.score === null ? 'N/A' : String(cs.score);
    const statusCell = cs.score === null ? '판단 불가' : categoryStatusLabel(cs.score);
    lines.push(
      `| ${cs.label} | ${scoreCell} | ${statusCell} | ${cs.summary ?? '-'} |`,
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

  // §7 W1-B risky-function checklist grouping (T1.3).
  lines.push(...renderW1BSection(input.findings));

  // §8 Business Readiness (T2.8 / UPG-06).
  lines.push(...renderBusinessReadinessSection(input.findings));

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

// T1.3: group findings tagged W1-B* under a single section. Each row is a
// (W1-B ID, label, count, P0/P1/P2/P3 breakdown). Empty groups still surface
// so reviewers can confirm "no risky entries found" rather than mistaking the
// absence for a missing scan.
function renderW1BSection(findings: ReadonlyArray<Finding>): string[] {
  const out: string[] = [];
  out.push('## 7. W1-B 위험 함수 체크리스트', '');
  out.push('| 체크리스트 ID | 항목 | 건수 | P0 | P1 | P2 | P3 |');
  out.push('|---|---|---:|---:|---:|---:|---:|');

  const byId = new Map<string, Finding[]>();
  for (const f of findings) {
    const ids = f.tags.filter(isW1BId);
    for (const id of ids) {
      const bucket = byId.get(id) ?? [];
      bucket.push(f);
      byId.set(id, bucket);
    }
  }

  for (const item of W1B_CHECKLIST) {
    const group = byId.get(item.id) ?? [];
    const counts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const f of group) counts[f.severity]++;
    out.push(
      `| ${item.id} | ${item.label} | ${group.length} | ${counts.P0} | ${counts.P1} | ${counts.P2} | ${counts.P3} |`,
    );
  }
  out.push('');

  const total = Array.from(byId.values()).reduce((a, b) => a + b.length, 0);
  if (total === 0) {
    out.push('> 위험 함수 후보가 감지되지 않았습니다. (스캔은 정상 수행되었습니다.)', '');
  } else {
    for (const item of W1B_CHECKLIST) {
      const group = byId.get(item.id);
      if (!group || group.length === 0) continue;
      const meta = getW1BItem(item.id);
      out.push(`### ${item.id} ${meta?.label ?? item.label}`, '');
      out.push(`_${meta?.description ?? ''}_`, '');
      for (const f of group) out.push(`- **${f.severity}** · ${f.title}`);
      out.push('');
    }

    // T1.3-FU: fine-grained pattern breakdown. The expanded grid (W1-B7..) has
    // 70+ entries; rendering every one as a table row would drown out signal,
    // so we list only populated fine patterns under a single sub-section.
    const fineHits = W1B_FINE_PATTERNS.filter((p) => (byId.get(p.id) ?? []).length > 0);
    if (fineHits.length > 0) {
      out.push('### 세부 패턴 매칭 (W1-B7+)', '');
      out.push('| 세부 ID | 패턴 | 카테고리 | 건수 |');
      out.push('|---|---|---|---:|');
      for (const p of fineHits) {
        const count = (byId.get(p.id) ?? []).length;
        out.push(`| ${p.id} | ${p.label} | ${p.category} | ${count} |`);
      }
      out.push('');
    }
  }

  return out;
}

// T1.2-FU: §1 W1-A launch-readiness checklist table. Renders each of the 5
// baseline items with PASS / FAIL state derived from findings tagged with the
// matching W1-A sub-ID. Default-pass: absence of a W1-A<n> finding is treated
// as PASS to keep the §1 surface stable for healthy repos.
function renderW1ASection(findings: ReadonlyArray<Finding>): string[] {
  const out: string[] = [];
  const failed = new Set<string>();
  for (const f of findings) {
    for (const tag of f.tags) {
      if (isW1AId(tag)) failed.add(tag);
    }
  }
  out.push('### 출시 준비 체크리스트 (W1-A)', '');
  out.push('| 체크리스트 ID | 항목 | 상태 |');
  out.push('|---|---|---|');
  for (const item of W1A_CHECKLIST) {
    const status = failed.has(item.id) ? '❌ FAIL' : '✅ PASS';
    out.push(`| ${item.id} | ${item.label} | ${status} |`);
  }
  out.push('');
  return out;
}

// T2.8 / UPG-06: §8 Business Readiness — 5 sub-categories (Pricing / Legal /
// Onboarding / Support / Analytics). Default-pass: absence of a W2-BR<n>
// finding is treated as PASS so healthy repos do not get noise.
function renderBusinessReadinessSection(findings: ReadonlyArray<Finding>): string[] {
  const out: string[] = [];
  const failed = new Set<string>();
  for (const f of findings) {
    for (const tag of f.tags) {
      if (isBusinessReadinessId(tag)) failed.add(tag);
    }
  }
  out.push('## 8. 비즈니스 준비도 (Business Readiness)', '');
  out.push('| 체크리스트 ID | 항목 | 상태 |');
  out.push('|---|---|---|');
  for (const item of BUSINESS_READINESS_CHECKLIST) {
    const status = failed.has(item.id) ? '❌ FAIL' : '✅ PASS';
    out.push(`| ${item.id} | ${item.label} | ${status} |`);
  }
  out.push('');
  return out;
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
  | 'readinessScore'
  | 'launchStatus'
  | 'categoryScores'
  | 'severityCounts'
  | 'executiveSummary'
  | 'markdown'
  | 'coverageMatrix'
  | 'shipVerdict'
> {
  const coverageMatrix =
    args.coverageMatrix && args.coverageMatrix.length > 0
      ? [...args.coverageMatrix]
      : undefined;
  // L-P0-3: persist the same verdict object that the markdown renderer uses
  // (worker-supplied first, otherwise derived) so the AuditReport doc and the
  // §1 header are guaranteed to agree.
  const shipVerdict =
    args.shipVerdict ??
    renderShipVerdict({
      scores: args.categoryScores,
      findings: args.findings,
      profile: null,
      launchStatus: args.launchStatus,
      overallScore: args.readinessScore,
    });
  // Build markdown from an args copy that has the resolved verdict pinned so
  // renderAuditReportMarkdown does not recompute (avoids any drift between the
  // persisted shipVerdict and the verdict embedded in the markdown).
  const markdown = renderAuditReportMarkdown({ ...args, shipVerdict });
  return {
    readinessScore: args.readinessScore,
    launchStatus: args.launchStatus,
    categoryScores: [...args.categoryScores],
    severityCounts: args.severityCounts,
    executiveSummary: args.oneLineSummary,
    markdown,
    shipVerdict,
    ...(coverageMatrix ? { coverageMatrix } : {}),
  };
}
