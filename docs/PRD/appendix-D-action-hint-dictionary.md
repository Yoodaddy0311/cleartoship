# Appendix D: Action Hint Dictionary — Finding → "지금 할 일" 매핑 SSOT

**작성일**: 2026-05-18
**작성자**: planner / Claude (Opus 4.7) — design-only
**상위 PRD**: [finalize-launch-2026-05-18.md](./finalize-launch-2026-05-18.md)
**참조 섹션**: §3.2.3 Actionable Next Step + §4 L-P0-6 + Appendix A §A.4
**목적**: 각 finding에 대해 "지금 할 일 + 예상 작업량"을 결정하는 단일 사전 — render-markdown과 UI가 모두 import하는 SSOT

> **SSOT 원칙 (feedback_audit_core_ssot.md 준수)**: worker step이나 web component에서 inline 매핑 금지. 반드시 `packages/audit-core/src/finding-action-hints.ts`(신규 예정)에서 import 한다.

---

## §D.1 목적

§3.2.3에서 정의한 "actionable next step" UX의 데이터 소스. finding 객체의 `ruleId` 또는 `ruleFamily`를 입력받아 한국어 action hint + ETA(예상 작업량)를 반환한다.

- **ETA 4단계**: 5분 / 30분 / 60분 / 240분(반나절)
- **hint 길이**: 한국어 200자 이내
- **fallback**: 매핑 없는 ruleId는 severity 기반 default 반환

---

## §D.2 포맷 정의

각 매핑 항목은 다음 GFM 표 한 행:

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA (min) | 참고 |
| :--------- | :---------- | :-: | :------------------- | --------: | :--- |
| SECRET_SCAN_LEAK | SEC-001 | P0 | `git rm --cached` + `.gitignore` 추가 + 노출 키 rotate | 5 | OWASP A02 |

**필드 정의**

| 필드 | 타입 | 제약 |
|---|---|---|
| RuleFamily | string (UPPER_SNAKE) | 카테고리 prefix (SEC/UX/FE/BE/DM/LR/MD/BR/FF 등) |
| RuleId | string | 예시 — 실제 구현 시 `packages/audit-core/src/rules/` 의 ruleId와 cross-check 필수 |
| Sv | enum | P0 / P1 / P2 / P3 |
| Action Hint | string (한국어) | max 200자, 명령형/구체적 |
| ETA | enum | 5 / 30 / 60 / 240 |
| 참고 | string | OWASP/MDN/WCAG 항목 또는 내부 finding family |

---

## §D.3 카테고리별 매핑 (42 항목)

### §D.3.1 SECURITY_PRIVACY (8 항목)

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA | 참고 |
| :--- | :--- | :-: | :--- | --: | :--- |
| SECRET_SCAN_LEAK | SEC-001 | P0 | `git rm --cached <file>` + `.gitignore` 추가 + 노출된 키/토큰 즉시 rotate | 5 | OWASP A02 |
| MISSING_AUTH_GUARD | SEC-002 | P0 | auth middleware 추가 또는 401/403 응답 반환. 라우트별 가드 체크리스트 작성 | 30 | OWASP A01 |
| SQL_INJECTION | SEC-003 | P0 | parameterized query/prepared statement 또는 ORM(Prisma/Drizzle) 사용 | 30 | OWASP A03 |
| XSS_DOM_INJECTION | SEC-004 | P0 | `innerHTML` 대신 `textContent` 또는 DOMPurify 적용. React에서는 `dangerouslySetInnerHTML` 회피 | 30 | OWASP A03 |
| HARDCODED_API_KEY | SEC-005 | P0 | 환경변수로 이동 + `.env.example` 갱신 + 노출 키 rotate | 5 | OWASP A02 |
| PERMISSIVE_CORS | SEC-006 | P1 | `Access-Control-Allow-Origin: *` 제거, 화이트리스트 도메인만 허용 | 30 | OWASP A05 |
| MISSING_CSRF_TOKEN | SEC-007 | P1 | CSRF middleware (csurf 등) 또는 `SameSite=Strict` cookie + 토큰 검증 | 60 | OWASP A01 |
| INSECURE_COOKIE | SEC-008 | P1 | cookie 설정에 `Secure` + `HttpOnly` + `SameSite=Strict` 추가 | 5 | OWASP A02 |

### §D.3.2 UX_UI (5 항목)

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA | 참고 |
| :--- | :--- | :-: | :--- | --: | :--- |
| GHOST_BUTTON | UX-001 | P1 | `onClick`/`onSubmit` 핸들러 구현 또는 `disabled` prop 추가 + 시각 피드백 | 30 | T3.8 W3-F |
| MISSING_ALT_TEXT | UX-002 | P2 | `<img alt="...">` 추가 — 장식 이미지면 `alt=""`(빈 문자열) + role="presentation" | 5 | WCAG 1.1.1 |
| LOW_CONTRAST | UX-003 | P1 | 텍스트/배경 색상 대비 4.5:1 이상으로 조정 (큰 글자는 3:1) | 30 | WCAG 1.4.3 |
| MOBILE_TAP_TARGET_SMALL | UX-004 | P2 | 인터랙티브 요소 `min-height: 44px`, padding 8px+ 적용 | 5 | WCAG 2.5.5 |
| INACCESSIBLE_FORM_LABEL | UX-005 | P1 | `<label for>` 또는 `aria-label`/`aria-labelledby` 추가 | 30 | WCAG 1.3.1 |

### §D.3.3 FRONTEND_CODE (4 항목)

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA | 참고 |
| :--- | :--- | :-: | :--- | --: | :--- |
| UNUSED_IMPORT | FE-001 | P2 | ESLint `--fix` 또는 수동 제거. tsc --noUnusedLocals 활성 권장 | 5 | knip |
| DEAD_CODE | FE-002 | P2 | unreachable branch/early-return 이후 코드 제거. ts-prune로 정리 | 30 | ts-prune |
| CONSOLE_LOG_LEFT | FE-003 | P2 | production build에서 strip (babel/swc plugin) 또는 logger로 교체 | 5 | — |
| MISSING_KEY_PROP | FE-004 | P2 | React list rendering의 각 element에 unique `key={...}` 추가 | 5 | React docs |

### §D.3.4 BACKEND_API (4 항목)

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA | 참고 |
| :--- | :--- | :-: | :--- | --: | :--- |
| MISSING_INPUT_VALIDATION | BE-001 | P1 | zod/joi schema 추가 + 실패 시 422 응답. 모든 user input은 boundary에서 검증 | 30 | artibot backend-patterns |
| NO_RATE_LIMIT | BE-002 | P1 | `express-rate-limit` 또는 Cloud Run concurrency 제한. 공개 엔드포인트 필수 | 60 | OWASP A04 |
| UNHANDLED_PROMISE_REJECTION | BE-003 | P1 | async 함수에 `try/catch` 또는 `.catch()`. global handler에서 로깅 | 30 | Node.js docs |
| N_PLUS_ONE_QUERY | BE-004 | P2 | JOIN 또는 dataloader/batch loading. ORM의 `include`/`with` 활용 | 60 | Prisma docs |

### §D.3.5 DATA_MODEL (3 항목)

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA | 참고 |
| :--- | :--- | :-: | :--- | --: | :--- |
| MISSING_FOREIGN_KEY | DM-001 | P1 | FK constraint 추가 + 기존 데이터 무결성 점검 + migration 작성 | 60 | — |
| NULLABLE_REQUIRED_FIELD | DM-002 | P1 | NOT NULL 적용 + default 값 정의. 기존 NULL row backfill 필요 | 30 | — |
| UNINDEXED_QUERY_COLUMN | DM-003 | P2 | `CREATE INDEX` 추가 (WHERE/ORDER BY 자주 쓰이는 컬럼). EXPLAIN으로 검증 | 30 | Postgres docs |

### §D.3.6 LAUNCH_READINESS (4 항목)

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA | 참고 |
| :--- | :--- | :-: | :--- | --: | :--- |
| COLD_START_SLOW | LR-001 | P1 | Cloud Run `min-instances=1` (prod) 적용 또는 warmup endpoint + cron ping | 30 | T1.6 #96 |
| MISSING_HEALTH_CHECK | LR-002 | P1 | `/healthz` GET 200 endpoint 추가. DB/외부 의존성 ready 체크 | 30 | k8s docs |
| NO_GRACEFUL_SHUTDOWN | LR-003 | P2 | `SIGTERM` handler에서 in-flight request 완료 대기 + DB 연결 정리 | 60 | — |
| MISSING_OBSERVABILITY | LR-004 | P1 | structured logging (pino/winston) + error tracking (Sentry/Bugsnag) | 60 | T2.13 |

### §D.3.7 MAINTAINABILITY_DOCUMENTATION (3 항목)

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA | 참고 |
| :--- | :--- | :-: | :--- | --: | :--- |
| MISSING_LICENSE | MD-001 | P2 | `LICENSE` 파일 추가 (MIT 템플릿 권장 — github.com/licenses/choosealicense.com) | 5 | — |
| EMPTY_README | MD-002 | P2 | README에 setup / usage / deploy / contributing 4 섹션 추가 | 60 | — |
| NO_API_DOC | MD-003 | P2 | OpenAPI/JSDoc 추가 또는 README에 endpoint 표 작성 | 240 | — |

### §D.3.8 BUSINESS_READINESS (3 항목)

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA | 참고 |
| :--- | :--- | :-: | :--- | --: | :--- |
| MISSING_PRICING_PAGE | BR-001 | P1 | `/pricing` 페이지 추가 + plan 비교 표 + CTA. 한국 사업자라면 부가세 명시 | 240 | T2.8 |
| MISSING_TOS | BR-002 | P1 | 약관/개인정보처리방침 페이지 추가. 한국은 정보통신망법 필수 항목 포함 | 60 | T2.8 |
| MISSING_CONTACT | BR-003 | P2 | contact 이메일 또는 form 추가 (footer 또는 /contact). 사업자 정보 표시 | 30 | — |

### §D.3.9 FUNCTIONAL_FLOW (3 항목)

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA | 참고 |
| :--- | :--- | :-: | :--- | --: | :--- |
| FAKE_FLOW_DETECTED | FF-001 | P1 | mock handler를 실제 API/DB 연동으로 교체. mock 사용 시 fixture 분리 | 240 | T3.8 W3-F |
| BROKEN_REDIRECT | FF-002 | P1 | redirect 체인 점검 + final URL 200 확인. 인증 후 returnUrl 검증 | 30 | — |
| INFINITE_LOOP_REDIRECT | FF-003 | P0 | redirect 조건 분기 수정. 인증 상태와 redirect 대상의 mutual exclusion 확인 | 30 | — |

### §D.3.10 PRODUCT_INTENT / REQUIREMENT_COVERAGE / FEATURE_GRAPH (5 항목)

| RuleFamily | 예시 RuleId | Sv | Action Hint (한국어) | ETA | 참고 |
| :--- | :--- | :-: | :--- | --: | :--- |
| PRD_CLAIM_UNMATCHED | PI-001 | P1 | PRD claim에 해당하는 feature 구현 또는 PRD에서 해당 claim 제거. Coverage Matrix 검토 | 240 | Appendix C |
| FEATURE_GRAPH_ORPHAN | FG-001 | P2 | orphan node 제거 또는 entry point에 연결. Dead route는 삭제 | 60 | T2.14 |
| REQUIREMENT_PARTIAL | RC-001 | P1 | unfinished requirement 완성 또는 backlog로 이동 + PRD 명시 | 240 | W1-B |
| FEATURE_DUPLICATE | FG-002 | P2 | 중복 feature를 단일 모듈로 통합. import 경로 정리 | 60 | refactor-cleaner |
| CHECKLIST_UNMAPPED | RC-002 | P2 | W1-B 80 ID 중 unmapped 항목을 detector에 추가 또는 PRD 클레임 보강 | 60 | W1-B |

**카테고리별 최소 항목 수 확인**: SEC 8 + UX 5 + FE 4 + BE 4 + DM 3 + LR 4 + MD 3 + BR 3 + FF 3 + 기타 5 = **42** ≥ 38 ✅

---

## §D.4 Fallback 규칙

매핑되지 않은 ruleId/ruleFamily 입력 시 severity 기반으로 default 반환:

| Severity | Action Hint (한국어) | ETA (min) |
| :------: | :------------------- | --------: |
| P0 | 즉시 검토 필요 — 영향 범위 분석 후 수정. 자세한 분류는 evidence 확인 | 60 |
| P1 | 30분 이내 작업 권장 — 영향 범위 확인 후 수정 | 30 |
| P2 | 여유 시 처리 — 사용자 영향도 낮음. 코드 정리 차원에서 수정 | 30 |
| P3 | 선택적 — 코드 품질 개선용. 다음 maintenance window에서 처리 | 5 |

추가 fallback: severity까지 누락된 경우 → `{ text: '검토 필요', etaMinutes: 30 }` (최후의 안전망).

---

## §D.5 도입 가이드

### §D.5.1 파일 위치 (신규)

`packages/audit-core/src/finding-action-hints.ts`

### §D.5.2 TypeScript 인터페이스

```typescript
import type { Severity } from '@cleartoship/shared-types';

export type ActionHintEta = 5 | 30 | 60 | 240;

export interface ActionHint {
  readonly text: string;            // 한국어, max 200자
  readonly etaMinutes: ActionHintEta;
  readonly referenceUrl?: string;   // 참고 링크 (OWASP/MDN/WCAG/내부 PRD)
}

export interface ActionHintDictionary {
  readonly byRuleId: ReadonlyMap<string, ActionHint>;
  readonly byRuleFamily: ReadonlyMap<string, ActionHint>;
  readonly fallbackBySeverity: ReadonlyMap<Severity, ActionHint>;
  readonly ultimateFallback: ActionHint;
}

export function loadActionHintDictionary(): ActionHintDictionary {
  // §D.3 표를 데이터로 inline 또는 별도 JSON에서 로드
  return {
    byRuleId: new Map([
      ['SEC-001', { text: '`git rm --cached <file>` + `.gitignore` 추가 + 노출된 키/토큰 즉시 rotate', etaMinutes: 5, referenceUrl: 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/' }],
      // ...전체 42 항목...
    ]),
    byRuleFamily: new Map([
      ['SECRET_SCAN_LEAK', /* ...same as SEC-001... */ ],
      // ...전체 42 family...
    ]),
    fallbackBySeverity: new Map([
      ['P0', { text: '즉시 검토 필요 — 영향 범위 분석 후 수정. 자세한 분류는 evidence 확인', etaMinutes: 60 }],
      ['P1', { text: '30분 이내 작업 권장 — 영향 범위 확인 후 수정', etaMinutes: 30 }],
      ['P2', { text: '여유 시 처리 — 사용자 영향도 낮음. 코드 정리 차원에서 수정', etaMinutes: 30 }],
      ['P3', { text: '선택적 — 코드 품질 개선용. 다음 maintenance window에서 처리', etaMinutes: 5 }],
    ]),
    ultimateFallback: { text: '검토 필요', etaMinutes: 30 },
  };
}

export function getActionHint(
  finding: { ruleId?: string; ruleFamily?: string; severity: Severity },
  dict: ActionHintDictionary,
): ActionHint {
  return (
    (finding.ruleId && dict.byRuleId.get(finding.ruleId)) ||
    (finding.ruleFamily && dict.byRuleFamily.get(finding.ruleFamily)) ||
    dict.fallbackBySeverity.get(finding.severity) ||
    dict.ultimateFallback
  );
}
```

### §D.5.3 호출 예시 (render-markdown.ts)

```typescript
import { getActionHint, loadActionHintDictionary } from './finding-action-hints.js';

const dict = loadActionHintDictionary();

export function renderFindingRow(f: Finding): string {
  const hint = getActionHint(f, dict);
  return `| ${f.severity} | ${f.confidence} | ${f.title} | ${f.category} | ${hint.text} **(${hint.etaMinutes}분)** |`;
}
```

### §D.5.4 SSOT 강제 (feedback_audit_core_ssot.md 인용)

- ❌ `workers/audit-worker/src/steps/18-generate-report.ts` 안에 hint 매핑 inline 금지
- ❌ `apps/web/components/findings/finding-card.tsx` 안에 hint 매핑 inline 금지
- ✅ 모두 `@cleartoship/audit-core`에서 `getActionHint()` import 후 호출

### §D.5.5 실제 RuleId Cross-check (구현 시 필수)

본 문서의 RuleId(SEC-001, UX-001 등)는 **예시**다. 실제 구현 시점에 다음을 수행:

1. `packages/audit-core/src/rules/` 디렉토리 grep으로 실 ruleId 목록 추출
2. 본 사전의 예시 RuleId와 mapping 확인 — 불일치 시 사전 또는 ruleId 어느 쪽을 source of truth로 할지 결정
3. 매핑 누락 ruleId는 fallback으로 처리되므로 critical 아님 — 단, P0 finding 중 fallback에 의존하는 ruleId가 있다면 우선 사전에 추가

### §D.5.6 schema 변경 (Finding.actionHint 필드 추가)

`packages/shared-types/src/domain.ts`의 `FindingSchema`에:

```typescript
export const ActionHintSchema = z.object({
  text: z.string().max(200),
  etaMinutes: z.union([z.literal(5), z.literal(30), z.literal(60), z.literal(240)]),
  referenceUrl: z.string().url().optional(),
});

export const FindingSchema = z.object({
  // ...기존 필드...
  actionHint: ActionHintSchema.optional(),  // ← 신규 optional
});
```

**검증** (feedback_full_test_run.md 준수): shared-types + audit-core + audit-worker + apps/web 4 패키지 동시 test run 필수.

---

## §D.6 변경 이력

| 날짜 | 변경 | 작성자 |
|---|---|---|
| 2026-05-18 | 최초 작성 — 9 카테고리 42 매핑 + fallback 4종 + TS 인터페이스 + 호출 예시 + SSOT 강제 + cross-check 가이드 | planner / Claude (Opus 4.7) |
