# 개발 가이드

[← README](../README.md) | [배포 가이드 →](../infra/README.deploy.md)

---

## 목차

1. [사전 요구사항](#1-사전-요구사항)
2. [모노레포 빌드 순서](#2-모노레포-빌드-순서)
3. [환경변수 전체 목록](#3-환경변수-전체-목록)
4. [Firebase Emulator Suite 셋업](#4-firebase-emulator-suite-셋업)
5. [디버깅 가이드](#5-디버깅-가이드)
6. [새 Audit Tool Adapter 추가](#6-새-audit-tool-adapter-추가)

---

## 1. 사전 요구사항

| 도구 | 버전 | 설치 |
|------|------|------|
| Node.js | 20.x LTS 이상 | https://nodejs.org/ |
| pnpm | 9.x | `corepack enable` |
| firebase-tools | 13+ | `npm i -g firebase-tools` |
| Java | 11+ (emulator 실행 시) | https://adoptium.net/ |

---

## 2. 모노레포 빌드 순서

패키지 간 의존 관계로 인해 다음 순서를 지켜야 합니다:

```
packages/shared-types
    ↓
packages/audit-core
    ↓
workers/audit-worker  /  apps/web  /  functions
```

```bash
# 전체 빌드 (pnpm -r 이 위상 정렬을 자동 처리)
pnpm -r build

# 개별 패키지
pnpm --filter @cleartoship/shared-types build
pnpm --filter @cleartoship/audit-core build
pnpm --filter audit-worker build
pnpm --filter web build
```

타입 체크는 빌드 없이도 가능합니다:
```bash
pnpm -r type-check
```

---

## 3. 환경변수 전체 목록

### 3-A. `apps/web/.env.local`

| 변수 | 필수 | 설명 |
|------|:----:|------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Y | Firebase 웹 API 키 (공개) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Y | `<project>.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Y | GCP 프로젝트 ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Y | `<project>.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Y | Firebase Messaging Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Y | Firebase App ID |
| `NEXT_PUBLIC_USE_EMULATORS` | — | `1` = emulator 모드, `0` = 실 Firebase |
| `FIRESTORE_EMULATOR_HOST` | — | `127.0.0.1:8080` (emulator 시) |
| `FIREBASE_AUTH_EMULATOR_HOST` | — | `127.0.0.1:9099` (emulator 시) |
| `FIREBASE_STORAGE_EMULATOR_HOST` | — | `127.0.0.1:9199` (emulator 시) |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | 서버 사이드 Admin SDK 인증 (WIF 사용 시 불필요) |
| `CLOUD_TASKS_PROJECT` | — | Cloud Tasks 프로젝트 ID (Sprint 1+) |
| `CLOUD_TASKS_LOCATION` | — | 큐 리전 (기본 `asia-northeast3`) |
| `CLOUD_TASKS_QUEUE` | — | 큐 이름 (기본 `audit-jobs`) |
| `AUDIT_WORKER_URL` | — | Cloud Run 워커 URL (Sprint 1+) |
| `AUDIT_WORKER_INVOKER_SA` | — | Cloud Run 호출 서비스 계정 이메일 (Sprint 1+) |

> Sprint 0에서는 `NEXT_PUBLIC_USE_EMULATORS=1`만 설정하면 Cloud Tasks/Worker 없이도 동작합니다.

### 3-B. `workers/audit-worker` (Cloud Run 런타임)

| 변수 | 필수 | 설명 |
|------|:----:|------|
| `NODE_ENV` | Y | `production` (OIDC 검증 활성화) |
| `WORKER_PORT` | — | HTTP 포트 (기본 `8080`) |
| `AUDIT_WORKER_URL` | Y (prod) | OIDC audience 검증에 사용 |
| `AUDIT_WORKER_INVOKER_SA` | Y (prod) | OIDC email 검증에 사용 |
| `GCP_PROJECT_ID` | Y | Firestore / Storage 프로젝트 |
| `ARTIFACT_BUCKET` | Y | Cloud Storage 버킷 (보고서 업로드) |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | 로컬 개발 시만. 프로덕션은 WIF/attached SA |

> `NODE_ENV !== 'production'` 이면 OIDC 검증이 자동으로 건너뜁니다 (로컬 개발 편의).

### 3-C. `functions/` (Cloud Functions 환경변수 — Secret Manager 주입)

Cloud Functions 2nd gen은 `firebase functions:secrets:set`으로 Secret Manager에 저장한 값을 런타임에 주입합니다.

| 시크릿 ID | 용도 |
|-----------|------|
| `CLOUD_RUN_WORKER_URL` | Cloud Run 워커 URL (`on-audit-run-created.ts`에서 읽음) |
| `INVOKER_SA` | Cloud Run 호출 서비스 계정 이메일 |
| `FUNCTIONS_SA` | Functions 런타임 서비스 계정 이메일 |

또한 Cloud Functions 코드는 `process.env`를 통해 다음을 읽습니다:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CLOUD_TASKS_LOCATION` | `asia-northeast3` | Cloud Tasks 리전 |
| `CLOUD_TASKS_QUEUE` | `audit-jobs` | 큐 이름 |
| `CLOUD_TASKS_PROJECT` | `GCP_PROJECT` 폴백 | GCP 프로젝트 ID |
| `AUDIT_WORKER_URL` | — | Cloud Run 워커 URL |
| `AUDIT_WORKER_INVOKER_SA` | — | OIDC 토큰 발급 SA |

---

## 4. Firebase Emulator Suite 셋업

### 4-1. 초기화 (최초 1회)

```bash
firebase login
firebase use --add   # 프로젝트 별칭 설정 (없으면 demo-project 사용 가능)
```

emulator는 실제 GCP 프로젝트 없이도 `demo-` 프리픽스 프로젝트로 동작합니다:

```bash
# .firebaserc 에 demo 프로젝트 추가 예시
firebase use --add --alias default
# project ID: demo-cleartoship
```

### 4-2. Emulator 시작

```bash
pnpm emulators
# 또는
firebase emulators:start --import=./seed --export-on-exit
```

| 서비스 | 포트 | UI |
|--------|------|----|
| Auth | 9099 | http://localhost:4000/auth |
| Firestore | 8080 | http://localhost:4000/firestore |
| Storage | 9199 | http://localhost:4000/storage |
| Functions | 5001 | http://localhost:4000/functions |
| Hosting | 5000 | http://localhost:5000 |
| Emulator UI | 4000 | http://localhost:4000 |

### 4-3. 시드 데이터

`seed/` 디렉터리에 Firestore export 데이터를 두면 `--import=./seed` 옵션으로 자동 로드됩니다.
초기에는 빈 디렉터리여도 정상 동작합니다.

### 4-4. .env.local emulator 설정

```bash
NEXT_PUBLIC_USE_EMULATORS=1
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
```

---

## 5. 디버깅 가이드

### 5-A. 브라우저 개발자 도구

- **Network 탭**: `/api/audit-runs` 요청/응답 확인. 400 응답이면 Request Body의 Zod 검증 오류 확인
- **Console**: Firebase client 초기화 오류 (`Cannot read properties of undefined`) → `.env.local` 누락 확인
- **Application > IndexedDB**: Firebase Auth 토큰 상태 확인

### 5-B. Cloud Run 워커 로그

모든 워커 로그는 structured JSON으로 stderr에 출력됩니다:

```bash
# 실시간 스트리밍
gcloud run services logs read audit-worker --project=$PROJECT_ID --region=asia-northeast3 --tail=50

# 특정 runId 필터
gcloud logging read \
  'resource.type="cloud_run_revision" jsonPayload.runId="<RUN_ID>"' \
  --project=$PROJECT_ID --limit=100
```

로컬에서 워커를 직접 실행:
```bash
cd workers/audit-worker
NODE_ENV=development WORKER_PORT=8081 pnpm dev
# OIDC 검증 건너뜀 — curl로 직접 테스트 가능
curl -X POST http://localhost:8081/run \
  -H 'Content-Type: application/json' \
  -d '{"runId":"test-1","projectId":"p1","ownerId":"u1","repoUrl":"https://github.com/owner/repo","deployUrl":null,"prdText":null,"commitHash":null}'
```

### 5-C. Cloud Functions 로그

```bash
firebase functions:log --project=$PROJECT_ID
# 또는
gcloud logging read 'resource.type="cloud_function"' --project=$PROJECT_ID --limit=50
```

### 5-D. Firestore 문서 확인

emulator: http://localhost:4000/firestore
프로덕션: https://console.firebase.google.com → Firestore

---

## 6. 새 Audit Tool Adapter 추가

### 6-1. 계약 인터페이스

`packages/audit-core/src/adapter.ts`의 `AuditToolAdapter<TInput, TRaw>` 인터페이스를 구현해야 합니다:

```typescript
import type { AuditToolAdapter, NormalizedFinding, WorkerCtx } from '@cleartoship/audit-core';

export class MyToolAdapter implements AuditToolAdapter<MyInput, MyRaw> {
  name = 'my-tool';
  version = '1.0.0';

  async run(input: MyInput, ctx: WorkerCtx): Promise<MyRaw> {
    // 도구 실행 로직. ctx.clonePath에서 파일 읽기 가능.
    // ctx.log('info', '...', { runId: ctx.runId }) 으로 구조화 로그 출력.
  }

  normalize(raw: MyRaw, ctx: WorkerCtx): NormalizedFinding[] {
    // raw 결과를 NormalizedFinding 배열로 변환.
    // 모든 finding은 반드시 category (AuditCategory), severity, confidence 포함.
  }
}
```

주요 타입 위치:

| 타입 | 파일 |
|------|------|
| `AuditToolAdapter` | `packages/audit-core/src/adapter.ts` |
| `NormalizedFinding` | `packages/audit-core/src/adapter.ts` |
| `WorkerCtx` | `packages/audit-core/src/adapter.ts` |
| `AuditCategory` | `packages/shared-types/src/` |
| `Severity`, `Confidence` | `packages/shared-types/src/` |

### 6-2. 어댑터 파일 위치

```
workers/audit-worker/src/adapters/
├── index.ts          # 바렐 (기존 — 새 어댑터 export 추가)
├── semgrep.ts        # 예시 (Sprint 1)
└── my-tool.ts        # 신규 어댑터
```

### 6-3. 파이프라인 연결

어댑터를 실제로 파이프라인에 연결하려면 해당 step 파일에서 임포트하고 호출합니다.
예: 정적 분석 도구 → `workers/audit-worker/src/pipeline/steps/06-static-analysis.ts`

### 6-4. Mock (Sprint 0) 패턴

Sprint 0에서는 고정 fixture를 반환하는 mock 어댑터를 사용합니다:

```typescript
export class MyToolMockAdapter implements AuditToolAdapter<MyInput, MyRaw> {
  name = 'my-tool-mock';
  version = '0.0.0-mock';

  async run(_input: MyInput, _ctx: WorkerCtx): Promise<MyRaw> {
    return { findings: [] }; // fake 결과
  }

  normalize(raw: MyRaw, _ctx: WorkerCtx): NormalizedFinding[] {
    return [];
  }
}
```

Sprint 1에서 실 어댑터로 교체 시 `index.ts`의 export만 변경하면 됩니다.

---

[← README](../README.md) | [배포 가이드 →](../infra/README.deploy.md) | [CHANGELOG →](../CHANGELOG.md)
