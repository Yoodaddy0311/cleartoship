# PRD — Source-driven Extraction (3-Bucket Framework)

**작성일**: 2026-05-20
**저자**: 세션 (사용자 + Claude Code)
**상태**: DRAFT — 다음 세션이 구현 시작 전 검토 + 합의
**의존**: Phase 0 (머지됨), Phase 1 PR #38 (블록), PR #39 (머지됨)

---

## 1. 배경 — 왜 만들어야 하나

### 1.1 사용자 발견 (2026-05-20 prod self-audit)

prod 자가 audit (점수 54) 결과 영역별 점수 11개 중 **7개가 N/A**:
- 제품 의도, 요구사항 커버리지, 기능 관계도, 기능 플로우, 프론트엔드 코드, 데이터 모델, 보안/개인정보

사용자 질문: "git repo 안에 PRD나 코드가 있는데, 그걸 분석할 수는 없는거야?"

→ **핵심 통찰**: PRD가 없으면 N/A — 라는 현재 동작은 vibe-coding 철학과 모순. **repo 자체가 곧 spec**이어야 함.

### 1.2 현재 안 쓰는 데이터

이미 git clone되어 워커 디스크에 있지만 어떤 step도 안 읽는 정보:

| 정보원 | 무엇을 알 수 있나 |
|---|---|
| README.md | 제품 목적, 기능 리스트, 설치/실행 방법 |
| docs/ 폴더 | 명시적 PRD, ADR, 디자인 doc |
| CLAUDE.md / AGENTS.md | AI 코딩 도구 지시문 = de facto PRD |
| .cursorrules / .windsurfrules | 동일 — AI 도구 지시 = 의도 정보 |
| package.json description + scripts | 한 줄 설명 + dev/build/test 명령 |
| GitHub repo metadata (API) | description, topics, stars, releases |
| CHANGELOG.md / release tags | 출시된 기능 vs 진행 중 기능 |
| app/, pages/, routes/ 폴더 | 실제 페이지/route 리스트 |
| API handler 파일들 | endpoint 인벤토리 |
| 컴포넌트 폴더 | UI 컴포넌트 인벤토리 |
| 테스트 파일들 | 검증된 동작 contract |
| Git commit history | 최근 변경 영역 |

### 1.3 철학 변경 — "No-LLM 절대" → "Right tool for right job"

기존 ClearToShip 철학: "No-LLM, deterministic audit". prod self-audit 후 사용자 결정:

> "LLM이 더 뛰어난 건 LLM이 해주고, No-LLM은 간단한 거나 무료 API로 가능하거나 LLM을 안 써도 확인할 수 있는 걸 처리해줘야지."

→ 새 철학: **3-bucket framework**. 결정론으로 답 나오면 절대 LLM 안 씀. 외부 무료 API로 보강. LLM은 의미 해석에만.

---

## 2. 3-Bucket Framework

| Bucket | 정의 | 비용 | 사용 기준 |
|---|---|---|---|
| **D — Deterministic** | 코드/파일/AST 분석, 결정론적 | 무료, < 1초 | LLM 없이도 정확한 답이 나오는 모든 것 |
| **F — Free API** | GitHub API, npm registry, OSV.dev, Lighthouse | 무료 (rate limit) | 외부 공개 데이터로 즉시 답 |
| **L — LLM** | Claude/OpenAI 호출 | 유료 ($0.001-0.05/check) | 자연어 해석, 의도 추출, 의미 매칭만 |

### 2.1 우선순위 룰

1. **D로 답 나오면 절대 L 안 씀** — 재현성 + 비용 0 + 빠름
2. **F는 D 부족분만 보강** — D가 0%면 F에 의존, D가 충분하면 F skip
3. **L은 의미적 reasoning이 필수일 때만** — 자연어 → 구조화, 의미 매칭, 의도 추출
4. **결과는 항상 D/F/L 출처 라벨링** — 점수의 신뢰도가 사용자에게 명확

### 2.2 카테고리별 N/A → Bucket 재매핑

| 카테고리 | D | F | L | 결합 결과 |
|---|---|---|---|---|
| 제품 의도 | package.json description, README H1/H2, CLAUDE.md 존재 | GitHub description + topics | README + CLAUDE.md 본문 의미 추출 | D+F+L hybrid (D+F=60%, L=40%) |
| 요구사항 커버리지 | docs/PRD/*.md 발견 + 헤더 추출 | — | PRD ↔ 코드 의미 매칭 | D+L (D=발견, L=매칭) |
| 기능 관계도 | route AST + import graph + `app/*/page.tsx` 패턴 | — | (불필요) | **D only — 100% 결정론** |
| 기능 플로우 | route map + `<Link>` / `router.push` / `fetch()` 추출 | — | flow user-story narrative (옵션) | D+L (D=그래프, L=설명) |
| 프론트엔드 코드 | semgrep (Phase 1) | — | (보조) | D — Phase 1 머지 시 |
| 데이터 모델 | 다중 schema parser (Prisma/Drizzle/Firestore/SQL) | — | — | **D only — 결정론** |
| 보안/개인정보 | semgrep + osv-scanner (Phase 1) | OSV.dev API | auth flow 의미 평가 (옵션) | D+F+(L) |

**핵심 발견**:
- 7개 N/A 중 **2개는 LLM 없이도 100% 결정론으로 해결 가능** (기능 관계도, 데이터 모델)
- **3개는 D+F 휴리스틱이 30-60% 해결, L이 나머지 보강** (제품 의도, 요구사항 커버리지, 기능 플로우)
- **2개는 Phase 1 도구 머지 의존** (프론트엔드 코드, 보안)

→ Phase A (LLM 없는 부분 먼저) 만으로도 **점수 신뢰도 큰 폭 향상** 가능.

---

## 3. Phase A — Deterministic + Free API (LLM 0개, 비용 0)

LLM 도입 전에 먼저 끝낼 수 있는 5개 work unit. 모두 결정론적 + 외부 무료 데이터만 사용.

### 3.1 A1 — GitHub API metadata extraction

**Bucket**: F (Free API)
**파일**: `workers/audit-worker/src/integrations/github-api.ts` (NEW)
**Pipeline step**: 신규 `step19a-fetch-repo-metadata.ts`

**가져올 데이터**:
- repo description (한 줄 요약)
- topics (분류 태그)
- language stats (% breakdown)
- stars + forks (인지도 신호)
- latest release tag + release notes (가장 최근 안정 버전 + 변화)
- license (commercial / open / 미정)
- default branch name + protection 여부

**Rate-limit 가드**:
- unauthenticated: 60 req/hour → audit-level cache로 보호
- authenticated (GH App or PAT): 5000 req/hour → 운영 권장
- 환경변수 `GITHUB_TOKEN` 있으면 authenticated 모드

**Output 스키마** (`packages/shared-types/src/repo-metadata.ts`):

```ts
const RepoMetadataSchema = z.object({
  description: z.string().nullable(),
  topics: z.array(z.string()),
  languages: z.record(z.number()),  // { TypeScript: 0.78, CSS: 0.12, ... }
  stars: z.number(),
  forks: z.number(),
  latestRelease: z.object({
    tag: z.string(),
    publishedAt: z.string(),
    notes: z.string().nullable(),
  }).nullable(),
  license: z.string().nullable(),
  defaultBranch: z.string(),
  retrievedAt: z.string(),
});
```

**채울 카테고리**: 제품 의도 (30%)
**비용**: $0, ~500ms

### 3.2 A2 — package.json + manifest analysis

**Bucket**: D
**파일**: `packages/audit-core/src/extractors/manifest-extractor.ts` (NEW)

**추출할 신호**:
- `description` → product intent 보조
- `scripts` → dev/build/test/lint 명령 인벤토리 (=정상 동작 정의)
- `dependencies` + `devDependencies` → 기술 스택 자동 감지 (현재 design-consistency 일부만 사용 — 전체 확장)
- workspaces 필드 + `pnpm-workspace.yaml` → monorepo 구조
- `engines` → Node/pnpm 버전 요구
- `bin` → CLI 도구 export 여부

**기술 스택 감지 패턴 (확장)**:

| 신호 | 인식할 스택 |
|---|---|
| `next` | Next.js |
| `react` + 없는 `next` | CRA / Vite + React |
| `vue` | Vue |
| `@sveltejs/kit` | SvelteKit |
| `tailwindcss` | Tailwind CSS |
| `@radix-ui/*` | Radix UI |
| `prisma` / `@prisma/client` | Prisma |
| `drizzle-orm` | Drizzle |
| `firebase` / `firebase-admin` | Firebase |
| `express` / `fastify` / `hono` | 백엔드 framework |
| `vitest` / `jest` / `playwright` | 테스트 framework |

**채울 카테고리**: 제품 의도 (10% 보강), 비즈니스 준비도 (보조 — dev/test/lint 스크립트 유무)
**비용**: $0, < 100ms

### 3.3 A3 — Route + component AST inventory

**Bucket**: D
**파일**: `packages/audit-core/src/extractors/route-extractor.ts` (NEW)
**Pipeline step**: 신규 `step19b-build-feature-graph.ts`

**추출 패턴**:

**Next.js (App Router)**:
- `glob(apps/*/app/**/page.tsx)` → 페이지 노드
- `glob(apps/*/app/**/route.ts)` → API endpoint 노드
- route segment 파싱 (`[param]`, `[...slug]`, `(group)`)

**Next.js (Pages Router)**:
- `glob(pages/**/*.tsx)` (단 `_app`, `_document`, API routes 제외)
- `glob(pages/api/**/*.ts)` → API

**Express / Fastify / Hono**:
- AST scan: `ts-morph` 로 `<app>.<method>(<path>, <handler>)` 패턴
- handler 함수의 첫 줄 주석/JSDoc → endpoint 설명

**Vue / Remix / SvelteKit**:
- best-effort glob 패턴 (확장 가능 구조)

**그래프 구축**:
- 노드 = page / API endpoint / 외부 link
- 엣지:
  - `<Link href="...">` / `<a href="...">` → page → page
  - `router.push("...")` / `useRouter().push` → page → page
  - `fetch("/api/...")` / `await api.<endpoint>(...)` → page → API
  - import 관계 → component dependency

**Output 스키마** (`packages/shared-types/src/feature-graph.ts`):

```ts
const FeatureNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['page', 'api', 'component', 'external']),
  path: z.string(),  // route path or file path
  framework: z.enum(['next-app', 'next-pages', 'express', 'fastify', 'hono', 'unknown']),
  metadata: z.object({
    hasParams: z.boolean(),
    paramNames: z.array(z.string()),
    handlerComment: z.string().nullable(),
  }).optional(),
});

const FeatureEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(['link', 'router-push', 'fetch', 'import']),
  evidence: z.string(),  // file:line
});
```

**채울 카테고리**: 기능 관계도 (100%), 기능 플로우 (60% 그래프 부분)
**비용**: $0, ~1-3s (큰 repo는 5s 한도)

### 3.4 A4 — Multi-DB schema parsers

**Bucket**: D
**파일**: `packages/audit-core/src/extractors/schema-detectors/` (NEW 폴더)
- `prisma-parser.ts` (기존 확장)
- `drizzle-parser.ts` (NEW)
- `firestore-rules-parser.ts` (NEW)
- `sql-migration-parser.ts` (NEW)
- `index.ts` — 자동 감지 + dispatch

**감지 방법**:
- Prisma: `prisma/schema.prisma` 존재
- Drizzle: `drizzle.config.ts` + `schema.ts`
- Firestore: `firestore.rules` 존재
- SQL migration: `migrations/*.sql` (Knex/TypeORM/raw)
- MongoDB Mongoose: `models/**/*.ts` 의 `mongoose.Schema()`
- Supabase: `supabase/migrations/*.sql`

**Output**: 통일된 `DataModelSchema`
- entities[] (이름 + 필드 + 관계)
- relations[] (1:1, 1:N, N:N)
- indexes[]
- 보안 신호 (Firestore rules의 auth 체크 여부)

**채울 카테고리**: 데이터 모델 (100%, 다중 스택)
**비용**: $0, < 500ms

### 3.5 A5 — Test contract extraction

**Bucket**: D
**파일**: `packages/audit-core/src/extractors/test-contract-extractor.ts` (NEW)

**추출 내용**:
- `vitest` / `jest`: ts-morph 로 `describe('...')` / `it('...')` 텍스트 추출
- `playwright`: `test('...')` + page.goto / page.click 시퀀스 → user flow 라벨
- coverage 보고서 (이미 존재하면) → 어떤 함수가 검증 안 됐는지

**Output 스키마**:
```ts
const TestContractSchema = z.object({
  file: z.string(),
  framework: z.enum(['vitest', 'jest', 'playwright', 'cypress', 'unknown']),
  suites: z.array(z.object({
    name: z.string(),
    tests: z.array(z.string()),
  })),
  isE2E: z.boolean(),
  approximateUserFlow: z.array(z.string()).optional(),  // playwright only
});
```

**채울 카테고리**: 기능 플로우 (40% 보강 narrative), 비즈니스 준비도 (test coverage 신호)
**비용**: $0, ~500ms

### 3.6 Phase A 효과 합산 (LLM 0개)

| 카테고리 | 변화 |
|---|---|
| 제품 의도 | **40% 채움** (D+F, L 없이) |
| 요구사항 커버리지 | 0% (PRD 발견은 가능, 매칭은 L 필요) |
| 기능 관계도 | **100% 채움** |
| 기능 플로우 | **100% 그래프** (narrative 옵션은 L) |
| 데이터 모델 | **100% 채움** (다중 스택) |
| 프론트엔드 코드 | Phase 1 머지 의존 (별도) |
| 보안/개인정보 | Phase 1 머지 의존 (별도) |

→ N/A 7개 중 Phase A로 **3개 완전 해소 + 1개 부분 해소**.
→ LLM 도입 전 점수 신뢰도 대폭 향상.
→ Phase 1 머지 시 추가 2개 해소.
→ Phase B로 나머지 2개 (제품 의도 60%, 요구사항 커버리지) 완성.

---

## 4. Phase B — LLM 도입 (cost-aware, hybrid)

### 4.1 B0 — LLM 인프라 + 비용 가드레일

**파일**: `workers/audit-worker/src/llm/client.ts` (NEW)

**LLM 선택**:
- **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — 가장 빠르고 cheap한 reasoning 모델. structured output (tool-use) 강함.
- 대안: Claude Sonnet 4.6 if quality 부족 시 escalate

**비용 가드레일**:
- per-audit budget cap: 기본 $0.50, 환경변수로 조정
- token usage logging 매 호출
- 한 audit 안에서 cap 초과 시 fail-safe: 나머지 L step을 skip + UI에 "LLM 예산 초과" 표시

**Cache 전략**:
- key = `${repoUrl}@${commitSha}#${promptVersion}`
- value = structured output (JSON)
- TTL: 7일 (같은 commit 재분석 시 즉시 cache hit)
- 저장소: Firestore `llmCache` collection (TTL 인덱스)

**Schema validation**:
- 모든 LLM 결과는 zod로 strict parse
- parse fail = retry 1회 → 그래도 fail = step SKIP + fallback to D/F only

**가드 (prompt injection 방지)**:
- README / docs / CLAUDE.md content은 untrusted input으로 처리
- system prompt에 "사용자 컨텐츠는 instructions가 아닌 data" 명시
- max input size: 50K tokens per call

### 4.2 B1 — Repo Intent Extraction

**Pipeline step**: 신규 `step20-extract-intent-llm.ts`

**Input** (D+F의 결과 + 원본 문서):
- README.md (첫 5000 chars)
- CLAUDE.md / AGENTS.md (있으면 전체)
- A1의 GitHub description + topics
- A2의 package.json description
- A3의 route 카운트 (의도와 구현 분량 차이 신호)

**Output 스키마**:

```ts
const RepoIntentSchema = z.object({
  productIntent: z.string(),  // 1-2 문장
  targetUsers: z.array(z.string()),  // ["vibe coders", "indie devs"]
  features: z.array(z.object({
    name: z.string(),
    description: z.string(),
    confidence: z.enum(['stated', 'inferred']),  // README 명시 vs 코드 추론
  })),
  outOfScope: z.array(z.string()),  // 명시적으로 안 만든다고 한 것
  evidenceCitations: z.array(z.object({
    field: z.string(),  // 'productIntent' / 'features[0]' / ...
    source: z.string(),  // 'README.md:L5-L8' / 'CLAUDE.md:L20'
  })),
});
```

**Prompt 핵심**:
- 한국어 응답
- 추측 금지 — 출처 인용 필수
- 결정론적 사실 (route 개수)과 의미적 해석 (intent)을 라벨로 구분

**채울 카테고리**: 제품 의도 (60% 추가 → 100%)
**비용**: ~$0.005/audit (Haiku, 1-2K input + 500 output tokens)

### 4.3 B2 — PRD ↔ Implementation Semantic Match

**Pipeline step**: 신규 `step21-match-prd-to-code.ts`

**Input**:
- `docs/PRD/*.md` 의 헤더 + bullet (Phase A에서 추출)
- A3의 route 인벤토리
- A5의 test contracts

**Output**:

```ts
const PRDCoverageSchema = z.object({
  prdRequirements: z.array(z.object({
    id: z.string(),
    source: z.string(),  // 'docs/PRD/feature-x.md:L15'
    text: z.string(),
    matched: z.boolean(),
    confidence: z.enum(['high', 'medium', 'low']),
    evidence: z.array(z.string()),  // file:line citations
  })),
  coveragePercent: z.number(),  // matched / total
  unmatched: z.array(z.string()),  // requirements without evidence
  unexpectedFeatures: z.array(z.string()),  // code without PRD entry
});
```

**비용**: ~$0.02/audit (Haiku, 5-10K tokens 큰 input)

**채울 카테고리**: 요구사항 커버리지 (100%)

### 4.4 B3 — Flow Narrative Generation (옵션)

**Pipeline step**: 신규 `step22-flow-narrative-llm.ts`

**Input**: A3 graph + A5 test contracts

**Output**: 페이지별 한국어 user-story narrative

**채울 카테고리**: 기능 플로우 narrative 부분 (시각 보강)
**비용**: ~$0.01/audit
**Default**: opt-in (사용자가 "narrative 켜기" 옵션 시만)

---

## 5. Phase C — Hybrid Quality + Cost Controls

### 5.1 C1 — D/F/L 결과 reconciliation

- 같은 카테고리에 D와 L 결과 충돌 시:
  - D 우선
  - L 결과는 보조 표시 (예: "결정론: 23개 페이지 발견. LLM: 24개 기능 추정")
  - 차이 큰 경우 user-visible warning

### 5.2 C2 — Audit cost dashboard

- 누적 LLM 비용 (월별)
- audit별 breakdown (token usage, cost)
- 사용자 plan 별 한도 (free tier: $0, paid: $X/월)

### 5.3 C3 — PRD-free mode opt-out

- 사용자가 "LLM 안 쓸래" 옵션
- D+F만 동작 시 어떤 카테고리가 자동 N/A인지 명시
- "이 audit은 100% 결정론" 라벨

---

## 6. UI 변경 (사용자 가시화)

PR #39의 SKIP 메시지 정확화처럼, **각 점수의 산출 출처를 사용자에게 표시**:

```
영역별 점수
├── 제품 의도 — 78점
│   ├── 📦 D: package.json description (10/100)
│   ├── 🌐 F: GitHub description + topics (30/100)
│   └── 🤖 L: README intent extraction (38/100)
├── 기능 관계도 — 92점
│   └── 📦 D: 23개 페이지 + 17개 API endpoint 발견
└── 데이터 모델 — 80점
    └── 📦 D: Firestore rules + 11 entities 발견
```

신뢰도 뱃지:
- 📦 D (가장 신뢰)
- 🌐 F (외부 데이터 의존)
- 🤖 L (LLM 평가, 변동성 있음)

---

## 7. 우선순위 / 의존성 / 일정

| 순위 | Phase | 의존 | 추정 LOC | 사용자 가치 |
|---|---|---|---|---|
| 1 | **A1 + A2** | 없음 | ~400 | GitHub metadata + tech stack 자동 — N/A 일부 즉시 해소 |
| 2 | **A3** | A1/A2 | ~600 | 기능 관계도 100% — 큰 N/A 1개 통째로 해소 |
| 3 | **A4** | 없음 | ~500 | 데이터 모델 multi-stack — 다른 프로젝트에도 적용 |
| 4 | **B0 + B1** | A1-A3 | ~500 | LLM 인프라 + 제품 의도 추출. 점수 신뢰도 대도약 |
| 5 | **A5 + B2** | A3 + B0 | ~600 | 요구사항 커버리지 N/A 해소 |
| 6 | **B3, C1-C3** | B1/B2 | ~400 | 운영 도구 + 폴리시 |

총 추정 ~3000 LOC. Phase로 끊으면 3-5개 PR.

### 7.1 PR 분리 전략

- PR-A1: GitHub API + package.json (A1 + A2)
- PR-A2: Feature graph (A3) + multi-DB schema (A4)
- PR-A3: Test contracts (A5)
- PR-B1: LLM infra + intent extraction (B0 + B1)
- PR-B2: PRD matching (B2) + optional narrative (B3)
- PR-C: Quality + cost controls

각 PR은 독립적으로 머지 가능. Phase A 끝나면 LLM 없이도 점수 큰 폭 향상 + 사용자 체감 확인 가능.

---

## 8. 리스크

| Severity | 항목 | 완화 |
|---|---|---|
| HIGH | LLM 비용 폭주 | per-audit cap + cache + opt-out 옵션 |
| HIGH | LLM hallucination | strict zod parse + retry-once + fallback to D/F |
| HIGH | Prompt injection (README에 악의적 instructions) | system prompt isolation + max input size |
| MEDIUM | GitHub API rate limit | unauthenticated 60/h → authenticated 5000/h, cache |
| MEDIUM | 코드 AST 추출이 framework 의존 | best-effort + 명시적 framework 감지 + fallback "이 프로젝트는 X framework이라 지원 안 함" |
| MEDIUM | Phase A만 머지 후 결과 변동 (점수 흔들림) | release note + 사용자 알림 |
| LOW | Multi-DB schema parser 가 niche 스택 누락 | "지원되지 않는 스택" 명시 + 확장 가능 구조 |

---

## 9. 사전 결정 항목 (다음 세션 시작 시 확인)

| ID | 항목 | 옵션 | 권장 |
|---|---|---|---|
| Q1 | LLM provider | Claude / OpenAI / Gemini / hybrid | Claude (Haiku 4.5) — best reasoning per dollar |
| Q2 | Cache 저장소 | Firestore / Redis / R2 | Firestore (이미 인프라) |
| Q3 | per-audit cost cap | $0.10 / $0.50 / $1 / unlimited | $0.50 default |
| Q4 | GitHub API auth | unauthenticated / GitHub App / PAT | GitHub App (운영 최선), PAT (초기 OK) |
| Q5 | Phase A 머지 후 점수 변화 user-notice 형식 | none / banner / changelog page | banner (1-time, dismissible) |
| Q6 | LLM opt-out 기본값 | LLM on / LLM off | on (사용자가 끄는 모델), free tier는 limit 보호 |

---

## 10. Out of Scope (이 PRD 안 다룸)

- V1/V2/V3 시각 audit features — `project_visual_audit_vision.md` 별도 axis
- Phase 1 worker tooling (semgrep, osv-scanner) — PR #38, 별도 PRD
- audit 가격 정책 / paid plan / billing — 별도 product spec
- Multi-language 지원 (영문 audit input/output) — 한국어 우선, 다국어는 후속

---

## 11. 참고

- Phase 0 PRD: `docs/PRD/phase0-worker-tooling-2026-05-19.md`
- Visual UX 비전: `.claude/memory/project_visual_audit_vision.md`
- Phase 1 PR #38 burnt-in: `.claude/memory/feedback_pipx_python_docker.md`
- 2026-05-20 사용자 feedback transcript: 이 세션
