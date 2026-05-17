// T2.7 RULE_FAMILY_EXPLANATIONS — locale-aware, category-tagged rule family
// dictionary used by L3 explainer surfaces to translate raw tool rule-ids
// (semgrep, eslint, osv, lighthouse, axe …) into vibe-coder friendly prose.
//
// Why this lives in audit-core and not next to the worker step:
//   - Multiple surfaces need the lookup: worker pipeline, web report UI
//     (when re-rendering historical findings), and the No-LLM explainer path.
//     Pulling the dictionary into audit-core lets any consumer import it
//     without depending on the audit-worker package.
//   - Co-locating with severity-ko.ts (T1.4) keeps the i18n pattern uniform:
//     KO map + EN map + locale resolver.
//
// Coverage goal (Task #117):
//   - 40+ rule families across all 11 AuditCategory literals.
//   - Each family declares { id, category, pattern, displayName_ko/en,
//     summary_ko/en, learnMoreUrl? } so the renderer can pick the active
//     locale without re-doing the regex match.
//
// Matching contract:
//   - `pattern` is tested case-insensitively against the raw rule id.
//   - First match wins; entries are ordered roughly most-specific → most-
//     general within each category, then high-severity categories first
//     (security > performance > a11y > maintainability) to break ties when
//     a rule id legitimately fits more than one family.
//   - `explainRuleFamily(ruleId)` returns null on no-match — callers decide
//     the fallback wording. We intentionally do NOT bake the worker's
//     severity-suffix into this layer; that belongs in the surface (worker
//     keeps its own urgency suffix; web renderer can attach its own).

import type { AuditCategory } from '@cleartoship/shared-types';

export interface RuleFamilyExplanation {
  /** Stable slug; safe to use as a dictionary key or analytics dimension. */
  readonly id: string;
  /** AuditCategory the family rolls up under. */
  readonly category: AuditCategory;
  /** Case-insensitive regex matched against the raw tool rule id. */
  readonly pattern: RegExp;
  readonly displayName_ko: string;
  readonly displayName_en: string;
  readonly summary_ko: string;
  readonly summary_en: string;
  readonly learnMoreUrl?: string;
}

export const RULE_FAMILY_EXPLANATIONS: ReadonlyArray<RuleFamilyExplanation> = [
  // -------------------------------------------------------------------------
  // SECURITY_PRIVACY (12)
  // -------------------------------------------------------------------------
  {
    id: 'sql-injection',
    category: 'SECURITY_PRIVACY',
    pattern: /sql[-_.]?inject|sqli/i,
    displayName_ko: 'SQL 인젝션',
    displayName_en: 'SQL Injection',
    summary_ko: '사용자가 입력한 값이 데이터베이스 쿼리에 그대로 섞여 들어가고 있어요. 공격자가 데이터를 훔치거나 지울 수 있습니다. 파라미터 바인딩(예: prepared statement)으로 바꿔야 합니다.',
    summary_en: 'User input is being concatenated into a database query. An attacker could read or wipe your data. Switch to parameterised queries / prepared statements.',
    learnMoreUrl: 'https://owasp.org/www-community/attacks/SQL_Injection',
  },
  {
    id: 'xss',
    category: 'SECURITY_PRIVACY',
    pattern: /xss|cross[-_.]?site[-_.]?scripting/i,
    displayName_ko: '크로스사이트 스크립팅 (XSS)',
    displayName_en: 'Cross-site Scripting (XSS)',
    summary_ko: '사용자가 입력한 텍스트가 화면에 그대로 출력되어 악성 스크립트가 실행될 수 있어요. 출력 전에 이스케이프하거나 React라면 `dangerouslySetInnerHTML`을 피하세요.',
    summary_en: 'User-supplied text is rendered into the page without escaping, letting attackers run JavaScript in your users\' browsers. Escape on output or avoid `dangerouslySetInnerHTML`.',
    learnMoreUrl: 'https://owasp.org/www-community/attacks/xss/',
  },
  {
    id: 'path-traversal',
    category: 'SECURITY_PRIVACY',
    pattern: /path[-_.]?travers|directory[-_.]?travers/i,
    displayName_ko: '경로 우회',
    displayName_en: 'Path Traversal',
    summary_ko: '사용자 입력으로 파일 경로를 만들고 있어 `../` 같은 패턴으로 의도하지 않은 파일에 접근할 수 있어요. 화이트리스트 검증을 추가하세요.',
    summary_en: 'File paths are built from user input, so `../` sequences could reach files you never meant to expose. Validate against a whitelist or resolve and confirm the path stays inside the allowed root.',
  },
  {
    id: 'command-injection',
    category: 'SECURITY_PRIVACY',
    pattern: /command[-_.]?inject|os[-_.]?command|shell[-_.]?inject/i,
    displayName_ko: '명령어 인젝션',
    displayName_en: 'Command Injection',
    summary_ko: '사용자 입력이 쉘 명령어에 섞여 실행될 수 있어요. 가능한 한 `spawn` 같은 인자 배열 방식을 쓰고, 입력을 검증하세요.',
    summary_en: 'User input flows into a shell command. Prefer argv-style `spawn` over string concatenation and validate the input.',
  },
  {
    id: 'ssrf',
    category: 'SECURITY_PRIVACY',
    pattern: /ssrf|server[-_.]?side[-_.]?request/i,
    displayName_ko: 'SSRF (서버 사이드 요청 위조)',
    displayName_en: 'Server-Side Request Forgery',
    summary_ko: '외부 URL을 사용자가 지정할 수 있어 내부망(예: 메타데이터 서버)에 요청이 갈 수 있어요. 도메인 화이트리스트가 필요합니다.',
    summary_en: 'A user-controlled URL is fetched server-side, so internal targets (cloud metadata, intranet) could be reached. Whitelist allowed hosts.',
    learnMoreUrl: 'https://owasp.org/www-community/attacks/Server_Side_Request_Forgery',
  },
  {
    id: 'secrets-detected',
    category: 'SECURITY_PRIVACY',
    pattern: /hardcoded|secret|api[-_.]?key|password|credential/i,
    displayName_ko: '비밀값 노출',
    displayName_en: 'Secrets Detected in Source',
    summary_ko: '코드에 키/비밀번호가 박혀 있는 패턴이 보입니다. 환경변수나 secret manager로 옮기세요. 이미 커밋했다면 키를 즉시 회전(rotate)해야 합니다.',
    summary_en: 'A key or password appears hard-coded in source. Move it to environment variables or a secret manager — and rotate the value if it has already been committed.',
  },
  {
    id: 'auth-misconfigured',
    category: 'SECURITY_PRIVACY',
    pattern: /auth[-_.]?(bypass|misconfig|broken)|missing[-_.]?auth/i,
    displayName_ko: '인증 설정 오류',
    displayName_en: 'Authentication Misconfigured',
    summary_ko: '인증 검사가 누락되었거나 우회할 수 있는 경로가 있어요. 모든 보호된 라우트에서 사용자/세션을 확인하세요.',
    summary_en: 'An authentication check is missing or bypassable. Verify the session/user on every protected route.',
  },
  {
    id: 'jwt-misuse',
    category: 'SECURITY_PRIVACY',
    pattern: /jwt|jsonwebtoken/i,
    displayName_ko: 'JWT 사용 주의',
    displayName_en: 'JWT Misuse',
    summary_ko: '토큰 알고리즘이 약하거나 검증이 누락된 패턴이 보입니다. 알고리즘을 명시(`RS256` 등)하고 만료/issuer를 검증하세요.',
    summary_en: 'JWT verification looks weak or missing. Pin the algorithm (e.g. `RS256`) and validate `exp` / `iss`.',
  },
  {
    id: 'csrf',
    category: 'SECURITY_PRIVACY',
    pattern: /csrf|cross[-_.]?site[-_.]?request/i,
    displayName_ko: 'CSRF (크로스사이트 요청 위조)',
    displayName_en: 'Cross-Site Request Forgery',
    summary_ko: '상태 변경 요청에 토큰 검증이 빠진 패턴이에요. SameSite 쿠키나 CSRF 토큰을 추가하세요.',
    summary_en: 'State-changing requests lack token validation. Add a CSRF token or SameSite cookies.',
  },
  {
    id: 'open-redirect',
    category: 'SECURITY_PRIVACY',
    pattern: /open[-_.]?redirect/i,
    displayName_ko: '열린 리디렉트',
    displayName_en: 'Open Redirect',
    summary_ko: '사용자 입력을 그대로 리디렉트 URL로 쓰면 피싱에 악용될 수 있어요. 화이트리스트로 검증하세요.',
    summary_en: 'A redirect target comes from user input — perfect for phishing. Validate against a whitelist of allowed paths.',
  },
  {
    id: 'eval-dynamic-exec',
    category: 'SECURITY_PRIVACY',
    pattern: /\beval\b|new[-_.]?function/i,
    displayName_ko: '동적 코드 실행',
    displayName_en: 'Dynamic Code Execution',
    summary_ko: '`eval`/`new Function`은 입력이 그대로 실행돼 매우 위험해요. 대체 방법을 찾으세요.',
    summary_en: '`eval` / `new Function` run arbitrary input as code. Find another way.',
  },
  {
    id: 'cors-wildcard',
    category: 'SECURITY_PRIVACY',
    pattern: /\bcors\b/i,
    displayName_ko: 'CORS 설정 주의',
    displayName_en: 'CORS Misconfiguration',
    summary_ko: '`Access-Control-Allow-Origin: *` 같이 모든 출처를 허용하면 인증 정보가 외부에서 사용될 수 있어요. 출처를 좁히세요.',
    summary_en: 'Allowing every origin lets attackers read authenticated responses. Restrict to known origins.',
  },

  // -------------------------------------------------------------------------
  // SECURITY_PRIVACY — crypto / cookies (3)
  // -------------------------------------------------------------------------
  {
    id: 'insecure-random',
    category: 'SECURITY_PRIVACY',
    pattern: /insecure[-_.]?random|weak[-_.]?random|math[-_.]?random/i,
    displayName_ko: '안전하지 않은 난수',
    displayName_en: 'Insecure Random',
    summary_ko: '보안용으로 `Math.random()` 같은 약한 난수를 쓰고 있어요. 토큰/세션 ID 등엔 `crypto.randomBytes` 같은 암호학적 난수를 쓰세요.',
    summary_en: 'A non-cryptographic RNG is used in a security context. Switch to `crypto.randomBytes` (or equivalent) for tokens and session IDs.',
  },
  {
    id: 'insecure-hash',
    category: 'SECURITY_PRIVACY',
    pattern: /insecure[-_.]?hash|\bmd5\b|\bsha1\b/i,
    displayName_ko: '약한 해시 알고리즘',
    displayName_en: 'Weak Hash Algorithm',
    summary_ko: 'MD5/SHA1은 충돌이 발견되어 보안 용도로는 부적합합니다. 비밀번호는 bcrypt/argon2, 무결성은 SHA-256 이상을 쓰세요.',
    summary_en: 'MD5 / SHA-1 have known collisions. Use bcrypt / argon2 for passwords and SHA-256+ for integrity.',
  },
  {
    id: 'insecure-cookie',
    category: 'SECURITY_PRIVACY',
    pattern: /insecure[-_.]?cookie|cookie[-_.]?(http(only|s)|samesite)/i,
    displayName_ko: '쿠키 보안 옵션 누락',
    displayName_en: 'Cookie Security Flags Missing',
    summary_ko: '`httpOnly`/`secure`/`sameSite` 옵션이 빠져 있어요. 세션 쿠키엔 모두 켜는 게 안전합니다.',
    summary_en: '`httpOnly` / `secure` / `sameSite` are missing. Set them all on session cookies.',
  },

  // -------------------------------------------------------------------------
  // SECURITY_PRIVACY — resilience (2)
  // -------------------------------------------------------------------------
  {
    id: 'regex-dos',
    category: 'SECURITY_PRIVACY',
    pattern: /regex[-_.]?dos|redos/i,
    displayName_ko: '정규식 DoS',
    displayName_en: 'Regex Denial-of-Service (ReDoS)',
    summary_ko: '백트래킹이 폭주할 수 있는 패턴이라 큰 입력에서 서버가 멈출 수 있어요. 정규식을 단순화하거나 입력 길이를 제한하세요.',
    summary_en: 'A regex with catastrophic backtracking can stall the server on crafted input. Simplify the pattern or cap input length.',
  },
  {
    id: 'prototype-pollution',
    category: 'SECURITY_PRIVACY',
    pattern: /prototype[-_.]?pollut/i,
    displayName_ko: '프로토타입 오염',
    displayName_en: 'Prototype Pollution',
    summary_ko: '입력이 `__proto__` 같은 키를 통해 객체의 기본 동작을 바꿀 수 있어요. 라이브러리 업데이트 또는 입력 검증이 필요합니다.',
    summary_en: 'User input can write to `__proto__`, mutating every object\'s prototype. Update the library or strip the dangerous keys.',
  },

  // -------------------------------------------------------------------------
  // PRODUCT_INTENT (2)
  // -------------------------------------------------------------------------
  {
    id: 'intent-no-prd',
    category: 'PRODUCT_INTENT',
    pattern: /intent[-_.]?no[-_.]?prd|prd[-_.]?missing/i,
    displayName_ko: 'PRD/제품 의도 문서 없음',
    displayName_en: 'Missing Product Intent Document',
    summary_ko: '어떤 사용자가 어떤 문제를 풀려는지 적힌 문서가 없어요. 짧게라도 작성해 두면 감사 정확도가 크게 올라갑니다.',
    summary_en: 'No PRD / intent document found. Even a short note about target user and core problem dramatically improves audit accuracy.',
  },
  {
    id: 'intent-readme-thin',
    category: 'PRODUCT_INTENT',
    pattern: /readme[-_.]?(thin|empty|missing)/i,
    displayName_ko: 'README 정보 부족',
    displayName_en: 'README Lacks Product Description',
    summary_ko: 'README에 무슨 제품인지 알 수 있는 설명이 부족합니다. 한 문단이라도 추가하면 신규 사용자/기여자가 훨씬 쉽게 이해해요.',
    summary_en: 'The README doesn\'t describe what the product does. Even a single paragraph improves onboarding.',
  },

  // -------------------------------------------------------------------------
  // REQUIREMENT_COVERAGE (2)
  // -------------------------------------------------------------------------
  {
    id: 'coverage-feature-missing',
    category: 'REQUIREMENT_COVERAGE',
    pattern: /coverage[-_.]?(missing|gap)|requirement[-_.]?missing/i,
    displayName_ko: 'PRD 요구사항 미구현',
    displayName_en: 'PRD Requirement Not Implemented',
    summary_ko: 'PRD에 적힌 기능이 코드에서 발견되지 않습니다. 의도적으로 빼놓은 게 아니라면 추가하거나 PRD에서 제거하세요.',
    summary_en: 'A PRD requirement has no corresponding code. Either ship it or remove it from the PRD to keep scope honest.',
  },
  {
    id: 'coverage-over-build',
    category: 'REQUIREMENT_COVERAGE',
    pattern: /over[-_.]?build|spurious[-_.]?feature/i,
    displayName_ko: 'PRD 외 추가 구현 (over-build)',
    displayName_en: 'Code Beyond PRD Scope',
    summary_ko: 'PRD에는 없는데 코드에는 있는 기능이에요. 검증되지 않은 범위 확장이므로 PRD를 업데이트하거나 삭제를 검토하세요.',
    summary_en: 'Code implements something the PRD doesn\'t mention. Either update the PRD or remove the extra scope.',
  },

  // -------------------------------------------------------------------------
  // FEATURE_GRAPH (2)
  // -------------------------------------------------------------------------
  {
    id: 'graph-orphan-node',
    category: 'FEATURE_GRAPH',
    pattern: /orphan[-_.]?node|unreachable[-_.]?(page|route)/i,
    displayName_ko: '연결되지 않은 화면/노드',
    displayName_en: 'Orphan Page or Node',
    summary_ko: '다른 화면에서 도달할 수 없는 페이지가 있어요. 메뉴/내비게이션 링크를 추가하거나 사용하지 않는다면 정리하세요.',
    summary_en: 'A page exists but no other page links to it. Add a navigation entry or delete the dead code.',
  },
  {
    id: 'graph-missing-link',
    category: 'FEATURE_GRAPH',
    pattern: /missing[-_.]?(link|edge|connection)/i,
    displayName_ko: '기능 간 연결 누락',
    displayName_en: 'Missing Feature Link',
    summary_ko: 'PRD/기획상 연결되어야 할 두 기능이 코드에서 이어지지 않습니다. 라우팅/이벤트 핸들러를 확인하세요.',
    summary_en: 'Two features that should be connected aren\'t linked in code. Check routing or event handlers.',
  },

  // -------------------------------------------------------------------------
  // FUNCTIONAL_FLOW (2)
  // -------------------------------------------------------------------------
  {
    id: 'flow-broken-path',
    category: 'FUNCTIONAL_FLOW',
    pattern: /broken[-_.]?flow|dead[-_.]?(end|button)/i,
    displayName_ko: '기능 흐름 끊김',
    displayName_en: 'Broken User Flow',
    summary_ko: '사용자가 다음 단계로 갈 수 없는 버튼/링크가 있어요. 핸들러나 라우트를 확인하세요.',
    summary_en: 'A button or link goes nowhere. Wire up its handler or fix the route.',
  },
  {
    id: 'flow-error-state-missing',
    category: 'FUNCTIONAL_FLOW',
    pattern: /error[-_.]?state[-_.]?missing|no[-_.]?error[-_.]?handling/i,
    displayName_ko: '에러 상태 처리 누락',
    displayName_en: 'Missing Error State',
    summary_ko: '요청이 실패했을 때 사용자에게 보여줄 화면/메시지가 없어요. 실패 케이스를 명시적으로 처리하세요.',
    summary_en: 'There\'s no UI for the failure case of an async action. Render an error state explicitly.',
  },

  // -------------------------------------------------------------------------
  // UX_UI (3)
  // -------------------------------------------------------------------------
  {
    id: 'a11y-keyboard-trap',
    category: 'UX_UI',
    pattern: /keyboard[-_.]?(trap|nav)|focus[-_.]?trap/i,
    displayName_ko: '키보드 함정 (접근성)',
    displayName_en: 'Keyboard Trap',
    summary_ko: '키보드만으로는 빠져나올 수 없는 컴포넌트가 있어요. 모달/메뉴에서 Tab/Esc로 닫을 수 있게 하세요.',
    summary_en: 'Keyboard users can\'t escape a component. Make Tab / Esc work as expected on modals and menus.',
    learnMoreUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap.html',
  },
  {
    id: 'a11y-color-contrast',
    category: 'UX_UI',
    pattern: /color[-_.]?contrast|contrast[-_.]?ratio/i,
    displayName_ko: '색상 대비 부족 (접근성)',
    displayName_en: 'Low Color Contrast',
    summary_ko: '글자/배경 대비가 낮아 잘 안 보여요. 본문은 4.5:1, 큰 글자는 3:1 이상을 권장합니다.',
    summary_en: 'Text/background contrast is below the WCAG threshold. Aim for 4.5:1 for body and 3:1 for large text.',
    learnMoreUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html',
  },
  {
    id: 'a11y-aria-missing',
    category: 'UX_UI',
    pattern: /aria[-_.]?(label|missing|role)|\baxe\b/i,
    displayName_ko: 'ARIA/접근성 라벨 누락',
    displayName_en: 'Missing ARIA Label',
    summary_ko: '버튼/아이콘에 보조 기술이 읽을 수 있는 라벨이 없어요. `aria-label` 또는 보이지 않는 텍스트를 추가하세요.',
    summary_en: 'A button or icon lacks an accessible name. Add `aria-label` or visually-hidden text.',
  },

  // -------------------------------------------------------------------------
  // FRONTEND_CODE (3)
  // -------------------------------------------------------------------------
  {
    id: 'frontend-react-hooks',
    category: 'FRONTEND_CODE',
    pattern: /react[-_.]?hooks?|exhaustive[-_.]?deps/i,
    displayName_ko: 'React Hook 사용 규칙 위반',
    displayName_en: 'React Hook Rule Violation',
    summary_ko: 'Hook 호출 순서나 의존성 배열이 React 규칙에 어긋납니다. 무한 렌더 또는 stale closure로 이어질 수 있어요.',
    summary_en: 'Hook ordering or dependency arrays violate React\'s rules. Can cause infinite renders or stale closures.',
  },
  {
    id: 'frontend-unused-code',
    category: 'FRONTEND_CODE',
    pattern: /\bunused\b|dead[-_.]?code|no[-_.]?unused/i,
    displayName_ko: '쓰이지 않는 코드',
    displayName_en: 'Unused Code',
    summary_ko: '지금 당장 버그는 아니지만 정리하면 번들 크기가 줄고 코드가 더 깔끔해집니다.',
    summary_en: 'Not a bug today, but trimming dead code shrinks the bundle and clarifies intent.',
  },
  {
    id: 'frontend-null-check',
    category: 'FRONTEND_CODE',
    pattern: /null[-_.]?check|no[-_.]?(undef|unsafe[-_.]?optional)/i,
    displayName_ko: 'null/undefined 처리 누락',
    displayName_en: 'Missing Null Check',
    summary_ko: '값이 없을 때 앱이 터질 수 있어요. 옵셔널 체이닝이나 조건 분기를 추가하세요.',
    summary_en: 'The app can crash when a value is missing. Use optional chaining or guard the access.',
  },

  // -------------------------------------------------------------------------
  // BACKEND_API (2)
  // -------------------------------------------------------------------------
  {
    id: 'api-input-validation',
    category: 'BACKEND_API',
    pattern: /input[-_.]?validation|missing[-_.]?validation|unvalidated/i,
    displayName_ko: 'API 입력 검증 누락',
    displayName_en: 'Missing API Input Validation',
    summary_ko: '요청 본문/쿼리를 검증하지 않고 그대로 사용하고 있어요. Zod 같은 스키마 검증을 추가하세요.',
    summary_en: 'Request body / query is used without validation. Add a schema validator (e.g. Zod).',
  },
  {
    id: 'api-rate-limit-missing',
    category: 'BACKEND_API',
    pattern: /rate[-_.]?limit|throttl/i,
    displayName_ko: 'API 호출량 제한 (rate limit) 없음',
    displayName_en: 'Missing Rate Limit',
    summary_ko: '인증 없이 호출 가능한 API에 호출 한도가 없어요. 봇/남용에 취약합니다. IP/계정 단위로 제한을 걸어주세요.',
    summary_en: 'A public endpoint has no rate limit, making it easy to abuse. Cap requests per IP or account.',
  },

  // -------------------------------------------------------------------------
  // DATA_MODEL (3)
  // -------------------------------------------------------------------------
  {
    id: 'data-n-plus-one',
    category: 'DATA_MODEL',
    pattern: /n[-_.]?\+?[-_.]?1|n[-_.]?plus[-_.]?one/i,
    displayName_ko: 'N+1 쿼리',
    displayName_en: 'N+1 Query Pattern',
    summary_ko: '목록 안에서 항목마다 추가 쿼리가 발생해 매우 느려질 수 있어요. eager loading이나 batch로 바꾸세요.',
    summary_en: 'A list triggers an extra query per item. Use eager loading or batching.',
  },
  {
    id: 'data-missing-index',
    category: 'DATA_MODEL',
    pattern: /missing[-_.]?index|index[-_.]?missing|no[-_.]?index/i,
    displayName_ko: 'DB 인덱스 누락',
    displayName_en: 'Missing Database Index',
    summary_ko: '자주 조회되는 컬럼에 인덱스가 없어 쿼리가 느려요. 적절한 인덱스를 추가하세요.',
    summary_en: 'A frequently-queried column lacks an index. Add one.',
  },
  {
    id: 'data-schema-drift',
    category: 'DATA_MODEL',
    pattern: /schema[-_.]?(drift|mismatch)|prisma[-_.]?drift/i,
    displayName_ko: 'DB 스키마 정합성 문제',
    displayName_en: 'Database Schema Drift',
    summary_ko: 'Prisma/마이그레이션 파일과 실제 DB 스키마가 다릅니다. `prisma migrate status`로 확인하세요.',
    summary_en: 'The Prisma schema and the live DB drifted. Run `prisma migrate status` to reconcile.',
  },

  // -------------------------------------------------------------------------
  // LAUNCH_READINESS (3)
  // -------------------------------------------------------------------------
  {
    id: 'launch-perf-lcp',
    category: 'LAUNCH_READINESS',
    pattern: /lcp|largest[-_.]?contentful[-_.]?paint|perf[-_.]?regress/i,
    displayName_ko: 'LCP (최대 콘텐츠 표시 시간) 성능 문제',
    displayName_en: 'LCP Performance Regression',
    summary_ko: '메인 콘텐츠가 늦게 그려져 사용자가 느림을 체감합니다. 이미지 최적화/코드 분할/서버 응답 시간을 점검하세요.',
    summary_en: 'The largest visible element loads slowly. Optimise images, code-split, or speed up the server response.',
    learnMoreUrl: 'https://web.dev/lcp/',
  },
  {
    id: 'launch-perf-cls',
    category: 'LAUNCH_READINESS',
    pattern: /\bcls\b|cumulative[-_.]?layout[-_.]?shift/i,
    displayName_ko: '레이아웃 시프트 (CLS) 발생',
    displayName_en: 'Cumulative Layout Shift',
    summary_ko: '페이지가 로드되면서 콘텐츠가 갑자기 움직여 사용성이 떨어집니다. 이미지/광고에 명시적인 크기를 지정하세요.',
    summary_en: 'Content jumps around as the page loads. Set explicit width/height on images and ad slots.',
    learnMoreUrl: 'https://web.dev/cls/',
  },
  {
    id: 'launch-monitoring-missing',
    category: 'LAUNCH_READINESS',
    pattern: /(sentry|datadog|new[-_.]?relic|monitoring)[-_.]?missing|no[-_.]?error[-_.]?tracking/i,
    displayName_ko: '에러/로그 모니터링 없음',
    displayName_en: 'No Error Tracking',
    summary_ko: 'Sentry 같은 에러 추적이 연결되어 있지 않습니다. 운영 중에 사용자가 만나는 오류를 알 방법이 없어요.',
    summary_en: 'No error-tracking SDK is wired up. You won\'t know about production errors users hit.',
  },

  // -------------------------------------------------------------------------
  // MAINTAINABILITY_DOCUMENTATION (4)
  // -------------------------------------------------------------------------
  {
    id: 'docs-readme-missing',
    category: 'MAINTAINABILITY_DOCUMENTATION',
    pattern: /readme[-_.]?missing|no[-_.]?readme/i,
    displayName_ko: 'README 없음',
    displayName_en: 'Missing README',
    summary_ko: 'README가 없습니다. 최소한 무엇을 하는 프로젝트이고 어떻게 실행하는지 적어두세요.',
    summary_en: 'No README. At minimum, describe what the project does and how to run it.',
  },
  {
    id: 'docs-license-missing',
    category: 'MAINTAINABILITY_DOCUMENTATION',
    pattern: /license[-_.]?(missing|none)|no[-_.]?license/i,
    displayName_ko: '라이선스 파일 없음',
    displayName_en: 'Missing License',
    summary_ko: '오픈소스로 공개한다면 라이선스가 없으면 사용자가 사용 권한을 가질 수 없어요. MIT/Apache-2.0 등을 추가하세요.',
    summary_en: 'Without a LICENSE file, others have no permission to use the code. Add MIT / Apache-2.0 / etc.',
  },
  {
    id: 'docs-todo-debt',
    category: 'MAINTAINABILITY_DOCUMENTATION',
    pattern: /\btodo\b|\bfixme\b|tech[-_.]?debt/i,
    displayName_ko: 'TODO/FIXME 남아 있음',
    displayName_en: 'Lingering TODO / FIXME',
    summary_ko: '코드에 TODO/FIXME 주석이 남아 있어요. 출시 전에 처리하거나 이슈로 옮기세요.',
    summary_en: 'TODO / FIXME comments remain in the code. Resolve them or move them to issues before launch.',
  },
  {
    id: 'docs-dep-outdated',
    category: 'MAINTAINABILITY_DOCUMENTATION',
    pattern: /outdated[-_.]?dep|deprecated[-_.]?(api|dep)|dependency[-_.]?outdated/i,
    displayName_ko: '오래된/사용 중단된 의존성',
    displayName_en: 'Outdated / Deprecated Dependency',
    summary_ko: '오래되거나 사용 중단된 라이브러리를 쓰고 있어요. 업그레이드하거나 대체하세요.',
    summary_en: 'You\'re using an outdated or deprecated library. Upgrade or replace it.',
  },

  // -------------------------------------------------------------------------
  // SECURITY_PRIVACY — generic catch-all (1, last so specific rules win)
  // -------------------------------------------------------------------------
  {
    id: 'security-generic-audit',
    category: 'SECURITY_PRIVACY',
    pattern: /security[-_.]?audit|\baudit\b/i,
    displayName_ko: '보안 점검 항목',
    displayName_en: 'Generic Security Audit Finding',
    summary_ko: '도구가 일반적인 보안 베스트프랙티스 위반을 감지했습니다. 이 라인을 검토해주세요.',
    summary_en: 'The scanner flagged a generic security best-practice violation. Review the highlighted line.',
  },

  // -------------------------------------------------------------------------
  // BUSINESS_READINESS — W2-BR sub-categories (T2.8 / UPG-06)
  // -------------------------------------------------------------------------
  {
    id: 'business-pricing-missing',
    category: 'BUSINESS_READINESS',
    pattern: /\bpricing\b|\bplans?\b|\bbilling\b/i,
    displayName_ko: '가격 페이지 부재',
    displayName_en: 'Missing Pricing Page',
    summary_ko: '결제 의향 방문자가 가격을 확인할 수 있는 페이지가 없습니다. /pricing 등을 노출하세요.',
    summary_en: 'No pricing page is exposed. Add /pricing, /plans, or /billing so buyers can see costs.',
  },
  {
    id: 'business-legal-missing',
    category: 'BUSINESS_READINESS',
    pattern: /privacy[-_.]?policy|terms[-_.]?of[-_.]?service|\btos\b/i,
    displayName_ko: '법적 문서 부재',
    displayName_en: 'Missing Legal Documents',
    summary_ko: '개인정보처리방침 또는 이용약관 문서가 없습니다. 결제/회원가입 운영 시 법적 리스크가 발생합니다.',
    summary_en: 'Privacy policy or terms of service are missing. Required for billing / signup operations.',
  },
  {
    id: 'business-onboarding-missing',
    category: 'BUSINESS_READINESS',
    pattern: /\bonboarding\b|\bsignup\b|\bregister\b/i,
    displayName_ko: '온보딩 플로우 부재',
    displayName_en: 'Missing Onboarding Flow',
    summary_ko: '신규 사용자가 첫 가치까지 도달하도록 안내하는 진입 흐름이 보이지 않습니다.',
    summary_en: 'No entry flow guides new users to the first value. Add a signup or onboarding step.',
  },
  {
    id: 'business-support-missing',
    category: 'BUSINESS_READINESS',
    pattern: /\bsupport\b|\bcontact\b|mailto/i,
    displayName_ko: '고객 지원 채널 부재',
    displayName_en: 'Missing Support Channel',
    summary_ko: '문의 페이지나 mailto 링크가 없어 사용자가 도움을 요청할 경로가 없습니다.',
    summary_en: 'No contact page or mailto link is exposed; users have no path to ask for help.',
  },
  {
    id: 'business-analytics-missing',
    category: 'BUSINESS_READINESS',
    pattern: /\banalytics\b|\bgtag\b|\bplausible\b|\bposthog\b/i,
    displayName_ko: '분석 도구 미설치',
    displayName_en: 'Missing Analytics Instrumentation',
    summary_ko: 'GA / Plausible / PostHog 등 사용자 분석 스크립트가 설치되어 있지 않아 핵심 지표를 측정할 수 없습니다.',
    summary_en: 'No analytics script (GA / Plausible / PostHog) is installed; core metrics cannot be measured.',
  },
];

export type RuleFamilyLocale = 'ko' | 'en';

export interface ResolvedRuleFamily {
  readonly id: string;
  readonly category: AuditCategory;
  readonly displayName: string;
  readonly summary: string;
  readonly learnMoreUrl?: string;
}

function pickLocale(locale: RuleFamilyLocale, entry: RuleFamilyExplanation): ResolvedRuleFamily {
  const base = {
    id: entry.id,
    category: entry.category,
    displayName: locale === 'ko' ? entry.displayName_ko : entry.displayName_en,
    summary: locale === 'ko' ? entry.summary_ko : entry.summary_en,
  } as const;
  return entry.learnMoreUrl === undefined
    ? base
    : { ...base, learnMoreUrl: entry.learnMoreUrl };
}

/**
 * Resolve the first matching rule family for a raw tool rule id.
 *
 * Returns `null` when no entry matches — callers decide the fallback wording
 * so this module stays surface-agnostic (worker vs web report can render
 * different fallbacks).
 */
export function explainRuleFamily(
  ruleId: string,
  locale: RuleFamilyLocale = 'ko',
): ResolvedRuleFamily | null {
  for (const entry of RULE_FAMILY_EXPLANATIONS) {
    if (entry.pattern.test(ruleId)) return pickLocale(locale, entry);
  }
  return null;
}

/** Locale-aware resolver mirroring the BCP47 contract of `getSeverityLanguage`. */
export function resolveRuleFamilyLocale(locale?: string): RuleFamilyLocale {
  if (locale === undefined) return 'ko';
  const primary = locale.split('-')[0]?.toLowerCase() ?? '';
  return primary === 'ko' ? 'ko' : 'en';
}
