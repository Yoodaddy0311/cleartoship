// T1.3 + T1.3-FU — W1-B (risky function discovery) checklist ID mapping.
//
// Audit checklist §11 "위험 함수 탐지" exposes findings as the W1-B group. The
// taxonomy has two layers:
//
//   1. Category baselines (W1-B1..W1-B6) — every RiskCategory maps to a stable
//      sub-ID so the report renderer can group findings under a single section
//      and downstream consumers (LLM follow-up, human review queue) can index
//      by checklist ID.
//
//   2. Fine-grained patterns (W1-B7..W1-Bn) — each NAME_RULES sub-pattern gets
//      its own ID so dashboards can distinguish "login" risk from "verifyOtp"
//      risk inside the same `auth` category. Worker emits the most specific
//      ID via `getW1BIdByName(category, name)` and falls back to the category
//      baseline when no fine pattern matches.
//
// Tag contract: step18-discover-risky-functions pushes `W1-B` (the group tag)
// plus the per-finding sub-ID onto Finding.tags. The renderer matches the
// `/^W1-B\d+$/` prefix to drive the §7 grouping table.

import type { RiskCategory } from './risky-functions.js';

export const W1B_GROUP_TAG = 'W1-B';

export interface W1BItem {
  id: string;
  category: RiskCategory;
  label: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Layer 1 — category baselines (stable ordering: W1-B${idx+1})
// ---------------------------------------------------------------------------
export const W1B_CHECKLIST: ReadonlyArray<W1BItem> = [
  {
    id: 'W1-B1',
    category: 'auth',
    label: '인증/세션 처리 함수',
    description: '로그인, 토큰 발급, 세션 유지 등 인증 경로에 위치한 함수.',
  },
  {
    id: 'W1-B2',
    category: 'payment',
    label: '결제/금액 처리 함수',
    description: '결제 호출, 환불, 금액 계산 등 비가역적 비용 처리 함수.',
  },
  {
    id: 'W1-B3',
    category: 'delete',
    label: '하드 삭제 함수',
    description: '레코드 영구 삭제, 파일 폐기, 외부 자원 해제.',
  },
  {
    id: 'W1-B4',
    category: 'pii',
    label: '개인정보 취급 함수',
    description: 'PII 접근, 마스킹/암호화 누락, 이메일/주민번호 등 노출 가능 코드.',
  },
  {
    id: 'W1-B5',
    category: 'auth-boundary',
    label: '인가 경계 함수',
    description: 'middleware/route guard 등 권한 경계에서 동작하는 함수.',
  },
  {
    id: 'W1-B6',
    category: 'data-mutation',
    label: '트랜잭션 미보장 데이터 변경',
    description: 'ORM bulk update/delete가 트랜잭션 없이 호출되는 경로.',
  },
];

// ---------------------------------------------------------------------------
// Layer 2 — fine-grained pattern grid (category × pattern → W1-B7..W1-Bn)
//
// Each row defines a regex that runs against the function NAME (case-insensitive
// unless explicitly anchored). Worker calls `getW1BIdByName(category, name)`;
// the first matching row wins, otherwise the category baseline is returned.
// Order inside a category therefore declares pattern priority — keep more
// specific patterns earlier.
//
// IDs are sequential across the entire grid (W1-B7..) so consumers can store a
// flat numeric mapping without category-aware decoding.
// ---------------------------------------------------------------------------
export interface W1BFinePattern {
  id: string;
  category: RiskCategory;
  /** Stable short identifier (e.g., 'login', 'jwt'). Useful for analytics. */
  patternKey: string;
  /** Regex tested against the function name (case-insensitive). */
  pattern: RegExp;
  label: string;
  description: string;
}

// Raw rows — IDs are filled in by `assignSequentialIds()` below to keep the
// numbering invariant in one place.
interface RawPattern {
  category: RiskCategory;
  patternKey: string;
  pattern: RegExp;
  label: string;
  description: string;
}

const RAW_FINE_PATTERNS: ReadonlyArray<RawPattern> = [
  // ===== auth (W1-B7..) =====
  { category: 'auth', patternKey: 'login', pattern: /^login/i, label: 'login 처리', description: '로그인 진입점 함수(login*). 패스워드/세션 검증 누락 위험.' },
  { category: 'auth', patternKey: 'signIn', pattern: /^signIn/i, label: 'signIn 처리', description: 'OAuth/Credentials signIn 함수. 외부 provider 응답 검증 필요.' },
  { category: 'auth', patternKey: 'signUp', pattern: /^(signUp|register)/i, label: '회원가입 처리', description: '신규 계정 생성 경로(signUp/register). 이메일 검증, 중복 처리, rate limit 필요.' },
  { category: 'auth', patternKey: 'resetPassword', pattern: /^resetPassword/i, label: '비밀번호 재설정', description: 'resetPassword* 함수. 토큰 만료/일회성 보장 필요.' },
  { category: 'auth', patternKey: 'verifyEmail', pattern: /^verifyEmail/i, label: '이메일 검증', description: 'verifyEmail* 함수. 이메일 소유권 확인 흐름.' },
  { category: 'auth', patternKey: 'verifyOtp', pattern: /^(verifyOtp|verifyTotp|verify2fa|verifyMfa)/i, label: 'OTP/2FA 검증', description: '이중 인증 검증 함수. 시도 제한/재사용 방지 필요.' },
  { category: 'auth', patternKey: 'createSession', pattern: /^(createSession|setSession)/i, label: '세션 생성/저장', description: 'createSession/setSession 함수. Secure/HttpOnly 쿠키 설정 필요.' },
  { category: 'auth', patternKey: 'issueToken', pattern: /^issueToken/i, label: '토큰 발급', description: 'issueToken* 함수. 만료/scope/audience 설정 검토.' },
  { category: 'auth', patternKey: 'verifyToken', pattern: /^(verifyToken|refreshToken|revokeToken)/i, label: '토큰 검증/갱신/폐기', description: 'verifyToken/refreshToken/revokeToken 함수. 서명/만료/블랙리스트 처리 필요.' },
  { category: 'auth', patternKey: 'hashPassword', pattern: /^(hashPassword|comparePassword)/i, label: '비밀번호 해시', description: 'hashPassword/comparePassword 함수. bcrypt/argon2 등 안전 알고리즘 필요.' },
  { category: 'auth', patternKey: 'oauth', pattern: /(oauth|openid)/i, label: 'OAuth/OIDC 흐름', description: 'OAuth/OpenID Connect 콜백/토큰 교환 함수.' },
  { category: 'auth', patternKey: 'sso', pattern: /(sso|saml)/i, label: 'SSO/SAML 흐름', description: 'SSO/SAML 어설션 검증 함수.' },
  { category: 'auth', patternKey: 'jwt', pattern: /jwt/i, label: 'JWT 처리', description: 'JWT 발급/검증 관련 함수. alg=none 거부 필요.' },
  { category: 'auth', patternKey: 'magicLink', pattern: /(magicLink|passwordless)/i, label: '매직 링크/패스워드리스', description: '매직 링크/패스워드리스 로그인 함수. 토큰 만료 및 일회성 필요.' },

  // ===== payment (auth 이후 사용 가능 번호 시작) =====
  { category: 'payment', patternKey: 'charge', pattern: /charge/i, label: '결제 호출', description: '결제 청구(charge*) 함수. 멱등성 키 필요.' },
  { category: 'payment', patternKey: 'refund', pattern: /refund/i, label: '환불 처리', description: '환불(refund*) 함수. 중복 환불 방지 필요.' },
  { category: 'payment', patternKey: 'createPayment', pattern: /createPayment/i, label: '결제 생성', description: 'createPayment* 함수. 금액/통화 서버 검증 필요.' },
  { category: 'payment', patternKey: 'capturePayment', pattern: /capturePayment/i, label: '결제 캡처', description: 'capturePayment* 함수. authorize 후 capture 흐름.' },
  { category: 'payment', patternKey: 'cancelPayment', pattern: /cancelPayment/i, label: '결제 취소', description: 'cancelPayment* 함수. 취소 시점 상태 검증 필요.' },
  { category: 'payment', patternKey: 'stripe', pattern: /stripe/i, label: 'Stripe 연동', description: 'Stripe SDK 호출 함수. webhook 서명 검증 필요.' },
  { category: 'payment', patternKey: 'toss', pattern: /toss/i, label: 'Toss 연동', description: 'Toss Payments SDK 호출 함수.' },
  { category: 'payment', patternKey: 'iamport', pattern: /iamport/i, label: 'Iamport 연동', description: 'Iamport SDK 호출 함수.' },
  { category: 'payment', patternKey: 'webhook', pattern: /webhook/i, label: '결제 웹훅', description: '결제 webhook 핸들러. 서명 검증, 재시도 멱등성 필요.' },
  { category: 'payment', patternKey: 'subscribe', pattern: /(subscribe|subscription)/i, label: '구독 처리', description: '구독 생성/변경 함수. 다음 결제일/단가 검증.' },
  { category: 'payment', patternKey: 'invoice', pattern: /invoice/i, label: '청구서 처리', description: 'invoice 생성/발행 함수.' },
  { category: 'payment', patternKey: 'payout', pattern: /(payout|transfer|disburse)/i, label: '지급/송금', description: 'payout/transfer/disburse 함수. 수취인 검증 필요.' },
  { category: 'payment', patternKey: 'dispute', pattern: /(dispute|chargeback)/i, label: '분쟁/차지백', description: 'dispute/chargeback 처리 함수. 증빙 자료 보존 필요.' },
  { category: 'payment', patternKey: 'billing', pattern: /billing/i, label: '청구/요금 계산', description: 'billing 관련 계산 함수. 통화/소수점 처리 검토.' },

  // ===== delete =====
  { category: 'delete', patternKey: 'delete', pattern: /^delete[A-Z]/, label: '삭제 함수', description: 'delete* 함수. 소프트/하드 삭제 전략 명시 필요.' },
  { category: 'delete', patternKey: 'remove', pattern: /^remove[A-Z]/, label: '제거 함수', description: 'remove* 함수. 참조 무결성 확인 필요.' },
  { category: 'delete', patternKey: 'drop', pattern: /^drop[A-Z]/, label: 'drop 함수', description: 'drop* 함수. 테이블/컬렉션 단위 폐기 위험.' },
  { category: 'delete', patternKey: 'purge', pattern: /^purge[A-Z]/, label: 'purge 함수', description: 'purge* 함수. 비가역 영구 삭제.' },
  { category: 'delete', patternKey: 'destroy', pattern: /^destroy[A-Z]/, label: 'destroy 함수', description: 'destroy* 함수. 리소스 해제/철거.' },
  { category: 'delete', patternKey: 'wipe', pattern: /^wipe[A-Z]/, label: 'wipe 함수', description: 'wipe* 함수. 일괄 초기화.' },
  { category: 'delete', patternKey: 'clear', pattern: /^clear[A-Z]/, label: 'clear 함수', description: 'clear* 함수. 상태/캐시 초기화.' },
  { category: 'delete', patternKey: 'truncate', pattern: /^truncate[A-Z]/, label: 'truncate 함수', description: 'truncate* 함수. 테이블 비우기.' },
  { category: 'delete', patternKey: 'erase', pattern: /^erase[A-Z]/, label: 'erase 함수', description: 'erase* 함수. 잔존물 없이 제거.' },
  { category: 'delete', patternKey: 'dispose', pattern: /^dispose[A-Z]/, label: 'dispose 함수', description: 'dispose* 함수. 자원 폐기.' },
  { category: 'delete', patternKey: 'expire', pattern: /^expire[A-Z]/, label: 'expire 함수', description: 'expire* 함수. 만료/폐기.' },
  { category: 'delete', patternKey: 'unlink', pattern: /^unlink[A-Z]/, label: 'unlink 함수', description: 'unlink* 함수. 연결 해제.' },
  { category: 'delete', patternKey: 'evict', pattern: /^evict[A-Z]/, label: 'evict 함수', description: 'evict* 함수. 캐시/세션 추방.' },
  { category: 'delete', patternKey: 'revoke', pattern: /^revoke[A-Z]/, label: 'revoke 함수', description: 'revoke* 함수. 권한/토큰 회수.' },

  // ===== pii =====
  { category: 'pii', patternKey: 'savePhone', pattern: /savePhone/i, label: '전화번호 저장', description: 'savePhone 함수. 통신매체 식별자 보관 위험.' },
  { category: 'pii', patternKey: 'saveEmail', pattern: /saveEmail/i, label: '이메일 저장', description: 'saveEmail 함수. 이메일 PII 저장.' },
  { category: 'pii', patternKey: 'saveAddress', pattern: /saveAddress/i, label: '주소 저장', description: 'saveAddress 함수. 주소 PII 저장.' },
  { category: 'pii', patternKey: 'updatePii', pattern: /updatePii/i, label: 'PII 업데이트', description: 'updatePii 함수. 개인정보 일괄 갱신.' },
  { category: 'pii', patternKey: 'exportUser', pattern: /exportUser/i, label: '사용자 내보내기', description: 'exportUser 함수. 대량 PII 유출 가능 경로.' },
  { category: 'pii', patternKey: 'encryptPii', pattern: /(encryptPii|encryptUser)/i, label: 'PII 암호화', description: 'PII 암호화 함수. 키 관리 검토 필요.' },
  { category: 'pii', patternKey: 'decryptPii', pattern: /(decryptPii|decryptUser)/i, label: 'PII 복호화', description: 'PII 복호화 함수. 접근 통제 필요.' },
  { category: 'pii', patternKey: 'maskPii', pattern: /(maskPii|maskUser|maskEmail|maskPhone)/i, label: 'PII 마스킹', description: 'PII 마스킹 함수. 마스킹 일관성 검토.' },
  { category: 'pii', patternKey: 'anonymize', pattern: /(anonymize|pseudonymize)/i, label: 'PII 익명화', description: '익명화/가명화 함수. 재식별 가능성 검토.' },
  { category: 'pii', patternKey: 'redact', pattern: /redact/i, label: 'PII 편집', description: 'redact 함수. 로그/응답 편집.' },
  { category: 'pii', patternKey: 'ssn', pattern: /(ssn|socialSecurity|residentNumber|residentRegistration)/i, label: '주민/SSN 처리', description: '주민등록번호/SSN 처리 함수. 법규 준수 필요.' },
  { category: 'pii', patternKey: 'taxId', pattern: /(taxId|businessId|corporateId)/i, label: '세금/사업자 식별자', description: '세금/사업자 식별자 처리 함수.' },
  { category: 'pii', patternKey: 'passport', pattern: /passport/i, label: '여권 정보', description: '여권 번호 처리 함수.' },
  { category: 'pii', patternKey: 'biometric', pattern: /(biometric|fingerprint|faceId)/i, label: '생체 정보', description: '생체 정보 처리 함수. 별도 동의/보관 정책 필요.' },

  // ===== auth-boundary =====
  { category: 'auth-boundary', patternKey: 'middleware', pattern: /^middleware$/i, label: 'middleware 진입점', description: 'Next.js/Express middleware export default.' },
  { category: 'auth-boundary', patternKey: 'useGuards', pattern: /useGuards/i, label: 'NestJS Guards', description: '@UseGuards 적용 함수.' },
  { category: 'auth-boundary', patternKey: 'requireAuth', pattern: /^(requireAuth|requireLogin|requireUser)/i, label: '인증 요구', description: 'requireAuth* 가드 함수.' },
  { category: 'auth-boundary', patternKey: 'checkPermission', pattern: /^(checkPermission|hasPermission|canAccess)/i, label: '권한 확인', description: '권한 체크 함수. RBAC/ABAC 정책 검토.' },
  { category: 'auth-boundary', patternKey: 'authorize', pattern: /^authorize/i, label: 'authorize 가드', description: 'authorize* 함수. 정책 시점/대상 검토.' },
  { category: 'auth-boundary', patternKey: 'ensureRole', pattern: /^(ensureRole|requireRole|hasRole)/i, label: 'Role 확인', description: 'Role 검증 함수. 역할 위계 검토.' },
  { category: 'auth-boundary', patternKey: 'gateway', pattern: /(gateway|interceptor)/i, label: '게이트웨이/인터셉터', description: '요청 가로채는 게이트웨이/인터셉터 함수.' },

  // ===== data-mutation =====
  { category: 'data-mutation', patternKey: 'prismaUpdate', pattern: /^(prismaUpdate|prismaUpsert)/i, label: 'Prisma 변경', description: 'Prisma 변경 래퍼 함수. 트랜잭션 필요.' },
  { category: 'data-mutation', patternKey: 'drizzleUpdate', pattern: /^drizzleUpdate/i, label: 'Drizzle 변경', description: 'Drizzle 변경 래퍼 함수. 트랜잭션 필요.' },
  { category: 'data-mutation', patternKey: 'bulkUpdate', pattern: /^bulkUpdate/i, label: '벌크 업데이트', description: 'bulkUpdate* 함수. 부분 실패 처리 필요.' },
  { category: 'data-mutation', patternKey: 'bulkDelete', pattern: /^bulkDelete/i, label: '벌크 삭제', description: 'bulkDelete* 함수. 영향 범위 확인 필요.' },
  { category: 'data-mutation', patternKey: 'updateMany', pattern: /^updateMany/i, label: 'updateMany', description: 'updateMany 호출 래퍼.' },
  { category: 'data-mutation', patternKey: 'deleteMany', pattern: /^deleteMany/i, label: 'deleteMany', description: 'deleteMany 호출 래퍼.' },
  { category: 'data-mutation', patternKey: 'createMany', pattern: /^createMany/i, label: 'createMany', description: 'createMany 호출 래퍼. 중복 검증 필요.' },
  { category: 'data-mutation', patternKey: 'upsert', pattern: /^upsert/i, label: 'upsert', description: 'upsert 함수. 동시성 충돌 검토.' },
  { category: 'data-mutation', patternKey: 'migrate', pattern: /^(migrate|backfill|reindex)/i, label: '마이그레이션/백필', description: 'migrate/backfill/reindex 함수. 롤백 전략 필요.' },
  { category: 'data-mutation', patternKey: 'rawSql', pattern: /^(rawSql|executeRaw|queryRaw)/i, label: 'Raw SQL 실행', description: 'rawSql/executeRaw 함수. SQL 인젝션/트랜잭션 검토.' },
  { category: 'data-mutation', patternKey: 'flush', pattern: /^(flush|commit)[A-Z]/, label: 'flush/commit', description: '대량 변경 커밋 함수. 부분 실패 시 보상 트랜잭션 필요.' },
  { category: 'data-mutation', patternKey: 'replace', pattern: /^(replace|overwrite)[A-Z]/, label: 'replace/overwrite', description: '문서/레코드 일괄 치환 함수.' },
  { category: 'auth', patternKey: 'apiKey', pattern: /(apiKey|accessKey|secretKey)/i, label: 'API 키 처리', description: 'API 키 발급/검증 함수. 키 로테이션 정책 필요.' },
  { category: 'auth', patternKey: 'rotateKey', pattern: /^(rotate|revoke)Key/i, label: '키 회전/폐기', description: '키 회전/폐기 함수.' },
];

function assignSequentialIds(raw: ReadonlyArray<RawPattern>): W1BFinePattern[] {
  const offset = W1B_CHECKLIST.length; // baselines occupy 1..6
  return raw.map((r, idx) => ({
    id: `W1-B${offset + idx + 1}`,
    category: r.category,
    patternKey: r.patternKey,
    pattern: r.pattern,
    label: r.label,
    description: r.description,
  }));
}

export const W1B_FINE_PATTERNS: ReadonlyArray<W1BFinePattern> = assignSequentialIds(
  RAW_FINE_PATTERNS,
);

/** Total addressable W1-B IDs (baseline + fine-grained). */
export const W1B_TOTAL_IDS: number = W1B_CHECKLIST.length + W1B_FINE_PATTERNS.length;

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------
const ID_BY_CATEGORY: Record<RiskCategory, string> = (() => {
  const acc: Partial<Record<RiskCategory, string>> = {};
  for (const item of W1B_CHECKLIST) acc[item.category] = item.id;
  return acc as Record<RiskCategory, string>;
})();

const META_BY_ID: Map<string, W1BItem> = (() => {
  const m = new Map<string, W1BItem>();
  for (const item of W1B_CHECKLIST) m.set(item.id, item);
  for (const p of W1B_FINE_PATTERNS) {
    m.set(p.id, {
      id: p.id,
      category: p.category,
      label: p.label,
      description: p.description,
    });
  }
  return m;
})();

const FINE_BY_CATEGORY: Map<RiskCategory, W1BFinePattern[]> = (() => {
  const m = new Map<RiskCategory, W1BFinePattern[]>();
  for (const p of W1B_FINE_PATTERNS) {
    const bucket = m.get(p.category) ?? [];
    bucket.push(p);
    m.set(p.category, bucket);
  }
  return m;
})();

/** Returns the category baseline ID (W1-B1..W1-B6). */
export function getW1BId(category: RiskCategory): string {
  return ID_BY_CATEGORY[category];
}

/**
 * Returns the most specific W1-B ID for a given (category, function name)
 * pair. Searches the fine-grained grid first; falls back to the category
 * baseline when no pattern matches. The fallback guarantees every classified
 * finding always carries exactly one W1-B sub-ID.
 */
export function getW1BIdByName(category: RiskCategory, name: string): string {
  const candidates = FINE_BY_CATEGORY.get(category);
  if (candidates) {
    for (const p of candidates) {
      if (p.pattern.test(name)) return p.id;
    }
  }
  return ID_BY_CATEGORY[category];
}

export function getW1BItem(id: string): W1BItem | undefined {
  return META_BY_ID.get(id);
}

export function getW1BFinePattern(id: string): W1BFinePattern | undefined {
  return W1B_FINE_PATTERNS.find((p) => p.id === id);
}

export const W1B_TAG_PREFIX_REGEX = /^W1-B\d+$/;

export function isW1BId(tag: string): boolean {
  return W1B_TAG_PREFIX_REGEX.test(tag);
}
