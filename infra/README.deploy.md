# ClearToShip 배포 가이드

[← README](../README.md) | [개발 가이드](../docs/DEVELOPMENT.md) | [CHANGELOG](../CHANGELOG.md)

이 디렉터리(`cleartoship/infra/`)는 ClearToShip MVP를 GCP/Firebase에 배포하기 위한 IaC와 스크립트를 포함합니다.

## 사전 요구사항

| 도구 | 최소 버전 | 설치 가이드 |
|------|----------|-------------|
| gcloud SDK | 최신 | https://cloud.google.com/sdk/docs/install |
| terraform | 1.6+ | https://developer.hashicorp.com/terraform/downloads |
| docker | 24+ | https://docs.docker.com/engine/install/ |
| node | 20.13 (LTS) | https://nodejs.org/ |
| pnpm | 9.x | `corepack enable && corepack prepare pnpm@latest --activate` |
| firebase-tools | 13+ | `npm i -g firebase-tools` |
| jq | 1.6+ | OS 패키지 매니저 |

### 인증 (사용자가 수동으로 1회 수행)

```bash
gcloud auth login
gcloud auth application-default login
firebase login
```

또한 GCP 결제 계정 ID를 미리 알아두어야 합니다. (Console > Billing > Account ID, 형식: `XXXXXX-XXXXXX-XXXXXX`)

---

## 배포 전 검증 (Phase 4 Verify)

배포 전 아래 3단계가 모두 성공해야 합니다. CI (`ci.yml`)가 자동으로 실행하지만
수동 배포 시에도 동일하게 확인합니다.

```bash
# 1. 타입 오류 없음
pnpm -r type-check
# → 모든 패키지 exit 0 확인

# 2. 단위 테스트 전체 통과
pnpm -r test
# → audit-core / web / audit-worker vitest 모두 pass

# 3. E2E 골든 패스 통과 (emulator 실행 중이어야 함)
pnpm -F web exec playwright test
# → golden-path / prd-upload / url-validation spec 통과
```

Playwright 미설치 시:
```bash
pnpm add -D -F web @playwright/test
pnpm -F web exec playwright install --with-deps chromium
```

---

## 빠른 실행 (전체 파이프라인)

```bash
cd cleartoship

export PROJECT_ID="cleartoship-prod"
export BILLING_ACCOUNT="XXXXXX-XXXXXX-XXXXXX"
export REGION="asia-northeast3"          # 선택
export IMAGE_TAG="v0.1.0"                # 선택

bash infra/scripts/00-all.sh
```

`00-all.sh`는 아래 5단계를 순차 실행합니다. 도중 실패 시 해당 단계만 재실행하면 됩니다.

---

## 단계별 실행

### 1. 프로젝트 + IAM 생성 (`01-setup-project.sh`)

- GCP 프로젝트 생성 / 결제 연결
- `infra/terraform/` 적용:
  - 11개 GCP API 활성화
  - 4개 서비스 계정 생성 (worker, invoker, functions, deployer-ci)
  - IAM bindings (least-privilege)
  - Cloud Tasks 큐 `audit-jobs` (rate=10/s, retry=3)
  - Artifact Registry `cleartoship-images` (cleanup: 최근 5개 유지, 미태그 14일 후 삭제)
  - Secret Manager 3개 (`github-token`, `anthropic-api-key`, `cloud-run-worker-url`)
  - Firestore native database
  - Workload Identity Federation pool/provider (GitHub Actions용)
- 결과를 `.firebaserc` `projects.default`에 자동 기록

```bash
PROJECT_ID=cleartoship-prod BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX \
  bash infra/scripts/01-setup-project.sh
```

**Dry-run으로 미리 확인:**
```bash
DRY_RUN=1 PROJECT_ID=cleartoship-prod BILLING_ACCOUNT=... bash infra/scripts/01-setup-project.sh
```

#### Terraform 변수 커스터마이즈

`infra/terraform/terraform.tfvars.example`를 `terraform.tfvars`로 복사 후 수정:

```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
# 편집기로 열어 project_id, billing_account, github_owner 입력
```

`terraform.tfvars`가 존재하면 스크립트가 자동으로 그 파일을 사용합니다.

### 2. 워커 이미지 빌드 (`02-build-worker.sh`)

```bash
PROJECT_ID=cleartoship-prod bash infra/scripts/02-build-worker.sh
```

- `workers/audit-worker/Dockerfile`을 빌드해 Artifact Registry에 push
- 태그: `v0.1.0` + `latest`

### 3. Cloud Run 워커 배포 (`03-deploy-worker.sh`)

```bash
PROJECT_ID=cleartoship-prod bash infra/scripts/03-deploy-worker.sh
```

- Cloud Run 서비스 `audit-worker` 배포 (4 CPU / 4 GiB / concurrency=1 / timeout=600s)
- 런타임 SA: `audit-worker-runtime@...`
- `--no-allow-unauthenticated` (OIDC 필수)
- `cloud-run-invoker@...`에 `roles/run.invoker` 부여
- 배포 후 추출한 URL을 Secret Manager `cloud-run-worker-url`에 새 버전으로 저장
- **`--min-instances` 자동 분기 (#96 T1.6-FU / W3.INF.1)**: `PROJECT_ID`에 `prod`가 포함되면 `1` (cold start 차단, 월 약 $13 추가 예상), 그 외(staging/dev)는 `0` (idle 비용 0). 수동 오버라이드는 `MIN_INSTANCES=<n>` 환경변수.
  - 예: `MIN_INSTANCES=2 PROJECT_ID=cleartoship-prod bash infra/scripts/03-deploy-worker.sh`
  - GitHub Actions `deploy.yml`도 동일 로직 적용 (`GCP_PROJECT_ID` secret 기반)

#### Cold-start 정책 (W3.INF.1)

| 환경 | min-instances | Cold start | 월 idle 비용 (asia-northeast3, 4 vCPU/4 GiB) | 근거 |
|------|---------------|------------|-----------------------------------------------|------|
| prod (`*prod*`) | **1** | 없음 (첫 요청도 warm container) | ≈ $13 USD | T1.6-FU PR #96, p95 latency budget < 60s 충족 필요 |
| staging / dev | 0 | 8–12s (Node 런타임 + lighthouse/git 부트) | $0 | 트래픽 거의 없는 비프로덕션은 idle 비용 우선 |

**Source of truth**: `.github/workflows/deploy.yml`의 `Deploy Cloud Run worker` 스텝 + `infra/scripts/03-deploy-worker.sh`. Terraform은 의도적으로 Cloud Run 리소스를 관리하지 않습니다 (drift 방지). 정책 변경 시 두 파일의 substring 분기를 같이 수정하세요.

**모니터링 연동**: `infra/monitoring/alerts.tf`의 p99 latency 알림(5s, 5min window) — cold-start로 인한 spike 감지. min-instances=0 환경에서 false positive를 피하려면 staging에서는 알림 정책을 disable 하거나 threshold를 완화하세요.

### 4. Functions + Firestore/Storage 규칙 배포 (`04-deploy-functions.sh`)

```bash
PROJECT_ID=cleartoship-prod bash infra/scripts/04-deploy-functions.sh
```

- `functions/`에서 `pnpm install --frozen-lockfile && pnpm build`
- `firebase functions:secrets:set`로 `CLOUD_RUN_WORKER_URL`, `INVOKER_SA`, `FUNCTIONS_SA` 주입
- `firebase deploy --only functions,firestore:rules,firestore:indexes,storage:rules`

### 5. Hosting 배포 (`05-deploy-hosting.sh`)

```bash
PROJECT_ID=cleartoship-prod bash infra/scripts/05-deploy-hosting.sh
```

- `apps/web` (Next.js 14, SSR)를 Firebase Hosting `frameworksBackend` (asia-northeast3)로 배포
- `firebase.json`의 `hosting.frameworksBackend` 설정에 의해 firebase CLI가 SSR 어댑터를 자동 구성

---

## apps/web 환경변수 설정

Cloud Run / Firebase 배포 전에 `apps/web/.env.local`을 작성해야 합니다.
`.env.example`을 복사하여 시작:

```bash
cp apps/web/.env.example apps/web/.env.local
```

필수 값 (`YOUR_*` 플레이스홀더를 실제 값으로 교체):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID
# 프로덕션 배포 시
NEXT_PUBLIC_USE_EMULATORS=0
AUDIT_WORKER_URL=https://audit-worker-XXXXX-an.a.run.app
AUDIT_WORKER_INVOKER_SA=cloud-run-invoker@YOUR_PROJECT.iam.gserviceaccount.com
```

Firebase 콘솔에서 키 확인: Project Settings > Your apps > SDK setup and configuration

---

## GitHub Repository Secrets 등록

GitHub Actions CI/CD가 동작하려면 저장소 Secrets에 아래 값을 등록해야 합니다.
Settings > Secrets and variables > Actions > New repository secret

| Secret | 값 소스 |
|--------|---------|
| `GCP_WIF_PROVIDER` | `cd infra/terraform && terraform output -raw wif_provider` |
| `GCP_DEPLOYER_SA` | `cd infra/terraform && terraform output -raw deployer_sa_email` |
| `GCP_PROJECT_ID` | 프로젝트 ID 직접 입력 |

Terraform apply 전이라면 `01-setup-project.sh` 실행 후 output에서 추출합니다.

---

## 시크릿 값 채우기

Terraform이 생성하는 시크릿 컨테이너는 **빈 컨테이너**입니다. 실제 값은 별도로 주입:

```bash
# Anthropic API key (선택 — Claude 사용 시)
printf 'sk-ant-...' | gcloud secrets versions add anthropic-api-key --data-file=- --project=$PROJECT_ID

# GitHub token (Sprint 1 이상 — github 분석 도구용)
printf 'ghp_...' | gcloud secrets versions add github-token --data-file=- --project=$PROJECT_ID
```

`cloud-run-worker-url`은 `03-deploy-worker.sh`가 자동으로 채웁니다.

---

## GitHub Actions CI/CD

`.github/workflows/`:

- `ci.yml`: PR 트리거. 타입체크/린트/테스트/Docker build 검증.
- `deploy.yml`: `main` 푸시 트리거. Workload Identity Federation으로 인증 후 배포.

### GitHub Repository Secrets 설정

| Secret | 값 | 소스 |
|--------|----|----|
| `GCP_WIF_PROVIDER` | `projects/.../providers/github-provider` | `terraform output wif_provider` |
| `GCP_DEPLOYER_SA` | `deployer-ci@<project>.iam.gserviceaccount.com` | `terraform output deployer_sa_email` |
| `GCP_PROJECT_ID` | 프로젝트 ID | 그대로 |
| `FIREBASE_TOKEN` | (대안) `firebase login:ci`로 발급 | WIF로 대체 가능 |

#### Terraform output 추출 예시
```bash
cd infra/terraform
terraform output -raw wif_provider
terraform output -raw deployer_sa_email
```

---

## 트러블슈팅

### `Firestore 데이터베이스가 이미 존재합니다`
Firestore는 프로젝트당 1개의 native database만 가질 수 있으며 재생성 불가합니다. Terraform 상태에 import:
```bash
cd infra/terraform
terraform import google_firestore_database.default projects/$PROJECT_ID/databases/(default)
```

### `Permission denied: API not enabled`
`gcloud services enable <api>` 실행 후 5~10분 대기. Terraform이 API enable 직후 리소스를 생성하려다 일시적 race condition을 만날 수 있어 `terraform apply` 재실행이 보통 해결.

### `terraform.tfvars`와 환경변수 동시 사용
스크립트는 `terraform.tfvars`를 우선 사용하고, 없으면 `terraform.tfvars.local`을 환경변수 기반으로 생성합니다. tfvars 파일에 `git` 추적되지 않도록 `.gitignore`가 이미 설정되어 있는지 확인하세요.

### Workload Identity Federation `principalSet` 이슈
`github_owner`를 비워두면 모든 GitHub 토큰이 deployer-ci를 임시 사용할 수 있게 됩니다. **반드시** `terraform.tfvars`에 GitHub org/user를 명시하세요.

### Cloud Tasks ALREADY_EXISTS 오류 (code 6)
`on-audit-run-created.ts`와 Next.js `create-audit-run.ts`가 동시에 같은 `runId`로 task를 생성할 수 있습니다. 결정론적 task 이름(`audit-{runId}`)으로 인해 두 번째 요청은 code 6를 반환하며, 이는 정상 동작(idempotency)입니다.

### 익명 인증(Anonymous Auth) 미활성화
Firebase 콘솔 > Authentication > Sign-in providers > Anonymous 를 반드시 활성화해야 합니다. 비활성화 시 API 요청이 전부 401을 반환합니다.

### OIDC 검증 실패 (`WORKER_MISCONFIGURED`)
프로덕션에서 `AUDIT_WORKER_URL` 또는 `AUDIT_WORKER_INVOKER_SA` 가 설정되지 않으면 워커가 503을 반환합니다 (fail-closed). `03-deploy-worker.sh` 실행 시 이 값들이 자동으로 Cloud Run 환경변수에 주입됩니다.

---

## 파일 트리

```
cleartoship/infra/
├── README.deploy.md                    (이 문서)
├── terraform/
│   ├── versions.tf
│   ├── main.tf
│   ├── variables.tf
│   ├── apis.tf
│   ├── service-accounts.tf
│   ├── iam.tf
│   ├── tasks.tf
│   ├── artifact-registry.tf
│   ├── secret-manager.tf
│   ├── firestore.tf
│   ├── wif.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
└── scripts/
    ├── 00-all.sh
    ├── 01-setup-project.sh
    ├── 02-build-worker.sh
    ├── 03-deploy-worker.sh
    ├── 04-deploy-functions.sh
    └── 05-deploy-hosting.sh
```
