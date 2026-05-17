/**
 * 비개발자 친화 설명 생성기.
 *
 * Semgrep 등 정적 분석 도구가 내놓는 rule_id 는 사람이 읽기 어렵고, finding
 * 카드 200개의 nonDeveloperExplanation 이 한 줄로 똑같이 표시되면 비개발자는
 * 어떤 finding 이 더 위험한지 가늠할 수 없다. 이 모듈은 자주 등장하는 rule_id
 * 들을 한국어 풀이(무엇·왜·비유·고치는 법)로 매핑하고, 매핑이 없는 경우에는
 * 카테고리 와일드카드 또는 fallback summary 를 가볍게 다듬어 돌려준다.
 */

export interface FriendlyExplanation {
  /** 무엇이 문제인가 — 한 문장. */
  what: string;
  /** 왜 위험한가 — 사용자 입장에서의 결과. */
  why: string;
  /** (선택) 비개발자용 비유. */
  analogy?: string;
  /** 어떻게 고치나 — 1)…2)… 형태의 단계별. */
  fixGuide: string;
}

/**
 * rule_id 별 한국어 풀이.
 *
 * Key 는 두 가지 형태를 지원한다:
 *   1. 정확한 rule_id 전체: `'javascript.lang.security.audit.eval'`
 *   2. 카테고리 와일드카드: `'generic.secrets.security.*'`
 *
 * `explainFinding()` 은 먼저 정확 매칭을 시도하고, 실패하면 가장 긴 prefix
 * 와일드카드를 찾는다.
 */
export const FRIENDLY_EXPLAINERS: Record<string, FriendlyExplanation> = {
  // ── JavaScript / TypeScript ─────────────────────────────────────────────
  'javascript.lang.security.audit.eval': {
    what: '코드에 `eval()` 같은 위험한 함수가 사용됐어요.',
    why: '사용자가 입력한 글자를 그대로 코드로 실행하면, 공격자가 그 자리에 자기 코드를 끼워 넣을 수 있어요. 비밀번호 칸에 명령어를 적었더니 컴퓨터가 그걸 따라 실행하는 셈이에요.',
    analogy: '낯선 사람이 건네준 쪽지를 그대로 읽지 않고, 그 안의 명령을 실행해버리는 것과 같아요.',
    fixGuide:
      '1) `eval()` 대신 `JSON.parse()` 또는 검증된 라이브러리를 사용하세요. 2) 사용자가 입력한 값을 절대 코드로 실행하지 마세요. 3) 정말 동적 실행이 필요하다면, 입력값을 화이트리스트로 엄격히 제한하세요.',
  },
  'javascript.lang.security.audit.dangerously-set-inner-html': {
    what: 'React `dangerouslySetInnerHTML` 로 HTML 을 그대로 삽입하고 있어요.',
    why: '외부에서 들어온 HTML 을 검사 없이 화면에 끼우면, 그 안에 숨겨진 스크립트가 사용자의 로그인 쿠키를 훔쳐 갈 수 있어요. (XSS 공격)',
    analogy: '식당이 손님이 가져온 음식 재료를 검사 없이 그대로 손님 식탁에 내놓는 것과 같아요.',
    fixGuide:
      '1) 가능한 경우 일반 텍스트 렌더링(`{value}`)을 사용하세요. 2) HTML 이 꼭 필요하다면 `DOMPurify` 같은 sanitizer 로 한 번 거른 뒤 삽입하세요. 3) 삽입 데이터의 출처(서버/사용자)를 명확히 표시해 두세요.',
  },
  'javascript.lang.security.audit.detect-non-literal-fs-filename': {
    what: '파일 경로를 사용자 입력으로 만들고 있어요. (Path Traversal 위험)',
    why: '사용자가 `../../etc/passwd` 같은 값을 넣으면 의도하지 않은 시스템 파일이 열릴 수 있어요. 서버의 비밀 파일이 외부로 새어 나갈 수 있어요.',
    analogy: '도서관에서 책 번호 대신 "옆방 사물함 열어주세요"라고 적어도 직원이 그대로 열어주는 셈이에요.',
    fixGuide:
      '1) 사용자 입력은 파일명 일부로만 쓰고, 절대 경로 전체로 받지 마세요. 2) `path.basename()` 으로 디렉터리 부분을 잘라내세요. 3) 허용된 파일 목록(화이트리스트)에서만 고르도록 하세요.',
  },
  'javascript.express.security.audit.express-cookie-session-no-secure': {
    what: 'Express 세션 쿠키에 `secure` 옵션이 빠져 있어요.',
    why: 'HTTPS 가 아닌 일반(HTTP) 연결에서도 쿠키가 전송돼, 공용 와이파이 같은 환경에서 누구나 가로채 로그인 세션을 훔칠 수 있어요.',
    analogy: '집 열쇠를 봉투에 넣지 않고 우편으로 보내는 것과 같아요. 배달 중에 누구나 꺼내 볼 수 있어요.',
    fixGuide:
      '1) 세션 미들웨어 옵션에 `cookie: { secure: true }` 를 추가하세요. 2) `httpOnly: true`, `sameSite: "lax"` 도 함께 켜세요. 3) 프로덕션 HTTPS 환경에서만 동작하도록 환경변수로 분기하세요.',
  },
  'javascript.lang.audit.unencrypted-cookie-secret': {
    what: '쿠키 서명 키(secret) 가 코드에 평문으로 박혀 있어요.',
    why: '저장소를 본 사람이라면 누구든 그 키를 알 수 있고, 그 키로 위조된 로그인 쿠키를 만들 수 있어요. 결국 남의 계정으로 로그인할 수 있다는 뜻이에요.',
    analogy: '아파트 마스터키를 현관 우체통에 붙여 두는 것과 같아요.',
    fixGuide:
      '1) secret 값을 코드에서 빼내 환경변수(`process.env.SESSION_SECRET`) 로 옮기세요. 2) 32바이트 이상의 무작위 문자열을 사용하세요. 3) 이미 노출된 키는 즉시 회전(rotate)하세요.',
  },
  'javascript.lang.security.audit.detect-child-process': {
    what: '`child_process.exec()` 같은 함수가 사용자 입력과 함께 호출돼요.',
    why: '사용자가 `; rm -rf /` 같은 명령을 끼워 넣으면 서버에서 그대로 실행돼요. 데이터 유출, 파일 삭제, 서버 탈취까지 가능해요.',
    analogy: '음식 주문서에 "주문 다 들어주시고 금고 비밀번호도 알려주세요"라고 적어도 그대로 처리하는 직원과 같아요.',
    fixGuide:
      '1) 가능하면 `execFile()` 또는 `spawn()` 으로 인자 배열을 명시적으로 넘기세요. 2) 셸 문자열 조립을 피하세요. 3) 입력값은 정규식 화이트리스트로 검증하세요.',
  },
  'javascript.lang.security.audit.detect-non-literal-regexp': {
    what: '사용자 입력으로 정규식을 만들고 있어요. (ReDoS 위험)',
    why: '공격자가 일부러 복잡한 패턴을 보내면 서버가 정규식 처리에 몇 초~몇 분을 소모해, 다른 사용자가 응답을 받지 못하는 상태가 될 수 있어요.',
    fixGuide:
      '1) 정규식은 상수로 미리 정의하세요. 2) 동적으로 만들어야 한다면 입력의 길이와 문자를 엄격히 제한하세요. 3) `safe-regex` 같은 도구로 위험한 패턴을 사전 검출하세요.',
  },
  'javascript.lang.security.audit.detect-pseudo-random-bytes': {
    what: '`Math.random()` 같은 비암호 난수로 보안용 토큰을 만들고 있어요.',
    why: '`Math.random()` 은 결과를 예측할 수 있어서, 공격자가 다음에 나올 토큰을 추측해 다른 사람의 비밀번호 재설정 링크를 가로챌 수 있어요.',
    analogy: '주사위 대신, 항상 정해진 순서로 숫자가 나오는 시계 초침으로 복권 번호를 뽑는 셈이에요.',
    fixGuide:
      '1) `crypto.randomBytes()` 또는 `crypto.randomUUID()` 를 사용하세요. 2) 토큰 길이는 최소 16바이트(128비트) 이상으로 잡으세요.',
  },

  // ── React / TypeScript ─────────────────────────────────────────────────
  'typescript.react.security.audit.react-href-var': {
    what: '`<a href={…}>` 가 사용자 값으로 채워지고 있어요.',
    why: '`javascript:` 로 시작하는 값이 들어오면 링크 클릭만으로 임의 코드가 실행될 수 있어요. (XSS)',
    fixGuide:
      '1) URL 은 `new URL(value)` 로 한 번 파싱하고 `protocol` 이 `http:` 또는 `https:` 인지 확인하세요. 2) 외부 링크라면 `rel="noopener noreferrer"` 를 함께 다세요.',
  },
  'typescript.react.security.audit.react-no-refs': {
    what: 'React `ref` 로 DOM 을 직접 조작하면서 사용자 입력을 다루고 있어요.',
    why: 'DOM 직접 조작은 React 의 안전한 렌더링 경로를 우회해, XSS 같은 위험을 다시 만들 수 있어요.',
    fixGuide:
      '1) 가능하면 state + 선언적 렌더링으로 바꾸세요. 2) ref 사용이 꼭 필요하다면 삽입하는 값이 신뢰된 출처인지 확인하세요.',
  },

  // ── Python ─────────────────────────────────────────────────────────────
  'python.flask.security.audit.directly-returned-format-string': {
    what: 'Flask 응답을 f-string 으로 만들어 그대로 반환하고 있어요.',
    why: '사용자 입력이 HTML 안에 그대로 들어가면 XSS 가 가능해요. 누군가 댓글에 스크립트를 적으면 다른 사용자가 그 페이지를 열 때 실행돼요.',
    fixGuide:
      '1) `render_template()` 과 Jinja2 자동 이스케이프를 사용하세요. 2) 또는 `flask.escape()` 로 변수만 감싸세요.',
  },
  'python.django.security.audit.raw-query': {
    what: 'Django `raw()` 쿼리를 사용자 입력과 문자열 합성으로 만들고 있어요. (SQL Injection)',
    why: '공격자가 SQL 문법을 끼워 넣어 DB 전체를 덤프하거나 사용자 계정을 모두 지울 수 있어요.',
    analogy: '주문서에 "음료 + 옆자리 손님 카드번호 가져다 주세요"라고 적어도 그대로 처리하는 식당과 같아요.',
    fixGuide:
      '1) ORM(`Model.objects.filter(...)`) 을 사용하세요. 2) raw SQL 이 꼭 필요하다면 파라미터 바인딩(`raw("SELECT … WHERE id = %s", [user_id])`) 으로 분리하세요.',
  },
  'python.lang.security.audit.dangerous-subprocess-use': {
    what: 'Python `subprocess` 가 `shell=True` 와 함께 사용자 입력으로 호출돼요.',
    why: '사용자가 `; rm -rf /` 같은 명령을 끼워 넣으면 서버에서 그대로 실행돼요.',
    fixGuide:
      '1) `shell=False` (기본값) 로 두고 인자를 리스트로 넘기세요. 2) 셸 메타문자가 필요한 경우라도 입력값을 화이트리스트 검증하세요.',
  },

  // ── 비밀값 / Secrets ────────────────────────────────────────────────────
  'generic.secrets.security.detected-aws-access-key-id': {
    what: 'AWS 액세스 키가 코드에 그대로 들어 있어요.',
    why: '저장소를 본 사람이라면 누구든 그 키로 AWS 자원을 마음대로 쓸 수 있어요. 청구서가 폭발하거나 DB 가 삭제될 수 있어요.',
    analogy: '신용카드 번호를 사무실 벽에 붙여 둔 것과 같아요. 청소부까지 적어 갈 수 있어요.',
    fixGuide:
      '1) 즉시 AWS 콘솔에서 키를 비활성화/회전하세요. 2) 키는 환경변수 또는 비밀 관리자(Secrets Manager) 로 옮기세요. 3) Git 히스토리에 남아 있다면 `git filter-repo` 로 지우세요.',
  },
  'generic.secrets.security.detected-private-key': {
    what: '개인키(private key) 가 저장소에 포함돼 있어요.',
    why: '서버 인증, SSH 접속, JWT 서명 등에 쓰이는 비밀이 노출되면 누구든 우리 서비스인 척 행세할 수 있어요.',
    fixGuide:
      '1) 즉시 키를 회전(재발급)하세요. 2) 새 키는 비밀 관리자(Secrets Manager, Vault 등) 에 넣고 코드에서는 환경변수로만 읽으세요. 3) `.gitignore` 에 `*.pem`, `*.key` 를 추가하세요.',
  },
  'generic.secrets.security.detected-generic-api-key': {
    what: 'API 키로 보이는 문자열이 코드에 노출돼 있어요.',
    why: '제3자 서비스 API 키가 새면 사용량 한도를 도용당하거나 비용이 부과돼요.',
    fixGuide:
      '1) 키를 회전하세요. 2) `.env` 파일과 환경변수로 옮기세요. 3) `.env` 가 git 에 커밋되지 않게 `.gitignore` 를 확인하세요.',
  },

  // ── 와일드카드 (정확 매칭이 없을 때의 카테고리 fallback) ────────────────
  'javascript.lang.security.audit.*': {
    what: 'JavaScript 코드에서 보안 관련 위험 패턴이 발견됐어요.',
    why: '사용자 입력을 거르지 않거나, 위험한 함수를 안전하지 않은 방식으로 사용하면 데이터 유출이나 계정 탈취로 이어질 수 있어요.',
    fixGuide:
      '1) 사용자 입력은 항상 검증/이스케이프하세요. 2) 위험한 API 는 안전한 대안으로 바꾸세요. 3) 라이브러리/프레임워크의 보안 가이드를 따르세요.',
  },
  'typescript.react.security.audit.*': {
    what: 'React 컴포넌트에서 보안 위험 패턴이 발견됐어요.',
    why: '컴포넌트가 외부 데이터를 그대로 화면에 그리거나 DOM 을 직접 조작하면 XSS 같은 공격 통로가 생겨요.',
    fixGuide:
      '1) 가능하면 선언적 렌더링과 자동 이스케이프를 활용하세요. 2) HTML/URL 삽입이 꼭 필요하면 sanitize 후에만 사용하세요.',
  },
  'python.flask.security.audit.*': {
    what: 'Flask 애플리케이션에서 보안 위험 패턴이 발견됐어요.',
    why: '템플릿 자동 이스케이프 우회나 안전하지 않은 응답 생성은 XSS, 정보 유출로 이어질 수 있어요.',
    fixGuide:
      '1) `render_template()` 의 자동 이스케이프를 우회하지 마세요. 2) 입력 검증과 출력 인코딩을 함께 적용하세요.',
  },
  'python.django.security.audit.*': {
    what: 'Django 애플리케이션에서 보안 위험 패턴이 발견됐어요.',
    why: 'ORM 우회나 안전하지 않은 템플릿 처리는 SQL Injection, XSS 같은 공격 통로를 만들 수 있어요.',
    fixGuide:
      '1) ORM 과 `mark_safe` 정책을 따르세요. 2) raw SQL 은 파라미터 바인딩으로 작성하세요.',
  },
  'generic.secrets.security.*': {
    what: '비밀값(키·토큰·패스워드) 으로 보이는 문자열이 코드에 포함돼 있어요.',
    why: '코드 저장소에 비밀이 들어가면 누구든 그것을 발견해 서비스/계정을 도용할 수 있어요.',
    fixGuide:
      '1) 해당 비밀을 즉시 회전(재발급)하세요. 2) 환경변수 또는 비밀 관리자로 옮기세요. 3) Git 히스토리에 남았다면 히스토리 재작성으로 제거하세요.',
  },
};

/**
 * `summary` 가 영어로 들어왔을 때 비개발자가 읽기 좋게 가볍게 다듬는다.
 * - 첫 글자 대문자화
 * - `should` → `권장`, `must` → `필수`, `do not` → `금지` 같은 단어 치환
 *
 * "가벼운 변환" 이 목적이라 번역은 하지 않는다. 매핑이 없을 때의 마지막
 * 안전망일 뿐, 본격적인 한국어 풀이가 필요한 룰은 `FRIENDLY_EXPLAINERS` 에
 * 추가하는 것이 옳다.
 */
function lightlyNormalizeSummary(summary: string): string {
  let s = summary.trim();
  if (s.length === 0) return s;
  s = s.charAt(0).toUpperCase() + s.slice(1);
  s = s.replace(/\bshould\b/gi, '권장');
  s = s.replace(/\bmust\b/gi, '필수');
  s = s.replace(/\bdo not\b/gi, '금지');
  s = s.replace(/\bavoid\b/gi, '피해야 함');
  return s;
}

function findWildcardMatch(rule: string): FriendlyExplanation | undefined {
  let best: { key: string; value: FriendlyExplanation } | undefined;
  for (const [key, value] of Object.entries(FRIENDLY_EXPLAINERS)) {
    if (!key.endsWith('.*')) continue;
    const prefix = key.slice(0, -1); // drop trailing '*', keep trailing '.'
    if (!rule.startsWith(prefix)) continue;
    if (!best || key.length > best.key.length) best = { key, value };
  }
  return best?.value;
}

/**
 * 주어진 semgrep rule_id 에 대한 한국어 풀이를 돌려준다.
 *
 * 매칭 순서:
 *   1. `FRIENDLY_EXPLAINERS` 정확 키
 *   2. 가장 긴 prefix 와일드카드 (`...audit.*` 등)
 *   3. fallback 객체가 주어졌다면 그 title/summary 를 가볍게 정규화
 *   4. 그 외에는 일반적인 안내 문구
 */
export function explainFinding(
  rule: string,
  fallback?: { title?: string; summary?: string }
): FriendlyExplanation {
  const exact = FRIENDLY_EXPLAINERS[rule];
  if (exact) return exact;

  const wild = findWildcardMatch(rule);
  if (wild) return wild;

  const normalizedTitle = fallback?.title ? lightlyNormalizeSummary(fallback.title) : '';
  const normalizedSummary = fallback?.summary ? lightlyNormalizeSummary(fallback.summary) : '';
  const whatBase =
    normalizedTitle || normalizedSummary || '코드 검사 도구가 점검할 가치가 있는 패턴을 찾았어요.';
  const whyBase =
    normalizedSummary && normalizedSummary !== whatBase
      ? normalizedSummary
      : '룰의 의도에 따라 보안·성능·품질 측면의 영향이 달라질 수 있어요. 해당 라인을 한 번 확인해 보세요.';

  return {
    what: whatBase,
    why: whyBase,
    fixGuide:
      '1) 해당 라인의 의도를 다시 확인하세요. 2) 룰 문서(`' +
      rule +
      '`)에서 권장 패턴을 찾아 적용하세요. 3) 의도된 코드라면 코멘트로 사유를 남겨 두세요.',
  };
}

/**
 * Finding 의 title 이 `"Semgrep: <rule_id>"` 형태라면 rule_id 를 뽑아 돌려준다.
 * 그렇지 않으면 `null`. (06-static-analysis.ts:39 의 emit 포맷에 맞춤.)
 */
export function extractSemgrepRuleId(title: string): string | null {
  const m = /^Semgrep:\s*(.+)$/i.exec(title.trim());
  return m && m[1] ? m[1].trim() : null;
}
