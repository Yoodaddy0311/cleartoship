/**
 * Korean (ko-KR) UI strings — flat key→string map.
 * Convention: dot-separated namespaces (`screen.section.key`).
 * Keep keys ASCII; values Korean.
 */
export const ko = {
  // App
  'app.title': 'ClearToShip — 바이브 코딩 출시 감사',
  'app.description':
    'GitHub Repo와 배포 URL을 입력하면 10개 카테고리로 출시 준비도를 감사하고, 근거 기반 리포트와 개선 PRD를 생성합니다.',
  'app.brand': 'ClearToShip',
  'app.tagline': '바이브 코딩, 출시 가능한가?',

  // Navigation
  'nav.home': '홈',
  'nav.audits': '내 감사',
  'nav.docs': '문서',
  'nav.start': '감사 시작',

  // Home / Audit Start
  'home.hero.eyebrow': 'AI Product Auditor',
  'home.hero.title': '출시해도 되는 코드인지 5초 안에 답을 드립니다',
  'home.hero.subtitle':
    'GitHub Repo + 배포 URL을 입력하면 10개 카테고리로 감사하고, 근거(Evidence)가 붙은 리포트와 개선 PRD를 한국어로 만들어 드립니다.',
  'home.form.repoUrl.label': 'GitHub 저장소 URL',
  'home.form.repoUrl.placeholder': 'https://github.com/user/repo',
  'home.form.repoUrl.hint': '공개(public) 저장소만 지원합니다',
  'home.form.deployUrl.label': '배포 URL (선택)',
  'home.form.deployUrl.placeholder': 'https://my-app.vercel.app',
  'home.form.deployUrl.hint': '입력하면 실제 화면도 분석합니다',
  'home.form.prd.label': 'PRD 문서 (선택)',
  'home.form.prd.hint': 'PRD 문서를 업로드하거나 직접 입력하세요',
  'home.form.prd.mode.text': '직접 입력',
  'home.form.prd.mode.file': '파일 업로드',
  'home.form.prd.placeholder':
    '구현하고 싶었던 기능을 자유롭게 적어주세요. 요구사항 대비 구현 일치도를 분석합니다.',
  'home.form.prd.file.hint': '.md 또는 .txt 파일 (최대 50,000자)',
  'home.form.prd.file.tooLarge': 'PRD 파일 내용이 50,000자를 초과합니다.',
  'home.form.prd.file.readError': '파일을 읽을 수 없습니다. 다른 파일을 선택해주세요.',
  'home.form.prd.file.selected': '선택된 파일',
  'home.form.submit': '감사 시작',
  'home.form.submitting': '감사 요청 중...',
  'home.form.auth.initializing': '인증 준비 중...',
  'home.form.auth.error': '익명 인증에 실패했습니다. 페이지를 새로고침해 주세요.',
  'home.form.error.repoUrl': '올바른 GitHub URL을 입력해주세요',
  'home.form.error.deployUrl': '올바른 URL을 입력해주세요',
  'home.form.error.generic': '감사 요청에 실패했습니다. 잠시 후 다시 시도해주세요.',
  'home.preview.title': '이런 결과를 받게 됩니다',
  'home.preview.card1.title': '10개 카테고리 점수',
  'home.preview.card1.desc':
    '제품 의도부터 보안까지 10개 카테고리에서 0~100점으로 출시 준비도를 채점합니다.',
  'home.preview.card2.title': '근거 기반 Finding',
  'home.preview.card2.desc':
    '모든 문제에 file:line 또는 selector 근거가 따라붙습니다. 의견이 아닌 사실로 판단합니다.',
  'home.preview.card3.title': '바로 쓸 수 있는 개선 PRD',
  'home.preview.card3.desc':
    'Markdown 한 파일로 다운로드해서 Claude Code/Cursor에 그대로 붙여넣을 수 있습니다.',

  // Audit Progress
  'progress.title': '감사 진행 중',
  'progress.subtitle': '코드와 화면을 분석하고 있습니다. 잠시만 기다려주세요.',
  'progress.eta.suffix': '남음',
  'progress.cancel': '취소',
  'progress.error.title': '감사 도중 문제가 발생했습니다',
  'progress.error.retry': '다시 시도',

  // Dashboard
  'dashboard.title': '감사 대시보드',
  'dashboard.score.label': '출시 준비도',
  'dashboard.severity.title': '우선순위 이슈',
  'dashboard.severity.p0': '출시 차단',
  'dashboard.severity.p1': '핵심 개선',
  'dashboard.severity.p2': '품질 개선',
  'dashboard.severity.p3': '장기 개선',
  'dashboard.categories.title': '영역별 점수',
  'dashboard.top5.title': '가장 먼저 볼 항목 TOP 5',
  'dashboard.summary.title': '한 줄 요약',
  'dashboard.tab.dashboard': '대시보드',
  'dashboard.tab.featureGraph': '기능 관계도',
  'dashboard.tab.findings': '이슈 목록',
  'dashboard.tab.report': '감사 리포트',
  'dashboard.tab.improvementPrd': '개선 PRD',

  // Launch status
  'launch.ready': '출시 가능',
  'launch.readyWithImprovements': '출시 가능하나 권장 보완',
  'launch.needsWork': '출시 전 보완 필요',
  'launch.stop': '출시 중단 권장',

  // Findings
  'findings.title': '이슈 목록',
  'findings.filter.severity': '위험도',
  'findings.filter.category': '카테고리',
  'findings.filter.all': '전체',
  'findings.empty.title': '발견된 이슈가 없습니다',
  'findings.empty.desc': '훌륭합니다! 추가 권장 체크리스트를 확인해보세요.',
  'findings.column.title': '문제명',
  'findings.column.category': '카테고리',
  'findings.column.severity': '위험도',
  'findings.column.confidence': '신뢰도',
  'findings.detail.nonDeveloper': '비개발자 설명',
  'findings.detail.technical': '전문가 근거',
  'findings.detail.impact': '영향',
  'findings.detail.recommendation': '개선 방향',
  'findings.detail.acceptance': '수용 기준',
  'findings.detail.evidences': '근거 자료',
  'findings.detail.includeInPrd': '개선 PRD에 포함',

  // Feature Graph
  'graph.title': '기능 관계도',
  'graph.filter.all': '전체',
  'graph.filter.byStatus': '상태별 필터',
  'graph.legend.title': '범례',
  'graph.empty': '아직 분석된 기능 노드가 없습니다.',
  'graph.node.summary': '요약',
  'graph.node.evidence': '관련 파일',
  'graph.node.improvement': '개선 방향',

  // Status labels (9 statuses)
  'status.complete': '구현 완료',
  'status.partial': '부분 구현',
  'status.ui_only': '화면만 구현',
  'status.logic_only': '로직만 존재',
  'status.missing_connection': '연결 누락',
  'status.missing': '미구현',
  'status.risky': '위험 구현',
  'status.recommended': '추천 기능',
  'status.unknown': '확인 필요',

  // Categories (10) — UPPER_SNAKE matches shared-types AuditCategory enum.
  'category.PRODUCT_INTENT': '제품 의도',
  'category.REQUIREMENT_COVERAGE': '요구사항 커버리지',
  'category.FEATURE_GRAPH': '기능 관계도',
  'category.FUNCTIONAL_FLOW': '기능 플로우',
  'category.UX_UI': 'UX/UI',
  'category.FRONTEND_CODE': '프론트엔드 코드',
  'category.BACKEND_API': '백엔드/API',
  'category.DATA_MODEL': '데이터 모델',
  'category.SECURITY_PRIVACY': '보안/개인정보',
  'category.LAUNCH_READINESS': '출시 준비도',

  // Report
  'report.title': '감사 리포트',
  'report.download': 'Markdown 다운로드',
  'report.print': '인쇄',

  // Improvement PRD
  'prd.title': '개선 PRD',
  'prd.copyPrompt': '바이브 코딩 프롬프트로 복사',
  'prd.copied': '복사되었습니다',
  'prd.download': 'Markdown 다운로드',

  // Common
  'common.loading': '불러오는 중...',
  'common.error': '오류가 발생했습니다',
  'common.retry': '다시 시도',
  'common.back': '돌아가기',
  'common.close': '닫기',
  'common.confirm': '확인',
  'common.cancel': '취소',
  'common.search': '검색',
  'common.notFound.title': '페이지를 찾을 수 없습니다',
  'common.notFound.desc': '주소를 다시 확인해주세요.',
  'common.notFound.cta': '홈으로 돌아가기',
  'common.skipToMain': '본문으로 건너뛰기',
  'common.required': '필수',
  'common.optional': '선택',

  // Footer
  'footer.copyright': '© 2026 ClearToShip. All rights reserved.',
  'footer.note': '근거 기반 출시 감사 플랫폼',
} as const;

export type Ko = typeof ko;
export type I18nKey = keyof Ko;

/**
 * Korean labels for AUDIT_STEPS (UPPER casing — single source of truth in
 * `@cleartoship/shared-types`). UI components import these instead of
 * embedding per-step keys into the flat `ko` map so casing stays consistent
 * with the worker progress events.
 */
export const AUDIT_STEP_LABELS: Record<string, string> = {
  VALIDATE_INPUT: '입력 검증',
  FETCH_REPO_METADATA: 'GitHub 메타데이터 확인',
  CLONE_REPO: '저장소 복제',
  ANALYZE_PROJECT_STRUCTURE: '프로젝트 구조 분석',
  DETECT_FEATURES: '기능 탐지',
  RUN_STATIC_ANALYSIS: '정적 분석 실행',
  RUN_DEPENDENCY_SCAN: '의존성 취약점 스캔',
  RUN_SECRET_SCAN: 'Secret 노출 검사',
  ANALYZE_DEPLOY_URL: '배포 URL 분석',
  GENERATE_FEATURE_GRAPH: '기능 관계도 생성',
  MAP_CHECKLIST: '체크리스트 매핑',
  CALCULATE_SCORES: '점수 계산',
  GENERATE_REPORT: '리포트 작성',
  GENERATE_IMPROVEMENT_PRD: '개선 PRD 작성',
  CLEANUP: '정리',
};
