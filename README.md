# ClearToShip — 바이브 코딩 결과물 감사 플랫폼

> GitHub Repo와 배포 URL을 입력받아 바이브 코딩 산출물의 출시 준비도를 감사하고,
> 점수 리포트와 개선 PRD를 자동 생성하는 AI Product Auditor.

**상태:** Phase 0 진입 — Round 4 self-audit 완료, O1–O4 fix 통합 (commit `7809ba6`) | **라이선스:** MIT

> 라운드 3·4 self-audit으로 audit-core / audit-worker 테스트 132→154, 205→211개로 확장하고
> INDETERMINATE 표면 5곳 정합·risky-functions 동적 import 스캔 등 O1–O4 보강을 반영했습니다.

---

## 핵심 기능

1. GitHub 리포 + 배포 URL 입력 → 18단계 Audit 파이프라인 자동 실행
2. 정적 분석 / 의존성 취약점 / 시크릿 누출 / UI 접근성 자동 탐지
3. 카테고리별 AuditScore 산출 + Markdown 리포트 자동 생성
4. Feature Graph (mermaid) 시각화 및 개선 PRD 자동 작성
5. Firebase 익명 인증 기반 — 회원가입 없이 즉시 감사 시작

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | Next.js 14 (App Router), React 18, Tailwind CSS v4, shadcn/ui |
| 인증 / DB | Firebase Auth (익명 포함), Firestore Native |
| 스토리지 | Firebase Cloud Storage |
| 파이프라인 | Cloud Run (audit-worker, Express) |
| 큐 | Cloud Tasks (`audit-jobs`) |
| 트리거 | Cloud Functions 2nd gen (Firestore onCreate) |
| IaC | Terraform 1.6+ |
| CI/CD | GitHub Actions (OIDC WIF) |
| 공유 패키지 | `@cleartoship/shared-types`, `@cleartoship/audit-core`, `@cleartoship/ui` |
| 관계형 DB | 없음 (Firestore 전용) |

---

## 로컬 개발 빠른 시작

```bash
# 1. 의존성 설치 (Node 20 LTS, pnpm 9 필요)
corepack enable
pnpm install

# 2. 환경변수 작성 — apps/web/.env.local 에 아래 내용을 저장
# (보안 정책상 .env.example 파일은 리포에 포함하지 않습니다)
#   NEXT_PUBLIC_USE_EMULATORS=1
#   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
#   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
#   FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
#   NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
#   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-cleartoship.firebaseapp.com
#   NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-cleartoship
#   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-cleartoship.appspot.com
#   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
#   NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:000000000000
# 전체 변수 목록은 docs/DEVELOPMENT.md §3 참조

# 3. 환경 진단 (선택, 권장)
pnpm doctor              # Node/pnpm/Firebase CLI/Java/포트/.env/도구 12종 PASS/WARN/FAIL

# 4. 개발 서버 시작 — 통합 (권장)
pnpm dev:full            # emulators + web + worker 병렬 부팅, Ctrl+C로 일괄 종료

# 4. (대안) 터미널 분리
pnpm emulators           # 터미널 A: Firebase emulator suite
pnpm --filter web dev    # 터미널 B: Next.js (http://localhost:3000)
```

> Emulator 포트(4000/5000/5001/8080/9099/9199)가 이전 세션의 좀비 프로세스로 점유돼 있다면
> `pnpm free-ports` 로 점유자를 확인하고, 안전하다고 판단되면 `pnpm free-ports --kill` 로 정리하세요.

상세 환경변수 목록과 Firebase Emulator 셋업은 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)를 참고합니다.

---

## 모노레포 구조

```
cleartoship/
├── apps/
│   └── web/                   # Next.js 14 — Firebase Hosting + SSR
├── workers/
│   └── audit-worker/          # Cloud Run 컨테이너 (Express) — 18단계 파이프라인
├── functions/                 # Cloud Functions 2nd gen — Firestore 트리거 + Cloud Tasks 큐잉
├── packages/
│   ├── shared-types/          # Zod 스키마 + TypeScript 타입 (공유)
│   ├── audit-core/            # 점수 계산 / Feature Graph / Markdown 렌더링 (pure logic)
│   └── ui/                    # shadcn/ui 기반 디자인 시스템
├── infra/
│   ├── terraform/             # GCP 인프라 IaC
│   └── scripts/               # 단계별 배포 셸 스크립트
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── firebase.json
└── pnpm-workspace.yaml
```

---

## 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | Next.js 개발 서버 (`apps/web`) |
| `pnpm dev:full` | emulators + web + worker 병렬 부팅 (한 명령으로 onboarding) |
| `pnpm doctor` | 개발 환경 진단 (Node/pnpm/Firebase CLI/Java/포트/.env/도구) |
| `pnpm free-ports` | Emulator 포트 점유 프로세스 식별 (`--kill` 옵션으로 종료) |
| `pnpm build` | 전체 워크스페이스 빌드 |
| `pnpm emulators` | Firebase Emulator Suite 시작 |
| `pnpm -r type-check` | 전체 타입체크 |
| `pnpm -r test` | 전체 단위 테스트 (vitest) |
| `pnpm -F web exec playwright test` | E2E 테스트 (Playwright) |
| `pnpm ci` | type-check + lint + test 일괄 |

---

## 아키텍처 흐름

```
Browser
  → Firebase Hosting (Next.js SSR)
      → POST /api/audit-runs → Firestore (auditRuns)
          → Firestore onCreate Trigger (Functions)
              → Cloud Tasks enqueue (audit-jobs)
                  → Cloud Run: audit-worker (POST /run)
                      → Firestore (findings, graph, report)
  ← polling / realtime snapshot ←
```

---

## 테스트

```bash
# 단위 테스트 (vitest) — audit-core, web, audit-worker
pnpm -r test

# 커버리지
pnpm -r test:coverage

# E2E (Playwright) — emulator 실행 중이어야 함
pnpm -F web exec playwright test
```

Playwright 첫 실행 전:
```bash
pnpm add -D -F web @playwright/test
pnpm -F web exec playwright install --with-deps chromium
```

---

## 배포

전체 배포 절차는 [`infra/README.deploy.md`](infra/README.deploy.md)를 참고합니다.

---

## 변경 이력

[`CHANGELOG.md`](CHANGELOG.md) 참고.

---

## 라이선스

MIT © 2026 ClearToShip contributors
