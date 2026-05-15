// MOCK Sprint 0 — replace in Sprint 1 with Semgrep CE adapter.

import type { Step } from './index.js';
import { writeToolResult } from '../../firestore/writers.js';

export const step06StaticAnalysis: Step = {
  step: 'RUN_STATIC_ANALYSIS',
  async execute(ctx, state) {
    // MOCK Sprint 0 — emit 2 fake findings.
    state.pendingFindings.push({
      title: '관리자 API에 서버측 권한 검증이 없음',
      category: 'SECURITY_PRIVACY',
      severity: 'P0',
      confidence: 'MEDIUM',
      summary:
        'app/api/admin/* 경로에 role 체크가 보이지 않습니다. 모든 사용자가 관리자 API에 접근할 가능성이 있습니다.',
      nonDeveloperExplanation:
        '관리자만 사용해야 하는 기능을 일반 사용자도 호출할 수 있을 가능성이 있습니다. 서버에서 사용자가 관리자인지 다시 확인해야 합니다.',
      technicalExplanation:
        'Semgrep mock 규칙 missing-role-check가 매칭됨. 핸들러 진입부에 session.role !== "admin" 체크가 없음.',
      impact: '관리자 권한 우회 → 데이터 탈취/조작 위험.',
      recommendation: '핸들러 최상단에서 session.role === "admin" 검증 후 분기하세요.',
      acceptanceCriteria: [
        '관리자 API에 진입 시 role !== "admin" 이면 403을 반환한다.',
        '일반 사용자 세션으로 admin API 호출 시 거부됨이 테스트로 확인된다.',
      ],
      tags: ['mock-semgrep', 'auth'],
      evidences: [
        {
          type: 'SEMGREP',
          source: 'mock-semgrep',
          path: 'app/api/admin/users/route.ts',
          lineStart: 12,
          lineEnd: 24,
          url: null,
          selector: null,
          screenshotPath: null,
          snippet: 'export async function POST(req: Request) { /* no role check */ ... }',
          maskedValue: null,
          metadata: { rule: 'missing-role-check' },
        },
      ],
    });

    state.pendingFindings.push({
      title: '폼 제출 후 성공/실패 피드백이 없음',
      category: 'UX_UI',
      severity: 'P1',
      confidence: 'MEDIUM',
      summary: 'LoginForm 컴포넌트가 제출 후 상태 변경 없이 종료되는 패턴이 감지되었습니다.',
      nonDeveloperExplanation:
        '사용자가 로그인 버튼을 눌렀을 때 성공했는지 실패했는지 알 수 없습니다.',
      technicalExplanation:
        'handleSubmit 내부에 setState 호출이나 toast/notification 호출 없음.',
      impact: '사용자는 자신이 무엇을 했는지 모르고 같은 동작을 반복할 가능성이 큽니다.',
      recommendation:
        '제출 결과를 toast / 폼 하단 메시지로 표시하고, 실패 시 재시도 가이드를 제공하세요.',
      acceptanceCriteria: [
        '폼 제출 성공 시 사용자에게 시각적 확인이 표시된다.',
        '폼 제출 실패 시 사용자에게 오류 메시지가 표시된다.',
      ],
      tags: ['mock-semgrep', 'ux'],
      evidences: [
        {
          type: 'SEMGREP',
          source: 'mock-semgrep',
          path: 'components/LoginForm.tsx',
          lineStart: 22,
          lineEnd: 48,
          url: null,
          selector: null,
          screenshotPath: null,
          snippet: 'const handleSubmit = async (e) => { /* no feedback */ ... }',
          maskedValue: null,
          metadata: { rule: 'missing-form-feedback' },
        },
      ],
    });

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: 'semgrep',
      toolVersion: 'mock-0.0.0',
      status: 'SUCCESS',
      rawSummary: { mocked: true, findings: 2 },
      artifactPath: null,
    });
    ctx.log('info', 'Static analysis (mock) complete', { findings: 2 });
  },
};
