import { z } from 'zod';

/**
 * 15-step audit pipeline. Order is significant — the worker iterates linearly
 * and writes progress percent = (currentIndex / total) * 100.
 *
 * Source: `09_data_model_api_spec.md` §4.
 */
export const AUDIT_STEPS = [
  'VALIDATE_INPUT',
  'FETCH_REPO_METADATA',
  'CLONE_REPO',
  'ANALYZE_PROJECT_STRUCTURE',
  'DETECT_FEATURES',
  'RUN_STATIC_ANALYSIS',
  'DISCOVER_RISKY_FUNCTIONS',
  'RUN_DEPENDENCY_SCAN',
  'RUN_SECRET_SCAN',
  'ANALYZE_DATA_MODEL',
  'ANALYZE_DEPLOY_URL',
  'CHECK_DESIGN_CONSISTENCY',
  'GENERATE_FEATURE_GRAPH',
  'MAP_CHECKLIST',
  'CALCULATE_SCORES',
  'GENERATE_REPORT',
  'GENERATE_IMPROVEMENT_PRD',
  'CLEANUP',
] as const;

export type AuditStep = (typeof AUDIT_STEPS)[number];

export const AuditStepSchema = z.enum(AUDIT_STEPS);

/** Korean labels surfaced to the audit progress UI (5.2 progress screen). */
export const AUDIT_STEP_LABELS_KO: Record<AuditStep, string> = {
  VALIDATE_INPUT: '입력 검증',
  FETCH_REPO_METADATA: 'Repo 메타데이터 수집',
  CLONE_REPO: 'Repo 다운로드',
  ANALYZE_PROJECT_STRUCTURE: '프로젝트 구조 분석',
  DETECT_FEATURES: '기능 후보 탐지',
  RUN_STATIC_ANALYSIS: '정적 분석 (Semgrep)',
  DISCOVER_RISKY_FUNCTIONS: '위험 함수 탐지',
  RUN_DEPENDENCY_SCAN: '의존성 취약점 점검',
  RUN_SECRET_SCAN: 'Secret 노출 점검',
  ANALYZE_DATA_MODEL: '데이터 모델 점검',
  ANALYZE_DEPLOY_URL: '배포 URL 진단',
  CHECK_DESIGN_CONSISTENCY: '디자인 일관성 점검',
  GENERATE_FEATURE_GRAPH: '기능 관계도 구성',
  MAP_CHECKLIST: '체크리스트 매핑',
  CALCULATE_SCORES: '점수 계산',
  GENERATE_REPORT: '리포트 생성',
  GENERATE_IMPROVEMENT_PRD: '개선 PRD 생성',
  CLEANUP: '정리',
};
