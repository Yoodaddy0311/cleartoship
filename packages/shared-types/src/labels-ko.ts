// Korean label maps for enums in `enums.ts`.
//
// Non-developer users see enum values directly in the UI (e.g. P0, ui_only,
// SECURITY_PRIVACY). These maps centralize the user-facing Korean strings so
// every surface (web app, reports, exports) renders the same wording.
//
// Sibling of `domain.ts` which already exports `LAUNCH_STATUS_LABELS_KO`
// (kept there because it lives with the `LaunchStatus` enum definition).

import type {
  AuditCategory,
  Confidence,
  FeatureEdgeType,
  FeatureNodeType,
  FindingStatus,
  ImplementationStatus,
  Severity,
} from './enums.js';

export interface LabelWithDescription {
  label: string;
  description: string;
}

export const SEVERITY_LABELS_KO: Record<Severity, LabelWithDescription> = {
  P0: {
    label: '출시 차단',
    description: '지금 출시하면 즉시 큰 문제가 생기는 항목',
  },
  P1: {
    label: '강력 권장',
    description: '출시 전 반드시 손봐야 할 항목',
  },
  P2: {
    label: '개선 권장',
    description: '품질을 높이기 위한 개선 항목',
  },
  P3: {
    label: '장기 개선',
    description: '여유 있을 때 손봐도 되는 항목',
  },
};

export const SEVERITY_COLOR_TOKEN: Record<Severity, string> = {
  P0: 'severity-p0',
  P1: 'severity-p1',
  P2: 'severity-p2',
  P3: 'severity-p3',
};

export const AUDIT_CATEGORY_LABELS_KO: Record<AuditCategory, LabelWithDescription> = {
  PRODUCT_INTENT: {
    label: '기획 의도',
    description: '기획서가 코드에 잘 반영됐는지',
  },
  REQUIREMENT_COVERAGE: {
    label: '요구사항 충족',
    description: 'PRD 의 기능이 다 만들어졌는지',
  },
  FEATURE_GRAPH: {
    label: '기능 관계도',
    description: '화면과 API 가 어떻게 연결됐는지',
  },
  FUNCTIONAL_FLOW: {
    label: '사용자 흐름',
    description: '주요 동작이 끊김 없이 작동하는지',
  },
  UX_UI: {
    label: 'UX/UI',
    description: '디자인과 사용성',
  },
  FRONTEND_CODE: {
    label: '프론트엔드 코드',
    description: '화면 코드의 품질과 성능',
  },
  BACKEND_API: {
    label: '백엔드 API',
    description: '서버 API 의 안전성과 정확성',
  },
  DATA_MODEL: {
    label: '데이터 모델',
    description: '데이터베이스 설계',
  },
  SECURITY_PRIVACY: {
    label: '보안/개인정보',
    description: '보안 취약점과 개인정보 보호',
  },
  LAUNCH_READINESS: {
    label: '출시 준비',
    description: '환경 변수, 빌드, 배포 점검',
  },
  MAINTAINABILITY_DOCUMENTATION: {
    label: '유지보수',
    description: '코드 가독성과 문서화',
  },
  BUSINESS_READINESS: {
    label: '비즈니스 준비도',
    description: '가격/약관/온보딩/지원/분석 도구 등 출시 운영 요소',
  },
};

export const IMPLEMENTATION_STATUS_LABELS_KO: Record<ImplementationStatus, LabelWithDescription> = {
  complete: {
    label: '완성',
    description: 'UI + 로직 + 연결 모두 갖춰짐',
  },
  partial: {
    label: '부분 완성',
    description: '일부만 구현됨',
  },
  ui_only: {
    label: '화면만 있음',
    description: 'UI 는 있지만 실제 동작하는 API 가 없음',
  },
  logic_only: {
    label: '로직만 있음',
    description: 'API 는 있지만 화면에서 호출하지 않음',
  },
  missing_connection: {
    label: '연결 누락',
    description: '필요한 연결 (예: 인증 가드) 이 빠짐',
  },
  missing: {
    label: '미구현',
    description: '아직 만들어지지 않음',
  },
  risky: {
    label: '위험 요소 있음',
    description: '보안/데이터 무결성 검토 필요',
  },
  recommended: {
    label: '추가 권장',
    description: '있으면 좋은 기능 — 아직 없음',
  },
  unknown: {
    label: '판단 불가',
    description: '자동 분석으로 확인하지 못함',
  },
};

export const CONFIDENCE_LABELS_KO: Record<Confidence, string> = {
  HIGH: '높음',
  MEDIUM: '중간',
  LOW: '낮음',
};

export const FINDING_STATUS_LABELS_KO: Record<FindingStatus, string> = {
  OPEN: '미확인',
  ACKNOWLEDGED: '확인함',
  RESOLVED: '해결됨',
  FALSE_POSITIVE: '오탐',
};

export const FEATURE_NODE_TYPE_LABELS_KO: Record<FeatureNodeType, string> = {
  product_area: '제품 영역',
  feature: '기능',
  page: '페이지',
  component: '컴포넌트',
  action: '액션',
  api: 'API',
  data_model: '데이터 모델',
  external_service: '외부 서비스',
  auth_guard: '인증 가드',
  state: '상태',
  recommended_feature: '추천 기능',
};

export const FEATURE_EDGE_TYPE_LABELS_KO: Record<FeatureEdgeType, string> = {
  contains: '포함',
  renders: '렌더링',
  navigates_to: '이동',
  triggers: '트리거',
  calls_api: 'API 호출',
  reads_from: '읽기',
  writes_to: '쓰기',
  requires_auth: '인증 필요',
  depends_on: '의존',
  missing_link: '누락된 연결',
  recommended_connection: '추천 연결',
};
