# Phase 0 — Worker Tooling Foundation (Minimum-Viable Production Audit)

**작성일**: 2026-05-19
**작성자**: w2a-planner (Opus 4.7) — design-only, no code change
**Owner (실행 단계)**: devops (Dockerfile + deploy.yml) + backend-fixer (smoke script)
**상위 핸드오프**: [`reports/AUTOPILOT/ap-20260519-mvp-golden-path-handoff.md`](../../reports/AUTOPILOT/ap-20260519-mvp-golden-path-handoff.md) §10
**관련 PRD**:
- [`sprint4-execution-plan-2026-05-18.md`](./sprint4-execution-plan-2026-05-18.md) §3.3 (L-P0-2 infra, Cloud Run min-instance=1)
- [`finalize-launch-sharpen-2026-05-18.md`](./finalize-launch-sharpen-2026-05-18.md) §A.3 (W3 vibe-coded profile, blocked on clone)
**Launch target**: 2026-06-05 (Sprint 4 §D.5 unchanged — Phase 0가 critical path 위에 있음)
**상태**: PLAN (design-only). 코드 변경 0건. Phase 2 Dispatch 후 실행.

---

## 0. Executive Summary

ClearToShip 프로덕션 audit pipeline은 2026-05-19 기준으로 "완료되지만 빈 리포트(near-empty report)"를 생산하는 상태에 있다. 가장 최근 prod 실행 (`auditRuns/f9yNjdD3rDzEYrrps9hA`)은 `status=COMPLETED, progress=100, readinessScore=21, launchStatus=INDETERMINATE` 로 끝났으나, 20-step pipeline 중 **8 step이 silently SKIPPED** 되었다. 근본 원인은 단일하다 — `workers/audit-worker/Dockerfile`가 `node:20.13-alpine` 위에 시스템 도구를 하나도 설치하지 않는다 (`Sprint 0 — no system tools yet`, Dockerfile:57). `git`이 없어 step 03 `clonePath`가 `null`로 떨어지고, 그 cascade가 step 04~13의 fs-기반 detector를 모두 차단한다.

본 PRD는 **Phase 0 — 1 PR / 1d** 로 정의되는 최소 작업을 분해한다. 목표는 단 하나다: **prod에서 ClearToShip 자기 repo 를 다시 audit 했을 때 `readinessScore` 가 21에서 50+ 로 상승**. semgrep / osv-scanner 같은 정적·의존성 분석 도구는 Phase 1으로 명시 deferred. Phase 0의 성과는 8/11 broken step 복구 + Chromium 기반 Playwright/Lighthouse step 복구로 한정한다.

**핵심 결정 6건**:

| # | 결정 | 근거 |
|---|---|---|
| P0.1 | Base image: `node:20.13-alpine` → `node:20.13-bookworm-slim` (정확한 digest 핀) | apt 기반 git/chromium 설치 필요. alpine은 musl glibc 차이로 playwright deps 부족. |
| P0.2 | Chromium 설치 = `npx playwright install --with-deps chromium` (build stage), 런타임 stage로 COPY | 단일 명령으로 chromium + 시스템 deps 한 번에. 별도 `apt-get install chromium`보다 안정. |
| P0.3 | `CHROME_PATH=/usr/local/bin/chromium` symlink + `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright` | step 09 (analyze-deploy-url, lighthouse) 가 `CHROME_PATH` 환경변수에 의존. handoff §9 quote 명시. |
| P0.4 | `chown -R worker:worker /opt/ms-playwright` **BEFORE** `USER worker` 전환 | R10 (non-root 권한). USER 후 chown은 EPERM. |
| P0.5 | Prod-only `--no-cpu-throttling` Cloud Run flag (deploy.yml line ~168 인접) | D-2 결정 — handler refactor ($0 + test churn) 대신 $120/mo 부담. handoff §6.5 11-min 행 방지. |
| P0.6 | 직전 prod revision 을 `audit-worker:rollback-pin` 태그로 Artifact Registry 보존 (수동, 1회) | R11 (bad revision serves prod). `--no-traffic` 초기 deploy 옵션을 §6에서 제안. |

**즉시 deferred (Phase 1로 명시)**: semgrep 설치 (python3 + pipx), osv-scanner v1.9.2 binary 핀, `--timeout=900` 상향, semgrep 레지스트리 cache pre-warm.

**즉시 out-of-scope (Phase 2 또는 그 이후)**: trivy/docker-scout CI vuln scan, multi-stage pipx 트림, `--no-cpu-throttling` 회피용 await-then-respond handler 리팩토링 ($120/mo 절감 기회), 커스텀 도메인 (D-3).

---

## 1. Problem Statement — 증거와 cascade

### 1.1 Live worker 로그 (handoff §9 인용, 2026-05-19 07:14 UTC)

```
[error] git clone failed |meta={"error":"spawn git ENOENT"}        ← root cause
[warn]  Semgrep skipped — no clone path                            ← cascaded
[warn]  OSV-Scanner skipped — no clone path                        ← cascaded
[warn]  Secret scan skipped — no clone path                        ← cascaded (false dep)
[warn]  Risky function discovery skipped — no clone path           ← cascaded (false dep)
[warn]  Data model analysis skipped — no clone path                ← cascaded (false dep)
[warn]  Design consistency skipped — no clone path                 ← cascaded (false dep)
[warn]  Business readiness skipped — no clone path                 ← cascaded (false dep)
[warn]  Playwright run failed |meta={"error":"Executable doesn't exist"}
[warn]  Lighthouse failed |meta={"error":"CHROME_PATH env must be set"}
```

### 1.2 "8-of-11 cascade" insight (prior planner 산출물)

11 broken step 중 **실제로 새 binary 가 필요한 것은 4개**:
- `git` (step 03 clone-repo)
- `chromium` (step 09 analyze-deploy-url — Playwright + Lighthouse 모두)
- `semgrep` (step 06 static-analysis) — **Phase 1 deferred**
- `osv-scanner` (step 07 dependency-scan) — **Phase 1 deferred**

나머지 5개는 이미 **pure-Node**, `packages/audit-core` 내부 구현:
- step 08 secret-scan → `secret-patterns.ts`
- step 13b business-readiness → `13b-analyze-business-readiness.ts`
- step 16 analyze-data-model → `16-analyze-data-model.ts`
- step 17 design-consistency → `17-design-consistency.ts`
- step 18 discover-risky-functions → `18-discover-risky-functions.ts`

이 5개가 SKIP 되는 이유는 step 03 가 `ctx.clonePath = null` 로 보낼 때 downstream guard가 단순히 cascade-skip 하기 때문이다. **git 단독 설치만으로 8개 step 이 동시에 복구된다.** (실증 file path: `workers/audit-worker/src/pipeline/steps/03-clone-repo.ts:1-12` — shallow clone 후 walkTree, clone 실패 시 `clonePath: null` emit.)

### 1.3 핵심 인용 — server.ts /healthz 의 tools 프로브

```typescript
// workers/audit-worker/src/diagnostics/tools-health.ts:19
export const TOOL_NAMES = ['semgrep', 'osv-scanner', 'lighthouse', 'git'] as const;
```

`/healthz` 응답은 이미 4 도구 상태를 `'found' | 'missing'` 으로 반환한다 (`server.ts:30-38`). Phase 0 완료 시점에 prod `/healthz` 호출하면 **git=found, lighthouse=found** 두 개로 상태가 바뀐다. semgrep / osv-scanner 는 여전히 missing — Phase 1 까지 의도된 결과.

### 1.4 왜 readinessScore=21 가 위험한가

- `launchStatus=INDETERMINATE` 는 §C.1 7-enum 의 5번째 (회색 banner). Sharpen PRD §B.1.2 의 `deriveLaunchStatus` 가 uncertainty>30 또는 indeterminate category 수>임계치 에서 강제 진입.
- 사용자 입장에서 "audit 가 돌긴 했는데 도움 안 됨" 인상. 2026-06-05 launch 시 데모용 cleartoship-self-audit 가 21점이면 hero copy 의 "결정론적 ship-readiness" 메시지와 정면 충돌.
- D-day (2026-06-05) 까지 16.5d 중 Phase 0 (1d) + Phase 1 (2d) = 3d 소비. 남은 13.5d는 Sprint 4 Wave 2/3 작업에 그대로 할당.

---

## 2. Scope

### 2.1 In-scope (Phase 0)

| 항목 | 형태 |
|---|---|
| Dockerfile base image 전환 | `workers/audit-worker/Dockerfile:4` + `:29` |
| git + ca-certificates apt-install (build + runtime stage 양쪽) | Dockerfile RUN layer 추가 |
| Chromium 설치 (Playwright 경유) | Dockerfile build stage 신규 RUN |
| Chromium 런타임 COPY + symlink + env | Dockerfile runtime stage |
| Non-root user chown 순서 보강 | Dockerfile runtime stage 라인 순서 |
| Cloud Run prod-only `--no-cpu-throttling` | `.github/workflows/deploy.yml:162-171` 변경 |
| Smoke verification 스크립트 (build-time + post-deploy) | `workers/audit-worker/scripts/smoke-tools.sh` (신규) |
| 이미지 태그 보존 정책 (rollback pin) | infra/README.deploy.md §4 신규 단락 |

### 2.2 Deferred — Phase 1 (별도 PR)

- python3 + pipx + `pipx install semgrep==1.86.0`
- semgrep registry cache pre-warm (`semgrep --config p/owasp-top-ten --dryrun`)
- osv-scanner v1.9.2 binary GitHub releases pin + SHA256 verify
- `/healthz` 4-of-4 tools `found` 검증
- Cloud Run `--timeout=600 → 900` 상향 (semgrep 풀스캔 여유)

### 2.3 Out-of-scope (Phase 2 또는 추후)

- Trivy / docker-scout CI vuln scan
- Multi-stage pipx 트림 (pipx 를 build stage 에 두고 venv 만 COPY)
- `--no-cpu-throttling` 회피용 handler refactor (await-then-respond) — D-2 결정으로 보류
- 커스텀 도메인 전환 (D-3) — punt until billable users
- Dead Cloud Function `ssrcleartoshipprod` 정리 (D-4) — devops 별도 청소 PR

### 2.4 Phase 0 진입 조건 (4 PR merge 선행)

| PR | 제목 | 영향 |
|---|---|---|
| #31 | `fix(infra): grant serviceAccountUser on cloud-run-invoker to web-ssr + functions` | IaC ↔ live state parity. Phase 0와 무관하지만 prod state drift 차단. |
| #32 | `fix(deploy): set OIDC + Cloud Tasks env on audit-worker and functions` | 같음 — 같이 머지. |
| #33 | `feat(web): /audits list page` | UX gap. Phase 0와 독립이지만 main에 있어야 데모 시 사이드바 404 안 봄. |
| #34 | `fix(worker): prevent ANALYZE_DEPLOY_URL hang on missing chrome binary` | Phase 0가 chromium 을 설치하면 fall-through 가 사실상 dead code 가 되지만, fail-fast 보호 장치로 유지. |

**Gate**: 4 PR 모두 merged + main 동기화 + `pnpm install --frozen-lockfile` clean 후에만 Phase 0 PR 생성.

---

## 3. Work Unit Breakdown

### 3.1 W1 — Dockerfile build stage

| ID | 작업 | 담당 agent | 변경 파일 | 의존성 | 신규 테스트 | 예상 LOC | Effort |
|---|---|---|---|---|---|---|---|
| P0.W1.1 | Base image alpine → `node:20.13-bookworm-slim@sha256:<digest>` (정확한 digest 핀) | devops | `workers/audit-worker/Dockerfile:4` | 없음 | 0 (docker build 통과로 검증) | ~1 (라인 교체) | 0.05d |
| P0.W1.2 | build stage 에 `git`, `ca-certificates` apt-install (`--no-install-recommends`) | devops | `workers/audit-worker/Dockerfile:5-7` 사이 신규 RUN layer | P0.W1.1 | 0 | ~5 | 0.05d |
| P0.W1.3 | Chromium 설치 — `RUN npx playwright install --with-deps chromium` (build stage 끝) | devops | `workers/audit-worker/Dockerfile:25` 직후 | P0.W1.1, P0.W1.2 | 0 | ~3 | 0.1d |

**§3.1 소계**: 3 work units, 0 tests, ~9 LoC, 0.2d.

**Note — apt-install 위치**: build stage 와 runtime stage 양쪽에 git 이 필요하다. build stage 는 `playwright install --with-deps` 의존성 해결용, runtime stage 는 step 03 실제 `git clone` 호출용. 두 stage 양쪽 모두 apt-install 한다 — multi-stage 이미지에서 layer 가 격리되기 때문.

### 3.2 W2 — Dockerfile runtime stage

| ID | 작업 | 담당 agent | 변경 파일 | 의존성 | 신규 테스트 | 예상 LOC | Effort |
|---|---|---|---|---|---|---|---|
| P0.W2.1 | runtime stage base 도 `node:20.13-bookworm-slim@<digest>` 로 전환 | devops | `workers/audit-worker/Dockerfile:29` | P0.W1.1 | 0 | ~1 | 0.05d |
| P0.W2.2 | runtime stage 에 `git`, `ca-certificates` apt-install | devops | `workers/audit-worker/Dockerfile:30-33` 사이 신규 RUN | P0.W2.1 | 0 | ~5 | 0.05d |
| P0.W2.3 | Non-root user 생성 명령 alpine `addgroup`/`adduser` → debian `groupadd`/`useradd` 로 교체 | devops | `workers/audit-worker/Dockerfile:33-34` | P0.W2.1 | 0 | ~2 (라인 교체) | 0.05d |
| P0.W2.4 | build stage → runtime stage 로 `/opt/ms-playwright` 디렉토리 COPY | devops | `workers/audit-worker/Dockerfile:42` 직후 신규 COPY | P0.W1.3, P0.W2.2 | 0 | ~1 | 0.05d |
| P0.W2.5 | Chromium binary 절대 경로 → `/usr/local/bin/chromium` symlink | devops | runtime stage, COPY 이후 RUN | P0.W2.4 | 0 | ~3 | 0.05d |
| P0.W2.6 | `ENV CHROME_PATH=/usr/local/bin/chromium` 명시 | devops | runtime stage `ENV` block | P0.W2.5 | 0 | ~1 | 0.05d |
| P0.W2.7 | `ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright` 명시 (Playwright 가 binaries 위치 탐색) | devops | runtime stage `ENV` block | P0.W2.5 | 0 | ~1 | 0.05d |
| P0.W2.8 | **`chown -R worker:worker /opt/ms-playwright`** RUN — `USER worker` BEFORE 위치 강제 | devops | runtime stage, USER worker 직전 | P0.W2.4 | 0 | ~2 | 0.1d (라인 순서 강제) |
| P0.W2.9 | 기존 `chown -R worker:worker /app` 라인은 그대로 유지, 단 새 chown 다음 라인으로 정렬 | devops | `workers/audit-worker/Dockerfile:52` | P0.W2.8 | 0 | ~0 (정렬만) | 0 |
| P0.W2.10 | runtime stage `corepack` enable 라인은 그대로 (`pnpm install --prod` 가 필요로 함) | devops | `workers/audit-worker/Dockerfile:37` | — | 0 | 0 | 0 |

**§3.2 소계**: 10 work units (이 중 W2.10은 변경 없음 명시), 0 신규 tests, ~16 LoC, 0.4d.

**중복 분석 (chown 순서)**: 기존 Dockerfile:52 의 `chown -R worker:worker /app` 와 신규 P0.W2.8 의 `chown -R worker:worker /opt/ms-playwright` 는 **목적이 다르므로 합치지 않는다**. /app 는 pnpm-installed deps 권한, /opt/ms-playwright 는 Playwright runtime 권한. 별도 RUN layer 로 분리해 image cache 무효화 범위 최소화.

### 3.3 W3 — Cloud Run deploy.yml prod-only flag

| ID | 작업 | 담당 agent | 변경 파일 | 의존성 | 신규 테스트 | 예상 LOC | Effort |
|---|---|---|---|---|---|---|---|
| P0.W3.1 | prod 분기 (deploy.yml:155 `if [[ "${{ secrets.GCP_PROJECT_ID }}" == *"prod"* ]]`) 내부에 `CPU_THROTTLING_FLAG="--no-cpu-throttling"` 변수 설정 | devops | `.github/workflows/deploy.yml:155-160` | 없음 (이미 prod 분기 존재) | 0 (deploy step 통과) | ~3 | 0.1d |
| P0.W3.2 | staging/dev 분기에 `CPU_THROTTLING_FLAG=""` (기본 CPU throttling 유지) | devops | `.github/workflows/deploy.yml:157-159` | P0.W3.1 | 0 | ~1 | 0.05d |
| P0.W3.3 | `gcloud run deploy` 호출에 `$CPU_THROTTLING_FLAG` 인자 추가 | devops | `.github/workflows/deploy.yml:162-171` | P0.W3.1, P0.W3.2 | 0 | ~1 | 0.05d |
| P0.W3.4 | 동일 분기 내 주석 추가 — D-2 결정 근거 ($120/mo, handler-refactor 대안 보류 사유) | devops | `.github/workflows/deploy.yml:155` 위 주석 블록 | — | 0 | ~8 (주석) | 0.05d |
| P0.W3.5 | `infra/scripts/03-deploy-worker.sh` 에 동일 분기 미러링 (workflow comment 가 명시) | devops | `infra/scripts/03-deploy-worker.sh` (현재 분기 없으면 신규) | P0.W3.1 | 0 | ~10 | 0.1d |

**§3.3 소계**: 5 work units, 0 신규 tests, ~23 LoC, 0.35d.

**Note — `--no-cpu-throttling` 의미**: Cloud Run 의 기본 behavior 는 request 후 `res.json()` 이 즉시 200 응답하면 CPU 를 throttle (대략 1/1000 비율) 한다. handoff §6.5 가 보고한 "ANALYZE_DEPLOY_URL 11분 hang" 이 정확히 이 throttle 결과 — chrome-launcher 의 path-search 가 throttled CPU 에서 정상 <1s → 11min 으로 늘어났다. `--no-cpu-throttling` 는 instance lifetime 동안 full CPU 보장. 비용: 4 vCPU prod 인스턴스 1대 24h = ~$13/mo 상승 (handoff §7 D-2 에서 $120/mo 추정은 max-instances=10 worst-case). Phase 2 에서 handler-refactor 로 다시 회수 가능.

### 3.4 W4 — Smoke verification (build-time + post-deploy)

| ID | 작업 | 담당 agent | 변경 파일 | 의존성 | 신규 테스트 | 예상 LOC | Effort |
|---|---|---|---|---|---|---|---|
| P0.W4.1 | `workers/audit-worker/scripts/smoke-tools.sh` (신규) — `git --version` + `chromium --version` 둘 다 exit 0 확인 | backend-fixer | `workers/audit-worker/scripts/smoke-tools.sh` | P0.W2.* | 0 (스크립트 자체) | ~30 | 0.1d |
| P0.W4.2 | Dockerfile 끝에 `RUN /app/workers/audit-worker/scripts/smoke-tools.sh` build-time gate | devops | `workers/audit-worker/Dockerfile:54` 직전 | P0.W4.1 | 0 | ~1 | 0.05d |
| P0.W4.3 | deploy.yml 신규 step — `gcloud run services proxy` 또는 `curl https://<url>/healthz` 로 tools=found 검증 | devops | `.github/workflows/deploy.yml:286` 직전 | P0.W3.* | 0 (workflow step) | ~15 | 0.15d |
| P0.W4.4 | `/healthz` 응답에서 `tools.git.status === 'found' && tools.lighthouse.status === 'found'` jq assertion. semgrep / osv-scanner 는 missing 허용 (Phase 1까지). | devops | deploy.yml 신규 step | P0.W4.3 | 0 | ~10 | 0.1d |

**§3.4 소계**: 4 work units, 0 신규 unit tests (smoke scripts 가 검증), ~56 LoC, 0.4d.

**Note — smoke 가 unit test 가 아닌 이유**: Phase 0 의 변경은 build-time / deploy-time artifact 에 한정. JS-level behavior 변경 없음. 신규 unit test 는 의미가 없고, smoke script 의 exit code 가 곧 검증이다. `getToolsHealth()` 자체에는 이미 `tools-health.test.ts` 가 존재 (`workers/audit-worker/src/diagnostics/tools-health.test.ts`).

### 3.5 W5 — Image tag retention (rollback pin)

| ID | 작업 | 담당 agent | 변경 파일 | 의존성 | 신규 테스트 | 예상 LOC | Effort |
|---|---|---|---|---|---|---|---|
| P0.W5.1 | 직전 prod revision 의 image tag 를 `audit-worker:rollback-pin-2026-05-19` 로 1회 Artifact Registry 태그 (수동, gcloud) | devops | (수동 op, IaC 외부) | P0 deploy 직전 | 0 | 0 | 0.1d |
| P0.W5.2 | `infra/README.deploy.md` §4 (없으면 신규) 에 "직전 revision pinning" 문단 추가 | devops | `infra/README.deploy.md` | P0.W5.1 | 0 | ~25줄 doc | 0.1d |
| P0.W5.3 | deploy.yml `Cleanup policy` 가 rollback-pin- 접두사 태그를 보존하도록 `firebase deploy --force` 영향 확인 (현재 functions 만 cleanup policy 적용 — worker 이미지는 영향 없음) | devops | (확인만, 변경 없음) | — | 0 | 0 | 0.05d |

**§3.5 소계**: 3 work units, 0 tests, ~25줄 doc, 0.25d.

### 3.6 Phase 0 종합

| 항목 | 값 |
|---|---|
| Total work units | 3 (W1) + 10 (W2) + 5 (W3) + 4 (W4) + 3 (W5) = **25** |
| Total 신규 tests | 0 unit + 1 build-time smoke + 1 post-deploy smoke = **2 smoke** |
| Total LoC | ~9 + 16 + 23 + 56 = **~104 (코드)** + 25줄 doc |
| Total effort | 0.2 + 0.4 + 0.35 + 0.4 + 0.25 = **~1.6d** (devops 단독, 직렬 의존) |
| Parallelization | W1 ↔ W3 ↔ W5 병렬 가능. W2 는 W1 (build stage 결과물) 대기. W4 는 W2+W3 대기. |
| 압축 후 effort | **~1.0d** (W1‖W3‖W5 동시 시작) |

### 3.7 변경 후 Dockerfile 골격 (예시, 디자인 only)

```dockerfile
# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
FROM node:20.13-bookworm-slim@sha256:<digest>  AS build  # P0.W1.1
WORKDIR /app

# P0.W1.2 — system tools for build deps (git for npm/pnpm git+ deps, ca-certs for TLS)
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ... (기존 monorepo manifest copy / pnpm install / source copy / build 동일) ...

# P0.W1.3 — Chromium + 시스템 deps 일괄 설치 (build stage 에서 한 번만)
RUN npx playwright install --with-deps chromium

# ---------- Stage 2: runtime ----------
FROM node:20.13-bookworm-slim@sha256:<digest>  AS runtime  # P0.W2.1
WORKDIR /app

# P0.W2.2 — runtime 도 git 필요 (step 03 가 호출)
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# P0.W2.3 — debian 식 user 생성
RUN groupadd -g 10001 worker && \
    useradd -u 10001 -g worker -s /bin/false worker

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

ENV NODE_ENV=production
ENV WORKER_PORT=8080
ENV CHROME_PATH=/usr/local/bin/chromium                            # P0.W2.6
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright                    # P0.W2.7

# 기존 manifest + dist COPY (변경 없음)
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/
# ... (생략)

# P0.W2.4 — Chromium 디렉토리 build → runtime
COPY --from=build /opt/ms-playwright /opt/ms-playwright

# P0.W2.5 — symlink (Playwright 가 설치한 실제 chromium binary 는
# /opt/ms-playwright/chromium-*/chrome-linux/chrome — 버전별 디렉토리. 
# 빌드 시점에 ls 로 정확 경로 잡고 ln -s 로 안정 경로 노출)
RUN ln -s /opt/ms-playwright/chromium-*/chrome-linux/chrome /usr/local/bin/chromium

RUN pnpm install --prod --filter audit-worker... --frozen-lockfile=false

# P0.W2.8 — USER worker 직전 chown 순서 보강
RUN chown -R worker:worker /opt/ms-playwright
RUN chown -R worker:worker /app                                    # P0.W2.9

# P0.W4.2 — build-time smoke gate
COPY workers/audit-worker/scripts/smoke-tools.sh /usr/local/bin/smoke-tools.sh
RUN chmod +x /usr/local/bin/smoke-tools.sh && /usr/local/bin/smoke-tools.sh

USER worker
EXPOSE 8080

# Phase 0 — git + chromium installed. Phase 1 will add: semgrep, osv-scanner.
CMD ["node", "workers/audit-worker/dist/server.js"]
```

`<digest>` 값은 PR 작성 시점에 `docker buildx imagetools inspect node:20.13-bookworm-slim` 으로 lookup 해서 핀.

### 3.8 변경 후 smoke-tools.sh (예시, 디자인 only)

```bash
#!/usr/bin/env bash
# Build-time + post-deploy smoke probe. Exit 0 = pass, exit 1 = fail.
# Phase 0 surface only: git + chromium.
# Phase 1 adds: semgrep + osv-scanner.
set -euo pipefail

fail=0

if ! git --version >/dev/null 2>&1; then
  echo "[smoke] FAIL: git not found"; fail=1
else
  echo "[smoke] OK:   git $(git --version)"
fi

if [[ -z "${CHROME_PATH:-}" ]] || ! "$CHROME_PATH" --version >/dev/null 2>&1; then
  echo "[smoke] FAIL: chromium not found at \$CHROME_PATH=${CHROME_PATH:-<unset>}"
  fail=1
else
  echo "[smoke] OK:   chromium $("$CHROME_PATH" --version)"
fi

exit "$fail"
```

---

## 4. Verification Plan

### 4.1 Build-time

| 단계 | 명령 | 통과 기준 |
|---|---|---|
| V1 — local docker build | `docker build -t audit-worker:phase0-local -f workers/audit-worker/Dockerfile .` | exit 0, smoke-tools.sh build-time gate (P0.W4.2) 통과 |
| V2 — local git probe | `docker run --rm audit-worker:phase0-local git --version` | `git version 2.x.x` 출력 |
| V3 — local chromium probe | `docker run --rm -e CHROME_PATH=/usr/local/bin/chromium audit-worker:phase0-local /usr/local/bin/chromium --version` | `Chromium 12x.x.x.x` 출력 |
| V4 — non-root permission probe | `docker run --rm audit-worker:phase0-local id -u` → `10001` | non-root 진입 확인 (USER worker effective) |
| V5 — playwright deps probe | `docker run --rm audit-worker:phase0-local ls /opt/ms-playwright/chromium-*` | 디렉토리 존재 + 권한 worker:worker |
| V6 — image size sanity | `docker images audit-worker:phase0-local` | < 1.2 GB (alpine baseline ~280 MB, bookworm + playwright 예상 ~1 GB) |

### 4.2 CI / GitHub Actions

| 단계 | 무엇이 검증되는가 |
|---|---|
| V7 — `Build & push audit-worker image` step (deploy.yml:118-131) | docker buildx 통과 + Artifact Registry push 성공 |
| V8 — `Deploy Cloud Run worker` step (deploy.yml:133-179) | `--no-cpu-throttling` flag 가 prod 분기에서만 적용되는지 step log 확인 |
| V9 — 신규 `Smoke /healthz` step (P0.W4.3) | `tools.git.status === 'found'` + `tools.lighthouse.status === 'found'` jq assert |

### 4.3 Post-deploy (prod)

| 단계 | 명령 | 통과 기준 |
|---|---|---|
| V10 — prod /healthz | `curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" https://audit-worker-<hash>-du.a.run.app/healthz` | `toolsStatus: 'degraded'` (semgrep / osv 여전히 missing), but `tools.git.status === 'found'`, `tools.lighthouse.status === 'found'` |
| V11 — 실제 audit run | web-ssr 에서 `https://github.com/Yoodaddy0311/cleartoship` 입력 → 새 auditRun 생성 → COMPLETED 대기 | `status=COMPLETED`, `readinessScore` ≥ 50, `launchStatus` ∈ {`READY_WITH_CAVEATS`, `NEEDS_WORK`, `AT_RISK`} — `INDETERMINATE` 탈출이 핵심 KPI |
| V12 — worker 로그 cascade 해소 | Cloud Logging filter `resource.type="cloud_run_revision"` `resource.labels.service_name="audit-worker"` 에서 step 03 `git clone failed` 0회, step 04~13 가 정상 로그 emit | "no clone path" 메시지 0건 |
| V13 — Playwright 진입 | step 09 (analyze-deploy-url) 가 11-min hang 대신 정상 chrome-launcher 통과 | step 09 duration < 60s |
| V14 — 비교 baseline | Phase 0 직전 audit (`f9yNjdD3rDzEYrrps9hA`, score=21) vs Phase 0 직후 audit Δ readinessScore ≥ +29 | manual diff |

### 4.4 회귀 가드

| 단계 | 무엇 |
|---|---|
| V15 — 기존 `pnpm -F audit-worker test` (478 test) 그대로 통과 | Phase 0 가 JS 코드 변경 없음 → 모두 unchanged baseline |
| V16 — `pnpm -F web test` (Sprint 4 baseline 1627) 그대로 통과 | 같음 |
| V17 — `tools-health.test.ts` 의 missing-tool 분기 | 기존 테스트는 mock 기반이라 호스트 환경 영향 없음. 통과 유지. |

---

## 5. Risk Gates

### 5.1 R-P0-1 — Bookworm glibc / native module incompatibility (handoff R1)

| 필드 | 값 |
|---|---|
| 트리거 | P0.W1.1 + P0.W2.1 (base image 전환) |
| Risk | alpine musl 환경에서 동작하던 native binary (예: bcrypt, sharp, prisma engine) 가 bookworm glibc 에서 ABI mismatch 로 segfault. 현재 audit-worker deps 에 prisma 또는 native crypto 사용 여부 사전 grep 필요. |
| Mitigation | (1) `node:20.13-bookworm-slim@sha256:<digest>` 정확한 digest 핀 — `:tag` 만 사용 시 Docker Hub 가 minor 업데이트 시 ABI 흔들 가능. (2) PR 직전 `pnpm -F audit-worker test` + V1~V6 통과 의무. (3) audit-worker `package.json` 의 native dep 0건 확인 (필요 시 추가) |
| Gate | local V1~V6 모두 통과 + audit-worker test suite (478) green 후에만 CI push |
| Owner | devops (build) + backend-fixer (test 확인) |

### 5.2 R-P0-2 — Non-root user 가 /opt/ms-playwright 를 읽지 못함 (handoff R10)

| 필드 | 값 |
|---|---|
| 트리거 | P0.W2.8 `chown` 누락 또는 USER worker 다음에 chown 배치 시 |
| Risk | `USER worker` 전환 후 `chown` 은 EPERM. Chromium 실행 시 `cannot access /opt/ms-playwright/chromium-*/chrome-linux/chrome: Permission denied`. Cloud Run 에서는 fail-closed 가 아닌 fail-silent (재시도 후 step SKIPPED) 로 나타남. |
| Mitigation | (1) Dockerfile 라인 순서 강제: P0.W2.8 (`chown /opt/ms-playwright`) → P0.W2.9 (`chown /app`) → P0.W4.2 (smoke 실행, root 권한) → `USER worker`. (2) V4 (id -u == 10001) 와 V5 (ls /opt/ms-playwright 의 권한 컬럼) 가 build-time 가드. (3) ReviewBot pattern: PR description 에 Dockerfile 변경 시 chown↔USER 순서 명시 체크박스. |
| Gate | V4 + V5 모두 통과 |
| Owner | devops |

### 5.3 R-P0-3 — `min-instances=1` 상태에서 bad revision 이 prod 즉시 노출 (handoff R11)

| 필드 | 값 |
|---|---|
| 트리거 | P0.W3.* deploy 시 — main 머지 후 자동 deploy 가 100% 트래픽 즉시 전환 |
| Risk | bookworm base 가 ABI 호환되지 않거나 chromium symlink 가 잘못된 경우, min-instances=1 정책 때문에 새 revision 이 즉시 1 instance 떠서 prod traffic 을 받음 — 사용자가 빈 응답 또는 500 을 즉시 경험. |
| Mitigation | (1) deploy.yml 신규 옵션 — Phase 0 PR 머지 시 1회만 `gcloud run deploy --no-traffic` (revision 만 만들고 트래픽 0%), 수동으로 V10~V13 검증 후 `gcloud run services update-traffic --to-latest`. (2) 직전 revision (`audit-worker-00026-srx`) 의 image tag 를 `rollback-pin-2026-05-19` 로 보존 (P0.W5.1). (3) `gcloud run services update-traffic <svc> --to-revisions=audit-worker-00026-srx=100` 즉시 회복 path 명시. |
| Gate | --no-traffic 1회 deploy → V10~V13 통과 → 100% 트래픽 전환 |
| Owner | devops (deploy ops) |

### 5.4 R-P0-4 — Build 시간 / 이미지 size 폭증

| 필드 | 값 |
|---|---|
| 트리거 | `playwright install --with-deps chromium` 가 ~250MB chromium + ~150MB apt deps 추가 |
| Risk | (1) GHA `Build & push audit-worker image` step timeout 30m 초과 (deploy.yml:68). (2) Artifact Registry 저장 비용 (~$0.10/GB/mo) — 이미지 크기 3-4 배 증가. (3) cold start 가 image pull 때문에 +5-10s 증가 (handoff D-1 결정: "cold start delta ~7s" 인정 후 채택). |
| Mitigation | (1) GHA cache (cache-from/to: gha) 가 이미 활성 (deploy.yml:130-131) — chromium 레이어 변경 없으면 cache hit. (2) Phase 2 의 multi-stage 트림 (cleartoship/docs/PRD §Phase2) 으로 환원 가능. (3) `--max-instances=10` 유지 → 워스트 케이스 10 instance × 1.2GB = 12GB 트래픽, 분당 deploy 1 회 미만 시 무시 가능. |
| Gate | V6 (image < 1.2GB) + GHA step duration < 25m |
| Owner | devops |

### 5.5 R-P0-5 — `--no-cpu-throttling` 의 prod-only 가드 누락

| 필드 | 값 |
|---|---|
| 트리거 | P0.W3.1~W3.3 의 분기 조건이 GCP_PROJECT_ID substring "prod" 검사에 의존 |
| Risk | staging 또는 dev 프로젝트 ID 에 "prod" 포함 시 (예: `cleartoship-prod-staging`) staging 도 $13-120/mo 비용 발생. 현재 prod ID 는 `cleartoship-prod` 단일이지만 명명 정책이 바뀌면 회귀. |
| Mitigation | (1) staging 분기에서 `CPU_THROTTLING_FLAG=""` 명시 (P0.W3.2) — 빈 값일 때 gcloud 가 기본 throttling 유지. (2) Cloud Billing alert: $20/mo 임계 시 알림 (이미 W3.INF.5 에 alert policy 존재). (3) `infra/scripts/03-deploy-worker.sh` 동일 분기 mirror 후 두 곳 simultaneous 검토 강제 (deploy.yml:153 주석에 이미 명시) |
| Gate | V8 (CI step log 확인) |
| Owner | devops |

### 5.6 R-P0-6 — Chromium 버전 mismatch (Playwright npm vs apt)

| 필드 | 값 |
|---|---|
| 트리거 | P0.W1.3 가 `playwright install --with-deps chromium` 으로 한 번에 처리하지만, runtime stage 에서 `apt-get install chromium` 을 추가로 시도하면 두 chromium 버전이 충돌 |
| Risk | symlink 가 의도치 않게 apt chromium 을 가리키면, Playwright `chromium` 채널이 발견하지 못해 step 09 fail. |
| Mitigation | (1) **runtime stage 에 `apt-get install chromium` 를 명시적으로 추가하지 않음**. chromium 은 build stage 의 playwright install 산출물에서 COPY 만 한다 (P0.W2.4). (2) symlink 절대 경로를 `/opt/ms-playwright/chromium-*/chrome-linux/chrome` 로 명시 (P0.W2.5). (3) V3 가 정확히 이 경로에서 버전 출력하는지 검증. |
| Gate | V3 + V5 모두 통과 |
| Owner | devops |

### 5.7 R-P0-7 — Phase 1 (semgrep / osv-scanner) 미완 상태에서 launch 가 가까워질 때 의사 결정

| 필드 | 값 |
|---|---|
| 트리거 | 2026-06-05 launch D-day 가 Phase 1 완료 전 도래 |
| Risk | Phase 0 만 가지고 launch → static-analysis, dependency-scan step 이 영구 SKIP. 사용자가 "이 도구는 의존성 취약점을 보지 않는다" 느낌. |
| Mitigation | (1) Phase 1 effort 2d → Phase 0 직후 즉시 진입 일정. Sprint 4 §D.5 Wave 5 (2026-06-03~06-05) 3d 안에 Phase 1 fit 가능 — but 위험. (2) launch hero copy 에 "MVP scope: code structure / secrets / readability / browser smoke" 명시, "vulnerability scan: rolling out Q3" 명시 (legal copy 가드 R-GATE-3 와 결합). (3) team-lead 판단 — Phase 1 미완 시 launch 연기 vs degraded launch — §9 Q1 로 escalate. |
| Gate | team-lead 결정 |
| Owner | team-lead + content-marketer |

---

## 6. Rollback Plan

### 6.1 Rollback Trigger

다음 중 하나라도 발생 시 즉시 rollback:

| 조건 | 측정 |
|---|---|
| V10 `/healthz` 가 5xx 또는 500ms+ 지연 | Cloud Monitoring uptime check |
| V11 첫 prod audit 가 `status=FAILED` 또는 30min 이내 완료 안 됨 | Firestore `auditRuns/*` 폴링 |
| Cloud Run revision 이 1 instance ready 못 함 (이미지 pull 실패, chmod 실패 등) | `gcloud run services describe` |
| 이전 baseline (1579+ test PASS) 회귀 | `pnpm -r test` |

### 6.2 Rollback Procedure

```powershell
# 0. 정확한 직전 revision SHA 확인
gcloud run services describe audit-worker --region=asia-northeast3 --project=cleartoship-prod \
  --format='value(status.latestReadyRevisionName,status.traffic)'
# 기대 직전 ready revision: audit-worker-00026-srx (Phase 0 직전 prod)

# 1. 트래픽 즉시 회수 — 직전 revision 으로 100%
gcloud run services update-traffic audit-worker \
  --region=asia-northeast3 --project=cleartoship-prod \
  --to-revisions=audit-worker-00026-srx=100

# 2. 새 revision 비활성화 (선택 — 잘못 promote 되지 않게 차단)
gcloud run revisions update <new-revision-name> \
  --region=asia-northeast3 --project=cleartoship-prod \
  --no-traffic

# 3. /healthz 가 다시 200 + tools.git.status='missing' 로 돌아왔는지 확인
$tok = gcloud auth print-identity-token
$url = (gcloud run services describe audit-worker --region=asia-northeast3 --format='value(status.url)')
Invoke-WebRequest -Headers @{Authorization="Bearer $tok"} -Uri "$url/healthz"

# 4. Firestore 측 새 audit run 이 stuck 상태라면 수동 PATCH:
#    status=FAILED, errorMessage='Phase 0 rollback — re-run with prior revision'
```

### 6.3 Forward-fix vs Rollback 결정

- **Forward-fix (rollback 보다 선호)**: V1~V6 build-time 실패는 PR 머지 전에 발견 → 그냥 PR 수정 후 재 push.
- **Rollback (불가피)**: Cloud Run revision 이 prod 100% 받은 후 발견된 실패. 30분 내 회복 안 되면 rollback.
- **Forward-fix 불가능한 조건**: ABI mismatch 같은 base-image-level 문제 → bookworm 전환 자체 revert 필요 → PR revert + main 재배포 = rollback path.

### 6.4 Image Retention

- 직전 `audit-worker:sha-<digest>` 이미지를 `rollback-pin-2026-05-19` 라는 두 번째 태그로 Artifact Registry에 부여 (P0.W5.1).
- Artifact Registry 의 GC 정책이 untagged 만 정리하므로 rollback-pin- 접두사 이미지는 영구 보존.
- 6개월 후 Phase 1 / Phase 2 안정 시 별도 cleanup PR.

---

## 7. Phase 1 / Phase 2 Forward References

### 7.1 Phase 1 — Static + Dependency Analyzers (다음 PR, 2d)

목표: `/healthz` 에서 4-of-4 도구 모두 `found`. semgrep + osv-scanner 가 step 06/07 에서 실제 finding emit 시작.

핵심 작업:
- `apt-get install -y python3 python3-pip pipx` (runtime stage, P0.W2.2 line 인접)
- `pipx install semgrep==1.86.0` — 1.86 은 2026-Q1 안정 최신 (handoff §10)
- Semgrep registry cache pre-warm — build stage 에서 `semgrep --config p/owasp-top-ten --dryrun` 으로 cache 채우기
- osv-scanner v1.9.2 binary — GitHub Releases 에서 SHA256 검증 후 `/usr/local/bin/osv-scanner` 로 install
- Cloud Run `--timeout=600 → 900` (deploy.yml:168) — semgrep 풀스캔 시 step 06 가 10분 가까이 갈 수 있음

핵심 검증:
- V11 (prod audit) 의 readinessScore 가 50+ → 65+ 영역 진입 기대
- step 06 findings count > 0, step 07 vulnerability count ≥ 0 (clean repo는 0 가능)
- `/healthz` 4/4 found

리스크 carry-over: R-P0-1 (glibc) 는 python3/pipx 가 추가 의존성을 끌어들이므로 다시 한 번 V1~V6 회귀.

### 7.2 Phase 2 — Hardening + Cost Recovery (선택 PR, 1-2d)

목표: 운영 안정성 + Phase 0 의 $120/mo 비용 회수 기회.

핵심 작업:
- Trivy 또는 docker-scout CI vuln scan — `.github/workflows/ci.yml` 신규 step
- Multi-stage 트림 — pipx 를 build stage 에 두고 venv (`/root/.local/pipx/venvs/semgrep`) 만 runtime 으로 COPY → runtime 이미지 ~300-400MB 감소
- `workers/audit-worker/scripts/smoke-tools.ts` — Phase 0/1 의 bash smoke 를 TS 로 승격해 tools-health.ts 와 코드 공유
- **선택**: handler refactor — `runPipeline(payload)` 를 `await` 한 뒤 응답 → Cloud Run CPU throttle 영향 0 → `--no-cpu-throttling` 제거 → $120/mo 회수. 다만 Cloud Tasks 의 timeout 정책 (현재 600s) 과 충돌 위험 → ADR 필요.

핵심 검증:
- 이미지 크기 < 700MB
- Trivy HIGH/CRITICAL = 0
- (선택) handler refactor 후 step 09 duration 안정성 회귀 테스트 (e2e 시나리오 ≥ 5회)

### 7.3 Phase 0 → Phase 1 핸드오프 인터페이스

Phase 0 PR 머지 후 Phase 1 PR 시작 시 입력으로 가정해야 할 prod 상태:
- `audit-worker` Cloud Run revision: Phase 0 새 SHA, `--no-cpu-throttling`, `--timeout=600`, min-instances=1
- Base image: `node:20.13-bookworm-slim@<digest>` (Phase 1 도 같은 digest 이어받기)
- `/healthz` 응답: `toolsStatus=degraded`, `tools.git.status=found`, `tools.lighthouse.status=found`, `tools.semgrep.status=missing`, `tools.osv-scanner.status=missing`

Phase 1 PR 의 첫 commit 은 V10 응답을 capture 해서 "before" baseline 으로 첨부.

---

## 8. Acceptance Criteria (Definition of Done)

Phase 0 가 "done" 이라 부르기 위해 **모두** PASS 해야 한다:

| # | 조건 | 측정 |
|---|---|---|
| AC1 | local `docker build -f workers/audit-worker/Dockerfile .` exit 0 | V1 |
| AC2 | local `docker run --rm <img> /usr/local/bin/smoke-tools.sh` exit 0 | V1 (build-time gate) + 별도 실행 |
| AC3 | `docker run --rm <img> git --version` 출력에 `git version 2.` 포함 | V2 |
| AC4 | `docker run --rm -e CHROME_PATH=/usr/local/bin/chromium <img> /usr/local/bin/chromium --version` 출력에 `Chromium` 포함 | V3 |
| AC5 | container effective user UID == 10001 | V4 |
| AC6 | image size < 1.2 GB | V6 |
| AC7 | GHA `Deploy` workflow 가 30min 안에 끝남 (timeout 미발생) | V7 |
| AC8 | prod Cloud Run `audit-worker` 가 `--no-cpu-throttling` 으로 deploy 됨 (`gcloud run services describe ... --format='value(spec.template.spec.containerConcurrency,annotations.run.googleapis.com/cpu-throttling)'`) | V8 |
| AC9 | prod `/healthz` 응답 JSON: `tools.git.status === 'found'` | V10 |
| AC10 | prod `/healthz` 응답 JSON: `tools.lighthouse.status === 'found'` | V10 |
| AC11 | `https://github.com/Yoodaddy0311/cleartoship` 입력 시 새 auditRun 생성 → `status=COMPLETED` 30분 이내 | V11 |
| AC12 | 새 auditRun 의 `readinessScore` ≥ 50 (직전 baseline 21 → Δ ≥ +29) | V11 |
| AC13 | 새 auditRun 의 `launchStatus` ≠ `INDETERMINATE` | V11 |
| AC14 | worker log 에 `git clone failed` 0건 (cleartoship 본인 repo 대상 audit 한정) | V12 |
| AC15 | worker log 에 step 09 duration < 60s | V13 |
| AC16 | `pnpm -F audit-worker test` 결과: 478 PASS (회귀 0) | V15 |
| AC17 | `pnpm -F web test` 결과: 1627 PASS (회귀 0) | V16 |
| AC18 | 직전 prod revision (`audit-worker-00026-srx`) 의 image tag 가 `rollback-pin-2026-05-19` 로도 잡혀 있음 | `gcloud artifacts docker images list .../audit-worker --include-tags` |
| AC19 | `infra/README.deploy.md` 에 rollback procedure (§6.2) 가 새로 문서화됨 | grep |
| AC20 | PR description 에 V1~V14 결과 첨부 (text or screenshot) | manual review |

---

## 9. Open Questions for Team-Lead

### 9.1 Q1 — `--no-traffic` 1회 deploy 강제 여부

deploy.yml 현재 자동 100% 트래픽. Phase 0 머지 시 1회만 수동 promote 가 안전 (R-P0-3) 하지만, deploy.yml 자체에 `--no-traffic` 분기를 추가하면 모든 후속 deploy 도 영향. 옵션:
- A) Phase 0 PR 만 1회 수동 procedure (`gcloud run deploy --no-traffic` + 수동 update-traffic), deploy.yml 변경 없음
- B) deploy.yml 에 영구 `--no-traffic` + 별도 manual promote workflow_dispatch step

**Recommend**: A — 일회성. CI 복잡도 최소화.

### 9.2 Q2 — Phase 1 일정 risk

Sprint 4 §D.5 Wave 5 가 2026-06-03 ~ 06-05 (3d) 인데 Phase 1 (2d) 을 그 안에 끼울지, Wave 5 시작 직전 (06-02) 으로 앞당길지. 옵션:
- A) Wave 5 안 (06-03~06-04 Phase 1, 06-05 launch)
- B) Wave 5 직전 (06-01~06-02 Phase 1, 06-03~06-05 Wave 5 그대로)

**Recommend**: B — Phase 1 은 prod artifact 변경이라 V11 회귀 가능성 있어 launch 직전이 위험. 2d 버퍼 확보.

### 9.3 Q3 — Cost overshoot 알람 임계

`--no-cpu-throttling` 가 max-instances=10 worst-case 시 ~$120/mo 추가. 현재 Cloud Billing alert 없음 (Sprint 4 W3.INF.5 의 alert policy 는 latency/error 만). 옵션:
- A) Phase 0 PR 안에 Billing alert ($30/mo per service 임계) 추가
- B) Phase 2 hardening 으로 deferred

**Recommend**: A — 1줄 terraform 으로 충분. Phase 0 안에 끼우는 게 안전.

### 9.4 Q4 — Phase 0 PR 사이즈

본 PRD 가 25 work units / ~104 LoC code + ~25 LoC doc 으로 한정한다. 그러나 deploy.yml + infra/scripts/03-deploy-worker.sh + infra/README.deploy.md 가 한 PR 안에 묶이면 review 가 분산. 옵션:
- A) 단일 PR (모든 25 unit) — 1d
- B) 두 PR — (B1) Dockerfile only, (B2) deploy.yml + 문서. 0.5d × 2 + sync 비용.

**Recommend**: A — 변경이 의미적으로 한 단위 ("worker 가 도구를 갖춤"). 분리하면 V11 (prod audit) 검증이 두 번 필요해 시간 손해.

### 9.5 Q5 — Phase 0 직후 cleartoship self-audit 결과를 marketing 자료로 활용 여부

V11 의 prod audit 결과가 readinessScore 50-65 영역에 들어오면 Sharpen PRD §C 의 hero copy ("78점 ± 6점") 의 실측 근거가 된다. 옵션:
- A) Phase 0 직후 audit 을 evidence 로 launch 페이지에 노출
- B) Phase 1 까지 끝낸 후의 audit (더 풍부한 findings) 을 evidence 로 사용

**Recommend**: B — Phase 0 만 가지고 self-promote 하면 "vulnerability scan 미포함" 비판에 무방비. Phase 1 완료 후 audit 이 더 정직한 demo.

---

## 10. Re-entry Checklist (다음 세션 첫 5분)

```powershell
# 1. Sync main + Phase 0 PR 진입 전 baseline
cd "C:\Users\HeechangLee\Desktop\ClearToShip\repo"
git fetch origin
git checkout main
git pull --ff-only

# 2. 진입 조건 검증 — 4 PR 모두 머지됐는지 확인
gh pr list --state merged --base main --limit 10 | grep -E '^31|^32|^33|^34'
# 기대: 4개 모두 머지된 상태로 표시

# 3. Phase 0 branch 생성
git checkout -b feat/phase0-worker-tooling

# 4. 본 PRD 의 §3 work unit 순서대로 변경 적용
# §3.1 → §3.2 → §3.3 → §3.4 → §3.5

# 5. Local V1~V6 통과 확인 후에만 push
docker build -t audit-worker:phase0-local -f workers/audit-worker/Dockerfile .
docker run --rm audit-worker:phase0-local git --version
docker run --rm audit-worker:phase0-local /usr/local/bin/chromium --version
docker run --rm audit-worker:phase0-local id -u

# 6. PR 생성 시 description 에 V1~V6 출력 + 본 PRD 링크 첨부
gh pr create --title "feat(phase0): worker tooling — git + chromium + --no-cpu-throttling" \
  --body "Closes Phase 0 of worker tooling ULTRAPLAN. See docs/PRD/phase0-worker-tooling-2026-05-19.md for full plan."

# 7. 머지 후 R-P0-3 mitigation — --no-traffic 수동 deploy
# (deploy.yml 가 자동 트래픽 promote 한다면 Q1 결정에 따라 수동 회수)
gcloud run services update-traffic audit-worker \
  --region=asia-northeast3 --project=cleartoship-prod \
  --to-revisions=audit-worker-00026-srx=100

# 8. /healthz V10 + audit run V11 확인 후 100% promote
gcloud run services update-traffic audit-worker \
  --region=asia-northeast3 --project=cleartoship-prod --to-latest
```

---

## 11. Phase 2 Dispatch 핸드오프 (Phase 0 자체 dispatch)

### 11.1 Phase 0 Phase 2 진입 조건

- [x] 본 PRD 작성 완료 (2026-05-19, Opus 4.7 planner)
- [ ] team-lead 승인 (§9 Q1~Q5 결정 포함)
- [ ] PR #31~#34 모두 머지 (§2.4 진입 조건)
- [ ] Phase 0 branch (`feat/phase0-worker-tooling`) 생성 + W1~W5 dispatch

### 11.2 즉시 실행 가능한 Next Task 5건

#### T-P0.NEXT-1 — Dockerfile build stage 전환 (W1.1~W1.3)
- **담당**: devops
- **파일**: `workers/audit-worker/Dockerfile:4-26`
- **의존성**: 없음
- **DoD**: V1 (docker build) + V6 (image size) 통과
- **예상**: 2시간
- **우선순위**: P0

#### T-P0.NEXT-2 — Dockerfile runtime stage 재구성 (W2.1~W2.10)
- **담당**: devops
- **파일**: `workers/audit-worker/Dockerfile:29-58`
- **의존성**: T-P0.NEXT-1
- **DoD**: V2 + V3 + V4 + V5 통과
- **예상**: 3시간
- **우선순위**: P0

#### T-P0.NEXT-3 — deploy.yml prod-only `--no-cpu-throttling` (W3.1~W3.5)
- **담당**: devops
- **파일**: `.github/workflows/deploy.yml:133-179` + `infra/scripts/03-deploy-worker.sh`
- **의존성**: 없음 (T-P0.NEXT-1/2 와 병렬 가능)
- **DoD**: V8 (CI step log) 통과
- **예상**: 1.5시간
- **우선순위**: P0

#### T-P0.NEXT-4 — smoke-tools.sh + healthz CI assert (W4.1~W4.4)
- **담당**: backend-fixer (스크립트) + devops (CI step)
- **파일**: `workers/audit-worker/scripts/smoke-tools.sh` (신규) + `.github/workflows/deploy.yml` 신규 step
- **의존성**: T-P0.NEXT-2 (chromium 설치 완료 후)
- **DoD**: V9 (jq assert) 통과
- **예상**: 2시간
- **우선순위**: P0

#### T-P0.NEXT-5 — image rollback pin + 문서 (W5.1~W5.3)
- **담당**: devops
- **파일**: `infra/README.deploy.md` + Artifact Registry tag 부여 (수동 1회)
- **의존성**: T-P0.NEXT-3 deploy 직전
- **DoD**: AC18 + AC19 통과
- **예상**: 1.5시간
- **우선순위**: P1

**5건 합계 effort**: ~10시간 ≈ 1.25d (직렬 시). T-P0.NEXT-1‖T-P0.NEXT-3 병렬 시 ~1.0d.

### 11.3 Phase 0 종합 매트릭스

| 항목 | 값 |
|---|---|
| Total work units | 25 |
| Total 신규 tests | 0 unit + 2 smoke scripts |
| Total LoC (코드 + script) | ~104 |
| Total LoC (doc) | ~25 (infra/README.deploy.md) |
| Total effort | ~1.0d (병렬화 후) |
| Track | C (QA + Infra) — devops 단독 + backend-fixer 1.5h |
| Risk gates | 7건 (R-P0-1 ~ R-P0-7) |
| Open questions | 5건 (Q1~Q5) — team-lead 결정 필요 |
| Acceptance criteria | 20건 (AC1~AC20) |

---

## 12. References

### 12.1 Documents
- **상위 핸드오프**: [`reports/AUTOPILOT/ap-20260519-mvp-golden-path-handoff.md`](../../reports/AUTOPILOT/ap-20260519-mvp-golden-path-handoff.md) §9~§10
- **선행 핸드오프**: [`reports/AUTOPILOT/ap-20260519-deploy-unblock-handoff.md`](../../reports/AUTOPILOT/ap-20260519-deploy-unblock-handoff.md)
- **Sprint 4 plan**: [`docs/PRD/sprint4-execution-plan-2026-05-18.md`](./sprint4-execution-plan-2026-05-18.md) §3.3 L-P0-2
- **Sharpen PRD**: [`docs/PRD/finalize-launch-sharpen-2026-05-18.md`](./finalize-launch-sharpen-2026-05-18.md) §A.3 W3
- **Migration doc**: [`docs/MIGRATIONS/2026-05-19-add-fcs-field.md`](../MIGRATIONS/2026-05-19-add-fcs-field.md) (FCS 마이그레이션, Phase 0 와 독립이지만 같은 launch 라인)

### 12.2 Code Anchors (verified 2026-05-19)
- `workers/audit-worker/Dockerfile:4` — base image (alpine, 변경 대상)
- `workers/audit-worker/Dockerfile:29` — runtime base image (alpine, 변경 대상)
- `workers/audit-worker/Dockerfile:33-34` — user 생성 (alpine adduser, 변경 대상)
- `workers/audit-worker/Dockerfile:52` — 기존 chown /app (재배치 대상)
- `workers/audit-worker/Dockerfile:57` — `Sprint 0 — no system tools yet` 주석 (제거 대상)
- `workers/audit-worker/src/diagnostics/tools-health.ts:19` — `TOOL_NAMES` 4 도구 정의
- `workers/audit-worker/src/server.ts:16-54` — `/healthz` endpoint
- `workers/audit-worker/src/pipeline/steps/03-clone-repo.ts` — git clone cascade root
- `workers/audit-worker/src/pipeline/steps/09-analyze-deploy-url.ts` — CHROME_PATH consumer
- `.github/workflows/deploy.yml:133-179` — Cloud Run worker deploy step
- `.github/workflows/deploy.yml:155-160` — 기존 prod 분기 (`min-instances` 만 분기, `--no-cpu-throttling` 추가 대상)
- `.github/workflows/deploy.yml:68` — `timeout-minutes: 30` (R-P0-4 영향)

### 12.3 Architectural Decisions (Carried Forward)
- **D-1** (handoff §7): Base image = bookworm-slim. playwright:v1.45.0-jammy 거부 (cold start +7s 무의미).
- **D-2** (handoff §7): `--no-cpu-throttling` 채택 ($120/mo). Handler refactor 대안은 Phase 2 옵션으로 보류.
- **D-3** (handoff §7): 커스텀 도메인 보류 (billable users 등장 시 재평가).
- **D-4** (handoff §7): Dead `ssrcleartoshipprod` Cloud Function 삭제 권고 — Phase 0 외 별도 cleanup PR.

### 12.4 Memory Rules (active during Phase 0)
- `feedback_full_test_run.md` — Phase 0 가 schema 변경 0건이라 직접 적용 안 되지만, `pnpm -r test` 회귀 가드 (AC16 + AC17) 가 동일 정신.
- `feedback_review_model.md` — Phase 0 PR review 는 code-reviewer + security-reviewer 모두 Opus 4.7 강제 (인프라 변경이라 보안 surface 변화).
- `feedback_audit_core_ssot.md` — audit-core 변경 0건. SSOT 영향 없음.

---

**END OF PHASE 0 PRD — 본 문서는 design-only 이며 코드 변경을 포함하지 않습니다. Phase 2 Dispatch 단계에서 T-P0.NEXT-1~5 dispatch 후 1.0d 안에 Phase 0 머지 완료를 목표로 한다. Phase 1 (semgrep + osv-scanner) 은 본 PR 머지 직후 별도 PR 로 진입.**
