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
  // W2-A: PrdInput component (textarea + file upload + counter). Distinct
  // from the legacy `home.form.prd.*` keys (kept for other call sites).
  'audit.prd.label': '제품 요구사항 문서 (선택)',
  'audit.prd.placeholder': 'PRD를 붙여넣거나 .md/.txt 파일을 업로드하세요',
  'audit.prd.fileButton': '파일에서 가져오기',
  'audit.prd.tooLarge': '50KB 이하로 입력해주세요',
  'home.form.profile.label': '감사 프로필 (선택)',
  'home.form.profile.hint': '도메인을 선택하면 해당 카테고리에 가중치를 더해 채점합니다',
  'home.form.profile.option.none': '기본 (가중치 조정 없음)',
  'home.form.profile.option.landing': '랜딩 페이지 (UX·프론트엔드·런칭 준비도 강조)',
  'home.form.profile.option.saas': 'SaaS / API (백엔드·보안·데이터 모델 강조)',
  'home.form.profile.option.ecommerce': '이커머스 (보안·결제·UX 흐름 강조)',
  // L-P1-1: ProfileBadge displays the audit profile picked at start time.
  // The vibe-coded key is new (added by Sprint 4 W2 Batch A) — landing/saas/
  // ecommerce already exist above and are reused.
  'home.form.profile.option.vibeCoded': '바이브 코딩 (프롬프트 일관성·구현 정합성 강조)',
  // Audit Quality Roadmap §6.6 — opt-in "AI enhanced" checkbox. Default OFF.
  'home.form.aiEnhanced.label': 'AI 보조 분석 (옵션)',
  'home.form.aiEnhanced.hint':
    'PRODUCT_INTENT·REQUIREMENT_COVERAGE 등 언어 판단이 필요한 항목을 AI가 보조 채점합니다. 기본 OFF — 켜면 분석 완료 후 비동기로 실행됩니다.',
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

  // Marketing
  'mk.hero.eyebrow': 'AI Product Auditor for Vibe Coders',
  'mk.hero.title.pre': '출시해도 될지',
  'mk.hero.title.accent': '5초 안에',
  'mk.hero.title.post': '답을 드립니다.',
  'mk.hero.subtitle':
    'GitHub Repo와 배포 URL을 입력하면 10개 카테고리로 감사하고 근거 기반 리포트를 만들어 드립니다.',
  'mk.hero.cta.primary': '무료로 감사 시작',
  'mk.hero.cta.secondary': '예시 리포트 보기',
  'mk.trust.title': '바이브 코더가 신뢰하는 출시 감사',
  'mk.features.title': '한 번의 클릭, 출시 가능 여부 판단',
  'mk.features.subtitle': '의견이 아닌 근거로 답합니다.',
  'mk.features.f1.title': '10개 카테고리 점수',
  'mk.features.f1.desc': '제품 의도부터 보안까지 0~100점으로 출시 준비도를 평가합니다.',
  'mk.features.f2.title': '근거 기반 Finding',
  'mk.features.f2.desc': '모든 문제에 file:line 또는 selector 근거가 자동으로 따라붙습니다.',
  'mk.features.f3.title': '바로 쓰는 개선 PRD',
  'mk.features.f3.desc': 'Markdown 한 파일로 Claude Code/Cursor에 바로 붙여넣을 수 있습니다.',
  'mk.how.title': '세 단계로 끝나는 출시 감사',
  'mk.how.s1.title': 'Connect repo',
  'mk.how.s1.desc': 'GitHub 저장소와 배포 URL을 입력합니다.',
  'mk.how.s2.title': 'Run audit',
  'mk.how.s2.desc': '10개 카테고리로 자동 감사가 진행됩니다.',
  'mk.how.s3.title': 'Ship with evidence',
  'mk.how.s3.desc': '근거 기반 리포트와 개선 PRD를 받아 바로 적용합니다.',
  'mk.cta.title': '오늘 바로 출시 가능한지 확인하세요',
  'mk.cta.subtitle': '신용카드 없이 1분이면 충분합니다.',
  'mk.cta.button': '지금 시작하기',

  // Audit List (/audits)
  'audits.list.title': '내 감사',
  'audits.list.subtitle': '제출한 감사 결과를 최신순으로 확인할 수 있습니다.',
  'audits.list.empty.title': '아직 감사 기록이 없습니다',
  'audits.list.empty.cta': '첫 감사 시작하기',
  'audits.list.column.repo': '저장소',
  'audits.list.column.status': '상태',
  'audits.list.column.created': '생성일',
  'audits.list.action.open': '열기',
  'audits.list.error': '감사 목록을 불러오지 못했습니다.',
  'audits.list.retry': '다시 시도',
  'audits.list.loading': '불러오는 중…',
  'audits.list.newAudit': '새 감사',

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
  'dashboard.categories.viewAll': '전체 보기',
  // V3 Strengths panel (2026-05-20) — positive-signal cards rendered next to
  // the defect-oriented severity counts so a non-dev reader sees both
  // "what's wrong" and "what's working" at the same visual weight.
  'dashboard.strengths.title': '이건 잘 됐어요',
  'dashboard.strengths.severity.p0Zero': 'Critical(P0) 취약점 0건',
  'dashboard.strengths.severity.p0Zero.supplement': '출시 결정의 가장 큰 부담을 덜었어요',
  'dashboard.strengths.severity.p1Zero': 'High(P1) 취약점 0건',
  'dashboard.strengths.severity.p1Zero.supplement': '핵심 개선 사항이 모두 막혀있지 않아요',
  'dashboard.strengths.category.high': '{label} 우수 ({score}점)',
  // PR-A4-fix — surfaceable source-driven inventory cards. These do NOT
  // claim quality; they say "we found data, the verdict comes later".
  'dashboard.strengths.inventory.repoMetadata': '권장사항 — GitHub 메타데이터 발견 (description / topics)',
  'dashboard.strengths.inventory.repoMetadata.supplement': '제품 의도 검증의 1차 신호. 정밀 평가는 Phase B (LLM 도입) 이후.',
  'dashboard.strengths.inventory.routes': '권장사항 — 라우트 인벤토리 구축됨 (페이지·API)',
  'dashboard.strengths.inventory.routes.supplement': '기능 관계도의 구조적 신호. 의미 검증은 다음 단계에서.',
  'dashboard.strengths.inventory.dataModel': '권장사항 — 데이터 모델 발견 (스키마·컬렉션)',
  'dashboard.strengths.inventory.dataModel.supplement': 'DB 존재 확인됨. 보안 룰·정합성 검증은 다음 단계에서.',
  'dashboard.top5.title': '가장 먼저 볼 항목 TOP 5',
  'dashboard.summary.title': '한 줄 요약',
  'dashboard.tab.dashboard': '대시보드',
  'dashboard.tab.categories': '영역별 보기',
  'dashboard.tab.featureGraph': '기능 관계도',
  'dashboard.tab.findings': '이슈 목록',
  'dashboard.tab.report': '감사 리포트',
  'dashboard.tab.improvementPrd': '개선 PRD',

  // Categories page (Layer 2 of 3-layer progressive disclosure)
  'categories.title': '영역별 보기',
  'categories.subtitle': '카테고리를 펼치면 우선순위 이슈가 표시됩니다.',
  'categories.loading': '영역별 결과를 불러오는 중입니다.',
  'categories.breadcrumb.aria': '경로',
  'categories.count.prefix': '이슈 ',
  'categories.count.suffix': '건',
  'categories.na.aria': '점수 판단 불가',
  'categories.empty.row': '발견된 이슈가 없습니다.',
  'categories.empty.panel': '이 영역에서는 발견된 이슈가 없습니다.',
  'categories.viewAll.prefix': '전체 보기 (총 ',
  'categories.viewAll.suffix': '건)',

  // Launch status
  'launch.ready': '출시 가능',
  'launch.readyWithImprovements': '출시 가능하나 권장 보완',
  'launch.needsWork': '출시 전 보완 필요',
  'launch.stop': '출시 중단 권장',

  // Wave 1 W1.4 — Founder Confidence Score (FCS)
  // Single 0~100 metric + uncertainty band + ranked concerns + 1-sentence
  // rationale. Status uses the shared-types LaunchStatus 7-enum
  // (READY/CONDITIONAL/NEEDS_WORK/AT_RISK/NOT_READY/INDETERMINATE/BLOCKED).
  'fcs.label.score': '창업자 확신 점수',
  'fcs.label.uncertainty': '불확실성 ±{value}',
  'fcs.label.topConcerns': '핵심 우려 사항',
  'fcs.label.rationale': '판단 근거',
  'fcs.label.status': '출시 상태',
  'fcs.label.indeterminateNote': '분석 자료가 부족해 신뢰 구간만 표시합니다.',
  'fcs.aria.gauge': '창업자 확신 점수 {score}점, 신뢰 구간 {lower}~{upper}',
  'fcs.aria.uncertaintyBar': '점수 신뢰 구간 {lower}부터 {upper}까지',
  'fcs.empty.concerns': '주요 우려 사항이 없습니다.',
  // LaunchStatus 7-enum 라벨 — FCS 상태 칩에서 사용
  'fcs.status.READY': '출시 가능',
  'fcs.status.CONDITIONAL': '조건부 출시',
  'fcs.status.NEEDS_WORK': '보완 후 출시',
  'fcs.status.AT_RISK': '위험 — 점검 필요',
  'fcs.status.NOT_READY': '출시 부적합',
  'fcs.status.INDETERMINATE': '판단 불가',
  'fcs.status.BLOCKED': '감사 중단',

  // L-P1-3 Narrative — 3-sentence "현황 요약" block. Body text is composed
  // dynamically by audit-core renderNarrative (no i18n template), so only the
  // visible/sr-only heading lives in the i18n map.
  'narrative.heading': '현황 요약',

  // Findings
  'findings.title': '이슈 목록',
  'findings.filter.severity': '위험도',
  'findings.filter.category': '카테고리',
  'findings.filter.confidence': '신뢰도',
  'findings.filter.confidence.high': '높음',
  'findings.filter.confidence.medium': '보통',
  'findings.filter.confidence.low': '낮음',
  'findings.filter.falsePositive': '오탐 표시',
  'findings.filter.falsePositive.all': '전체',
  'findings.filter.falsePositive.show': '오탐만',
  'findings.filter.falsePositive.hide': '숨김',
  'findings.filter.all': '전체',
  'findings.filter.reset': '필터 초기화',
  'findings.sort.ariaAsc': '오름차순 정렬',
  'findings.sort.ariaDesc': '내림차순 정렬',
  'findings.sort.ariaNone': '정렬 없음',
  'findings.empty.title': '발견된 이슈가 없습니다',
  'findings.empty.desc': '훌륭합니다! 추가 권장 체크리스트를 확인해보세요.',
  'findings.column.title': '문제명',
  'findings.column.category': '카테고리',
  'findings.column.severity': '위험도',
  'findings.column.confidence': '신뢰도',
  'findings.column.actionHint': '다음 행동',
  // L-P0-6: action hint label + ETA ladder (5/30/60/240). Used both in the
  // findings table row and in the detail-panel "다음 행동" callout card.
  'findings.actionHint.title': '다음 행동',
  'findings.actionHint.etaPrefix': '예상 소요',
  'findings.actionHint.empty': '액션 가이드 준비 중',
  'findings.actionHint.eta.5': '5분',
  'findings.actionHint.eta.30': '30분',
  'findings.actionHint.eta.60': '1시간',
  'findings.actionHint.eta.240': '반나절+',
  'findings.actionHint.referenceLabel': '참고 자료',
  'findings.actionHint.referenceAria': '관련 참고 자료 새 창에서 열기',
  'findings.detail.nonDeveloper': '비개발자 설명',
  'findings.detail.technical': '전문가 근거',
  'findings.detail.impact': '영향',
  'findings.detail.recommendation': '개선 방향',
  'findings.detail.acceptance': '수용 기준',
  'findings.detail.evidences': '근거 자료',
  'findings.detail.includeInPrd': '개선 PRD에 포함',
  'findings.detail.evidences.truncated':
    'Evidence가 일부만 표시되고 있습니다 (서버 한도에 도달했습니다)',
  'findings.detail.falsePositive.toggle': '오탐 표시',
  'findings.detail.falsePositive.marked': '오탐으로 표시됨',
  'findings.detail.falsePositive.unmarked': '오탐 표시',
  'findings.detail.falsePositive.error':
    '저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',

  // Feature Graph
  'graph.title': '기능 관계도',
  'graph.filter.all': '전체',
  'graph.filter.byStatus': '상태별 필터',
  'graph.legend.title': '범례',
  'graph.empty': '아직 분석된 기능 노드가 없습니다.',
  // W3.QA.2 mixed-JSX migration: split each `<strong>noun</strong>일 수 있어요`
  // bullet from feature-graph empty-state into a noun label + post-position body
  // so en/ko can each pick a natural word order.
  'graph.empty.cause.stale.label': '이전 버전 분석 결과',
  'graph.empty.cause.stale.body':
    '일 수 있어요. 그래프 생성 룰이 개선된 이후 다시 돌리지 않아 노드가 비어 있을 가능성이 큽니다.',
  'graph.empty.cause.buildArtifacts.label': '빌드 산출물만 있는 레포',
  'graph.empty.cause.buildArtifacts.body':
    '일 수 있어요. 컴파일된 dist/.next 같은 결과물만 들어 있으면 페이지·API·컴포넌트를 식별하기 어렵습니다.',
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

  // W2.C6.1: CategoryGrid 2×6 layout — 12th cell + weight=0 tooltip.
  // weight=0 means the active audit profile excludes this category from the
  // weighted average (still rendered but visually dimmed + non-clickable).
  'category.grid.weight.zero.tooltip': '현재 프로필에서 가중치 0',
  'category.grid.placeholder.label': '추가 카테고리',
  'category.grid.placeholder.hint': 'Wave 3에서 활성화 예정',

  // Categories (11) — UPPER_SNAKE matches shared-types AuditCategory enum.
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
  'category.BUSINESS_READINESS': '비즈니스 준비도',

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

  // Samples gallery — T2.9 #121
  'samples.title': '샘플 Repo 갤러리',
  'samples.subtitle':
    '실제 오픈소스 저장소로 감사를 한 번 돌려보세요. 어떤 결과가 나오는지 1분 안에 확인할 수 있습니다.',
  'samples.tag.benchmark': '벤치마크 좋음',
  'samples.tag.typicalIssues': '전형적 문제',
  'samples.tag.minimal': '최소 구성',
  'samples.expected.label': '예상 결과',
  'samples.cta': '이 저장소로 감사 시작',
  'samples.card.thumbnailAlt': '{name} 저장소 미리보기',

  // Footer
  'footer.copyright': '© 2026 ClearToShip. All rights reserved.',
  'footer.note': '근거 기반 출시 감사 플랫폼',

  // Errors — audit failures
  'errors.audit.invalidUrl': 'Repository URL 형식이 올바르지 않습니다',
  'errors.audit.notFound': '해당 분석을 찾을 수 없습니다',
  'errors.audit.timedOut': '분석이 시간 내 완료되지 않았습니다 (5분 한도)',
  'errors.audit.cloneFailed': 'Repository clone에 실패했습니다. public repo인지 확인하세요',
  'errors.audit.deployUrlUnreachable': '배포 URL에 접속할 수 없습니다',
  'errors.audit.toolUnavailable': '도구 {toolNames} 미설치 — 부분 결과만 측정됩니다',
  'errors.audit.toolUnavailable.summary': '{count}개 검사가 이번 분석에서 빠졌어요',
  'errors.audit.toolUnavailable.disclaimer':
    '일부 검사는 이 프로젝트의 기술 스택에 해당 기술이 없어서 (예: Prisma DB 없음, Tailwind+React 미사용) 자동 skip되거나, 워커에 도구가 곧 추가될 예정 (Phase 1: semgrep / osv-scanner)이라 N/A로 표시됩니다. 출시 결정에는 영향 없습니다.',
  'errors.audit.toolUnavailable.deployUrlHint':
    '배포 URL을 입력하시면 사이트 성능/접근성도 측정해드릴게요',
  // W3.QA.2 mixed-JSX migration: split the inline `<strong>`/`<Link>` line in
  // PartialResultBanner. prefix wraps the `<strong>`; body is the standalone
  // sentence; ctaLabel is the link text; suffix is the trailing post-position
  // after the link. Both locales render naturally without relying on adjacent
  // JSX for grammar.
  'errors.audit.toolUnavailable.deployUrlPrefix': '배포 URL을 입력하시면',
  'errors.audit.toolUnavailable.deployUrlBody':
    '사이트 성능/접근성도 측정해드릴게요.',
  'errors.audit.toolUnavailable.deployUrlCtaLabel': '‘새 감사’ 폼',
  'errors.audit.toolUnavailable.deployUrlSuffix':
    '에서 배포 URL 칸을 채워주세요.',
  // T2.12 #112: N/A 카테고리 라벨 (BLOCKED vs FAILED 구분)
  'errors.audit.toolUnavailable.categoryHeading': '점수가 N/A로 표시되는 카테고리',
  'errors.audit.toolUnavailable.whyNa': '왜 N/A인가요?',
  'errors.audit.toolUnavailable.naReason.skipped': '실행되지 않음',
  'errors.audit.toolUnavailable.naReason.blocked': '가드레일 작동으로 중단',
  'errors.audit.toolUnavailable.naReason.failed': '도구 오류',
  'errors.audit.toolUnavailable.blockedNote':
    '가드레일에 의해 분석이 중단되어 일부 카테고리는 측정되지 않았습니다. 중단 사유: {abortReason}',
  'errors.audit.category.SECURITY_PRIVACY': '보안 검사',
  'errors.audit.category.FRONTEND_CODE': '코드 품질 검사',
  'errors.audit.category.LAUNCH_READINESS': '성능 검사',
  'errors.audit.category.UX_UI': '접근성 검사',

  // Empty / pending guidance for resource panels
  'audit.empty.unsupportedFramework':
    '현재 자동 분석은 Next.js / Vite 등 일부 프레임워크에 최적화되어 있어요. 감지된 프레임워크: {framework}. 부분 결과를 보실 수 있습니다.',
  'audit.empty.noDeployUrl':
    '배포 URL이 없어서 성능/접근성 측정은 생략됐어요. 코드 점검 결과는 정상이에요.',
  'audit.empty.pipelineNotReached':
    '아직 이 단계에 도달하지 않았어요. 분석이 진행되면 결과가 자동으로 채워집니다.',
  'audit.empty.nextActions': '다음에 할 수 있는 일',
  // W3.QA.2 mixed-JSX migration: split the no-deploy-url + pipeline-not-reached
  // `<li>` items so the embedded `<Link>` no longer requires inline 한글 후치사.
  'audit.empty.noDeployUrl.cta.prefix': '성능/접근성도 보고 싶다면 ',
  'audit.empty.noDeployUrl.cta.linkLabel': '새 감사를 시작',
  'audit.empty.noDeployUrl.cta.suffix':
    '하면서 배포 URL을 함께 입력해 주세요.',
  'audit.empty.pipelineNotReached.cta.linkLabel': '진행 화면',
  'audit.empty.pipelineNotReached.cta.suffix':
    '에서 현재 단계를 확인할 수 있어요.',

  // Errors — general
  'errors.general.networkError': '네트워크 오류가 발생했습니다. 잠시 후 다시 시도하세요',
  'errors.general.unexpected': '예기치 못한 오류가 발생했습니다',

  // W2.C10.1: RunMetadataStrip — short run id + KST timestamp + version pill.
  // Keys live under the `audit.run.*` namespace so other run-detail widgets
  // (status header, share button, etc.) can extend the group later.
  'audit.run.id.copy.aria': 'Run ID 클립보드 복사',
  'audit.run.id.copied': '복사됨',

  // W2.C8.1: CoverageMatrix UI badge labels + scroll hint + empty state. The
  // 4 status keys feed a single badge component (covered/partial/missing/na).
  // `na` is the defensive LOW-confidence "we couldn't tell" variant — the
  // audit-core CoverageStatus enum has 3 states (fulfilled/partial/unclear);
  // the UI promotes low-confidence `unclear` rows to `na` so a thin-signal
  // row reads as "판단 보류" rather than a hard "미구현" verdict.
  'coverage.status.covered': '충족',
  'coverage.status.partial': '미흡',
  'coverage.status.missing': '미구현',
  'coverage.status.na': '판단 보류',
  'coverage.scrollHint': '스크롤하여 더 보기',
  'coverage.empty': '커버리지 데이터가 없습니다.',

  // W2.C5.1: Next30MinChecklist — up-to-3 quick wins the founder can clear in
  // 30 minutes or less. `eta.minutes` is dynamic (tf substitutes {n}); the
  // fixed ladder labels (5/30/60/240) live under findings.actionHint.eta.*.
  'next30Min.heading': '지금 30분 안에',
  'next30Min.empty': '30분 안에 처리할 우선 작업이 없습니다.',
  'next30Min.eta.minutes': '{n}분',

  // L-P1-6: Suspense fallback skeletons (ShipVerdict / Score / Narrative).
  // Visual-only — only the wrapper aria-label is i18n'd so screen readers
  // announce "loading" once per Suspense boundary.
  'skeleton.loading.aria': '로딩 중',

  // W2.C-i18n: audit items found during Wave 2 Batch C audit pass.

  // findings.detail.friendly — Semgrep-friendly explanation labels in the
  // non-developer explanation card. These head each paragraph of the friendly
  // explanation block (what/why/analogy/fixGuide) and the expand/collapse
  // toggle button.
  'findings.detail.friendly.whatLabel': '무엇이 문제인가요?',
  'findings.detail.friendly.whyLabel': '왜 위험한가요?',
  'findings.detail.friendly.analogyLabel': '비유:',
  'findings.detail.friendly.fixGuideLabel': '어떻게 고치나요?',
  'findings.detail.friendly.collapse': '간단히 보기',
  'findings.detail.friendly.expand': '자세히 보기',

  // progress.panel — live audit progress page card titles (skeleton + live).
  // Both cold-start-skeleton.tsx and the live audits/[id]/page.tsx share these.
  'progress.panel.timeline': '분석 단계',
  'progress.panel.liveResults': '실시간 분석 결과',

  // progress.status — inline Progress bar label strings.
  'progress.status.running': '진행 중',
  'progress.status.completed': '완료',
  'progress.status.failed': '실패',
  'progress.status.cancelled': '취소됨',

  // progress.fetchError / progress.findingsPending — body text in the live
  // results card for the fetch-error and idle branches.
  'progress.fetchError': '진행 상태를 불러오지 못했습니다.',
  'progress.findingsPending': 'Finding이 도착하는 대로 여기에 표시됩니다.',

  // category.na — CategoryNATile in the dashboard category grid. Shown when
  // the audit could not produce a score for a given category (e.g. lighthouse
  // skipped because no deploy URL was supplied).
  'category.na.label': '판단 불가',
  'category.na.description': '분석 자료가 부족해 점수를 산정하지 않았습니다.',
  // PR-A4 — score-origin badge (PRD source-driven-extraction §6).
  'category.origin.D.aria': '결정론 분석에 의한 점수',
  'category.origin.D.tooltip': '결정론(D): 코드/파일 분석으로 산출된 점수. 재현 가능 + 외부 의존 없음.',
  'category.origin.F.aria': '외부 무료 API 데이터에 의한 점수',
  'category.origin.F.tooltip': '외부 데이터(F): GitHub API · npm · OSV 등 무료 공개 데이터로 산출. 외부 서비스 상태에 의존.',
  'category.origin.L.aria': 'LLM 평가에 의한 점수',
  'category.origin.L.tooltip': 'LLM(L): Claude/OpenAI가 의미 해석한 결과. 자연어 reasoning 필요한 부분에 한정.',
  'category.origin.mixed.aria': '결정론 + 외부 데이터 + LLM 조합 점수',
  'category.origin.mixed.tooltip': '복합(M): 결정론 분석과 외부 데이터/LLM이 함께 기여한 점수.',
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
  ANALYZE_PRD: 'PRD 문서 분석',
  DETECT_FEATURES: '기능 탐지',
  RUN_STATIC_ANALYSIS: '정적 분석 실행',
  DISCOVER_RISKY_FUNCTIONS: '위험 함수 탐지',
  RUN_DEPENDENCY_SCAN: '의존성 취약점 스캔',
  RUN_SECRET_SCAN: 'Secret 노출 검사',
  ANALYZE_DATA_MODEL: '데이터 모델 분석',
  ANALYZE_DEPLOY_URL: '배포 URL 분석',
  CHECK_DESIGN_CONSISTENCY: '디자인 일관성 점검',
  ANALYZE_BUSINESS_READINESS: '비즈니스 준비도 점검',
  GENERATE_FEATURE_GRAPH: '기능 관계도 생성',
  MAP_CHECKLIST: '체크리스트 매핑',
  CALCULATE_SCORES: '점수 계산',
  GENERATE_REPORT: '리포트 작성',
  GENERATE_IMPROVEMENT_PRD: '개선 PRD 작성',
  CLEANUP: '정리',
};
