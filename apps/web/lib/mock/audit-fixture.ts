/**
 * Mock data fixtures for Sprint 0 — used by all detail pages until backend lands.
 * Mirrors the shape we expect from packages/shared-types (loose coupling).
 */
import type { ImplementationStatus } from '@/lib/format/status';
import type { Severity } from '@/lib/format/severity';
import type { AuditCategory } from '@/lib/format/category';

export interface MockFinding {
  id: string;
  title: string;
  category: AuditCategory;
  severity: Severity;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  nonDeveloperExplanation: string;
  technicalExplanation: string;
  impact: string[];
  recommendation: string[];
  acceptanceCriteria: string[];
  evidences: MockEvidence[];
}

export interface MockEvidence {
  id: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  url?: string;
  selector?: string;
  snippet?: string;
  language?: string;
  maskedSecret?: boolean;
}

export interface MockNode {
  id: string;
  type:
    | 'product_area'
    | 'feature'
    | 'page'
    | 'component'
    | 'action'
    | 'api'
    | 'data_model'
    | 'external_service'
    | 'auth_guard'
    | 'state'
    | 'recommended_feature';
  label: string;
  status: ImplementationStatus;
  summary?: string;
  position: { x: number; y: number };
}

export interface MockEdge {
  id: string;
  source: string;
  target: string;
  type:
    | 'contains'
    | 'renders'
    | 'navigates_to'
    | 'triggers'
    | 'calls_api'
    | 'reads_from'
    | 'writes_to'
    | 'requires_auth'
    | 'depends_on'
    | 'missing_link'
    | 'recommended_connection';
}

export interface MockAudit {
  id: string;
  repoUrl: string;
  deployUrl?: string;
  score: number;
  launchStatus: 'ready' | 'ready_with_improvements' | 'needs_work' | 'stop';
  oneLineSummary: string;
  severityCounts: Record<Severity, number>;
  categoryScores: Record<AuditCategory, number>;
  findings: MockFinding[];
  graph: { nodes: MockNode[]; edges: MockEdge[] };
  reportMarkdown: string;
  improvementPrdMarkdown: string;
}

export function getMockAudit(id: string): MockAudit {
  return {
    id,
    repoUrl: 'https://github.com/example/sample-vibe-app',
    deployUrl: 'https://sample-vibe-app.vercel.app',
    score: 62,
    launchStatus: 'needs_work',
    oneLineSummary:
      '핵심 로그인 화면과 대시보드는 구현되어 있으나, API 인증 검증 누락(P0)과 폼 라벨 누락(P1) 때문에 출시 전 보완이 필요합니다.',
    severityCounts: { P0: 2, P1: 5, P2: 8, P3: 12 },
    categoryScores: {
      PRODUCT_INTENT: 78,
      REQUIREMENT_COVERAGE: 65,
      FEATURE_GRAPH: 72,
      FUNCTIONAL_FLOW: 60,
      UX_UI: 55,
      FRONTEND_CODE: 70,
      BACKEND_API: 45,
      DATA_MODEL: 68,
      SECURITY_PRIVACY: 40,
      LAUNCH_READINESS: 58,
    },
    findings: [
      {
        id: 'f-001',
        title: '관리자 API에 인증 검증이 없습니다',
        category: 'SECURITY_PRIVACY',
        severity: 'P0',
        confidence: 'high',
        summary: 'POST /api/admin/users 가 누구나 호출 가능합니다.',
        nonDeveloperExplanation:
          '관리자 기능을 호출하는 API에 "로그인했는지" 확인하는 코드가 없어, 외부에서 누구나 호출할 수 있는 상태입니다. 사용자 정보가 노출되거나 변경될 위험이 있습니다.',
        technicalExplanation:
          'Route handler `app/api/admin/users/route.ts`가 session/auth 검증 없이 Firestore에 직접 write 합니다.',
        impact: [
          '비로그인 사용자가 관리자 작업을 수행할 수 있습니다.',
          '데이터 무단 변조 위험이 있습니다.',
          '실서비스 출시 시 즉시 차단해야 합니다.',
        ],
        recommendation: [
          'Firebase Auth ID 토큰을 검증하는 미들웨어를 추가하세요.',
          '관리자 권한(custom claim)을 확인하세요.',
          '실패 시 401/403을 명확히 반환하세요.',
        ],
        acceptanceCriteria: [
          '비로그인 호출 시 401 응답',
          '관리자 아닌 사용자 호출 시 403 응답',
          '정상 관리자 호출 시 200 응답 + 동작 확인',
        ],
        evidences: [
          {
            id: 'e-001',
            filePath: 'app/api/admin/users/route.ts',
            lineStart: 1,
            lineEnd: 28,
            language: 'ts',
            snippet:
              "export async function POST(req: Request) {\n  const body = await req.json();\n  // TODO: auth check\n  await db.collection('users').doc(body.id).set(body);\n  return Response.json({ ok: true });\n}",
          },
        ],
      },
      {
        id: 'f-002',
        title: '로그인 폼 입력 필드에 라벨이 없습니다',
        category: 'UX_UI',
        severity: 'P1',
        confidence: 'high',
        summary:
          'placeholder만으로 안내되어 스크린리더 사용자가 필드 의미를 파악할 수 없습니다.',
        nonDeveloperExplanation:
          '입력 칸 위에 "이메일", "비밀번호" 같은 안내(label)가 없어서, 시각장애인 등 보조 기술 사용자가 무엇을 입력해야 하는지 알기 어렵습니다.',
        technicalExplanation:
          'LoginForm 컴포넌트의 <input>에 <label> 또는 aria-label 이 누락되었습니다.',
        impact: [
          '접근성(WCAG 2.4.6) 위반',
          '검색엔진 자동 인식 저하',
        ],
        recommendation: [
          '각 입력에 명시적 <label htmlFor>을 추가하세요.',
          'placeholder는 보조 힌트 용도로만 사용하세요.',
        ],
        acceptanceCriteria: [
          'axe-core 검사에서 label-related 위반 0개',
          '스크린리더 음성 안내 확인',
        ],
        evidences: [
          {
            id: 'e-002',
            filePath: 'components/auth/LoginForm.tsx',
            lineStart: 18,
            lineEnd: 26,
            language: 'tsx',
            snippet:
              "<input placeholder=\"이메일\" type=\"email\" />\n<input placeholder=\"비밀번호\" type=\"password\" />",
          },
        ],
      },
      {
        id: 'f-003',
        title: '환경변수에 API Key가 평문 노출됩니다',
        category: 'SECURITY_PRIVACY',
        severity: 'P0',
        confidence: 'high',
        summary: 'curl로 GET 가능한 .env.example에 실제 키가 포함되어 있습니다.',
        nonDeveloperExplanation:
          '코드 저장소에 누구나 볼 수 있는 형태로 API 키가 들어 있어, 비용 폭증 또는 도용 위험이 있습니다.',
        technicalExplanation:
          'commit `e0a1c3`의 `.env.example` 파일에 OPENAI_API_KEY 실제 값이 노출되어 있습니다.',
        impact: ['키 도용', '의도치 않은 비용 발생'],
        recommendation: [
          '키를 즉시 회전(rotate)하세요.',
          '.env.example에는 더미 값만 두세요.',
          'BFG 등으로 git history도 정리하세요.',
        ],
        acceptanceCriteria: [
          '.env.example에 실제 키 없음',
          '키 회전 완료',
          'history 청소 완료 또는 키 무효화',
        ],
        evidences: [
          {
            id: 'e-003',
            filePath: '.env.example',
            lineStart: 4,
            lineEnd: 4,
            maskedSecret: true,
            language: 'env',
            snippet: 'OPENAI_API_KEY=sk-****************',
          },
        ],
      },
    ],
    graph: {
      nodes: [
        {
          id: 'pa-1',
          type: 'product_area',
          label: '인증',
          status: 'partial',
          summary: '로그인/회원가입',
          position: { x: 50, y: 50 },
        },
        {
          id: 'pg-login',
          type: 'page',
          label: '/login',
          status: 'complete',
          position: { x: 300, y: 30 },
        },
        {
          id: 'cmp-loginform',
          type: 'component',
          label: 'LoginForm',
          status: 'ui_only',
          summary: 'submit 핸들러 누락',
          position: { x: 550, y: 30 },
        },
        {
          id: 'api-login',
          type: 'api',
          label: 'POST /api/auth/login',
          status: 'missing_connection',
          summary: '프론트에서 호출되지 않음',
          position: { x: 800, y: 30 },
        },
        {
          id: 'dm-user',
          type: 'data_model',
          label: 'User',
          status: 'complete',
          position: { x: 1050, y: 30 },
        },
        {
          id: 'pa-2',
          type: 'product_area',
          label: '관리자',
          status: 'risky',
          summary: '권한 검증 누락',
          position: { x: 50, y: 200 },
        },
        {
          id: 'api-admin',
          type: 'api',
          label: 'POST /api/admin/users',
          status: 'risky',
          position: { x: 300, y: 200 },
        },
        {
          id: 'rec-history',
          type: 'recommended_feature',
          label: '감사 히스토리',
          status: 'recommended',
          summary: '추가 권장',
          position: { x: 800, y: 200 },
        },
      ],
      edges: [
        { id: 'e1', source: 'pa-1', target: 'pg-login', type: 'contains' },
        { id: 'e2', source: 'pg-login', target: 'cmp-loginform', type: 'renders' },
        { id: 'e3', source: 'cmp-loginform', target: 'api-login', type: 'missing_link' },
        { id: 'e4', source: 'api-login', target: 'dm-user', type: 'writes_to' },
        { id: 'e5', source: 'pa-2', target: 'api-admin', type: 'contains' },
      ],
    },
    reportMarkdown: SAMPLE_REPORT_MD,
    improvementPrdMarkdown: SAMPLE_PRD_MD,
  };
}

const SAMPLE_REPORT_MD = `# 샘플 프로젝트 Vibe Coding Audit Report

## 1. Executive Summary

\`\`\`
Product Readiness Score: 62/100
출시 가능 상태: 출시 전 보완 필요
P0 이슈: 2개
P1 이슈: 5개
P2 이슈: 8개
P3 이슈: 12개
\`\`\`

### 한 줄 요약

> 이 프로젝트는 로그인/대시보드의 화면은 구현되어 있으나, 관리자 API 인증 검증 누락과 폼 라벨 누락 때문에 실제 출시 전 보안/접근성 보완이 필요합니다.

### 가장 먼저 볼 항목 TOP 5

| 우선순위 | 항목 | 카테고리 | 이유 |
|---:|---|---|---|
| 1 | 관리자 API 인증 검증 누락 | 보안/개인정보 | 누구나 관리자 동작 호출 가능 |
| 2 | API Key 평문 노출 | 보안/개인정보 | 키 도용 및 비용 폭증 위험 |
| 3 | 로그인 폼 라벨 누락 | UX/UI | 접근성 위반 |
| 4 | 결제 플로우 미구현 | 기능 플로우 | PRD 요구사항 대비 누락 |
| 5 | README 부재 | 출시 준비도 | 운영/유지보수 어려움 |

## 2. 입력 정보

| 항목 | 값 |
|---|---|
| GitHub Repo | https://github.com/example/sample-vibe-app |
| 배포 URL | https://sample-vibe-app.vercel.app |
| 분석 일시 | 2026-05-16 |
| 주요 기술 스택 | Next.js, Firebase |
`;

const SAMPLE_PRD_MD = `# 샘플 프로젝트 — 개선 PRD

> 이 문서는 Claude Code / Cursor / Bolt 등 바이브 코딩 도구에 그대로 입력해 다음 사이클의 수정 작업을 시작할 수 있도록 작성되었습니다.

## 1. 목표

- 출시 차단 P0 이슈 2건을 즉시 해결합니다.
- 핵심 개선 P1 이슈 5건을 1차 스프린트에서 처리합니다.
- 출시 준비도를 62 → 85 이상으로 끌어올립니다.

## 2. 작업 목록

### 2.1 [P0] 관리자 API 인증 검증

- 파일: \`app/api/admin/users/route.ts\`
- 조치: Firebase Auth ID 토큰 검증 + admin custom claim 확인.
- 수용 기준
  - [ ] 비로그인 호출 시 401
  - [ ] 비관리자 호출 시 403
  - [ ] 정상 관리자 호출 200

### 2.2 [P0] API Key 평문 노출 제거

- 파일: \`.env.example\`
- 조치: 실제 키 제거 + 키 회전 + git history 정리.

### 2.3 [P1] 로그인 폼 라벨 추가

- 파일: \`components/auth/LoginForm.tsx\`
- 조치: \`<label htmlFor>\` 추가, placeholder는 보조 힌트로만 사용.

## 3. 통합 지시문 (바이브 코딩 도구용)

다음 내용을 그대로 복사해 Claude Code 등에 붙여넣으세요:

\`\`\`
이 저장소를 점검하고 아래 작업을 순서대로 수행해 줘.
1. app/api/admin/users/route.ts 에 Firebase Auth 검증을 추가하고 admin claim을 확인해.
2. .env.example 에서 실제 OPENAI_API_KEY 값을 제거하고 더미 값으로 바꿔.
3. components/auth/LoginForm.tsx 의 모든 input에 <label htmlFor>을 추가해.
각 작업 후 변경 파일과 핵심 변경 라인을 요약해 줘.
\`\`\`
`;
