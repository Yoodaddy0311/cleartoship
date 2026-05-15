import type {
  Finding,
  ImprovementPRD,
  LaunchStatus,
  Severity,
} from '@cleartoship/shared-types';
import { LAUNCH_STATUS_LABELS_KO } from '@cleartoship/shared-types';

/**
 * Build an improvement PRD markdown from P0/P1 findings.
 * Follows `07_improvement_prd_template.md`.
 */

export interface BuildPrdInput {
  projectName: string;
  readinessScore: number;
  launchStatus: LaunchStatus;
  severityCounts: Record<Severity, number>;
  findings: ReadonlyArray<Finding>;
}

interface Epic {
  number: number;
  title: string;
  severity: 'P0' | 'P1';
  findings: ReadonlyArray<Finding>;
}

export function buildImprovementPrd(input: BuildPrdInput): Pick<
  ImprovementPRD,
  'title' | 'markdown' | 'epicCount'
> {
  const epics = groupFindingsIntoEpics(input.findings);
  const markdown = renderPrdMarkdown(input, epics);
  return {
    title: `${input.projectName} 개선 PRD`,
    markdown,
    epicCount: epics.length,
  };
}

function groupFindingsIntoEpics(findings: ReadonlyArray<Finding>): Epic[] {
  // Group P0 findings by category, then P1 by category. Each group becomes one Epic.
  const byCategory: Record<'P0' | 'P1', Map<string, Finding[]>> = {
    P0: new Map(),
    P1: new Map(),
  };
  for (const f of findings) {
    if (f.severity !== 'P0' && f.severity !== 'P1') continue;
    const bucket = byCategory[f.severity];
    const arr = bucket.get(f.category) ?? [];
    arr.push(f);
    bucket.set(f.category, arr);
  }

  const epics: Epic[] = [];
  let n = 1;
  for (const [cat, list] of byCategory.P0) {
    epics.push({ number: n++, title: `[P0] ${cat} 보완`, severity: 'P0', findings: list });
  }
  for (const [cat, list] of byCategory.P1) {
    epics.push({ number: n++, title: `[P1] ${cat} 개선`, severity: 'P1', findings: list });
  }
  return epics;
}

function renderPrdMarkdown(input: BuildPrdInput, epics: ReadonlyArray<Epic>): string {
  const lines: string[] = [];
  lines.push(`# ${input.projectName} 개선 PRD`, '');

  // §1 Purpose
  lines.push('## 1. 개선 목적', '');
  lines.push(
    '현재 프로젝트는 ClearToShip Audit 결과 다음과 같은 핵심 이슈가 식별되었습니다. 이번 개선의 목적은 프로젝트를 데모 수준에서 실제 사용 가능한 MVP 수준으로 끌어올리는 것입니다.',
    '',
  );

  // §2 Current state
  lines.push('## 2. 현재 상태 요약', '');
  lines.push('| 항목 | 현재 상태 |', '|---|---|');
  lines.push(`| 종합 점수 | ${input.readinessScore}/100 |`);
  lines.push(`| 출시 가능 상태 | ${LAUNCH_STATUS_LABELS_KO[input.launchStatus]} |`);
  lines.push(`| P0 이슈 | ${input.severityCounts.P0}개 |`);
  lines.push(`| P1 이슈 | ${input.severityCounts.P1}개 |`);
  lines.push('');

  // §3 Scope
  lines.push('## 3. 개선 범위', '');
  lines.push('### 3.1 포함 범위', '');
  lines.push(
    '- P0 출시 차단 이슈 수정',
    '- P1 핵심 사용성/기능 이슈 수정',
    '- 핵심 플로우의 로딩/오류/성공 상태 보완',
    '- 보안/권한/데이터 저장 문제 보완',
    '',
  );
  lines.push('### 3.2 제외 범위', '');
  lines.push(
    '- 전체 디자인 시스템 재구축',
    '- 전체 아키텍처 재설계',
    '- 유료 SaaS 연동',
    '- 코드 자동 수정 PR 생성',
    '',
  );

  // §4 Principles
  lines.push('## 4. 개선 원칙', '');
  lines.push(
    '1. 기존 기술 스택과 UI 스타일을 최대한 유지합니다.',
    '2. 한 번에 큰 리팩토링을 하지 않고, 기능별로 안전하게 개선합니다.',
    '3. 모든 핵심 기능에는 loading / success / error / empty 상태를 추가합니다.',
    '4. 서버/API/DB 레벨에서 권한과 validation을 검증합니다.',
    '5. mock/demo 데이터는 실제 데이터 처리와 명확히 분리합니다.',
    '6. 개선 후 사용자가 직접 확인할 수 있는 수용 기준을 포함합니다.',
    '',
  );

  // §5+ Epics
  if (epics.length === 0) {
    lines.push('## 5. Epic 목록', '', '> 우선순위 P0/P1 이슈가 없어 별도 Epic이 필요하지 않습니다.', '');
  } else {
    epics.forEach((epic) => {
      lines.push(`## ${4 + epic.number}. Epic ${epic.number} — ${epic.title}`, '');
      lines.push('### 배경', '');
      lines.push('Audit에서 다음 이슈가 확인되었습니다.', '');
      epic.findings.forEach((f) => lines.push(`- **${f.title}** — ${f.summary}`));
      lines.push('');
      lines.push('### 요구사항', '');
      epic.findings.forEach((f, idx) => {
        lines.push(`#### ${idx + 1}. ${f.title}`, '');
        if (f.recommendation) lines.push(f.recommendation, '');
        if (f.acceptanceCriteria.length > 0) {
          lines.push('**수용 기준**', '');
          f.acceptanceCriteria.forEach((ac) => lines.push(`- [ ] ${ac}`));
          lines.push('');
        }
      });
    });
  }

  // §N Vibe coding meta-prompt (template §11)
  lines.push('## 통합 지시문 (바이브 코딩 도구용)', '');
  lines.push('```md');
  lines.push('현재 프로젝트를 ClearToShip Audit 결과 기반으로 개선해줘.');
  lines.push('');
  lines.push('중요 원칙:');
  lines.push('1. 기존 기술 스택과 UI 스타일을 최대한 유지해줘.');
  lines.push('2. 한 번에 전체 구조를 갈아엎지 말고, P0 → P1 순서로 작은 단위로 수정해줘.');
  lines.push('3. 수정 전 관련 파일을 먼저 확인하고, 실제 연결 구조를 파악한 뒤 수정해줘.');
  lines.push('4. 화면만 있는 기능은 실제 API/DB 연결까지 완성해줘.');
  lines.push('5. 모든 핵심 기능에는 loading, success, error, empty 상태를 추가해줘.');
  lines.push('6. 인증/권한은 프론트 조건만이 아니라 서버/API/DB 레벨에서도 검증해줘.');
  lines.push('7. secret이나 API key가 프론트 코드나 GitHub에 노출되지 않도록 정리해줘.');
  lines.push('8. 수정 후 어떤 파일을 바꿨는지, 어떤 수용 기준을 만족하는지 요약해줘.');
  lines.push('');
  lines.push('우선 개선할 항목:');
  epics.forEach((epic) => lines.push(`- [${epic.severity}] ${epic.title}`));
  lines.push('');
  lines.push('각 항목별 요구사항과 수용 기준은 위 개선 PRD를 따라줘.');
  lines.push('```', '');

  return lines.join('\n');
}
