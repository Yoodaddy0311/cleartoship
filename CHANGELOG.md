# Changelog

이 파일은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/) 형식을 따릅니다.
버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

---

## [Unreleased] — Sprint 1 Hardening

### Added — Sprint 1 (2026-05-16)

- `functions/src/lib/enqueue-audit-task.ts` — Cloud Tasks enqueue logic extracted to shared helper; deterministic task name `audit-${runId}` guarantees idempotent enqueue across all callers
- vitest configs and test suites for `packages/shared-types` (29 tests), `packages/ui` (7 tests), and `functions` (6 tests) — 42 new unit tests total

### Changed — Sprint 1 (2026-05-16)

- `apps/web/app/audits/[id]/feature-graph/page.tsx` — `GraphCanvas` converted to `next/dynamic({ ssr: false })` with `Skeleton` fallback to eliminate LCP-blocking render (Lighthouse LCP improvement)
- `apps/web/package.json` — removed dead dependency `react-flow-renderer`; canonical graph library remains `reactflow ^11.11.4`
- `apps/web/app/api/audit-runs/route.ts` POST — `deployUrl` now validated via `validateDeployUrl()` before any Firestore write (server-side SSRF guard)
- `apps/web/lib/findings/getFinding.ts` — evidence sub-query capped at 200 documents; structured JSON warning emitted when cap is reached (pagination safety)

### Security — Sprint 1 (2026-05-16)

- `lib/validation/deploy-url.ts` — SSRF hardening extended to IPv4-mapped IPv6 notation (RFC 4291 §2.5.5.2); patterns such as `::ffff:c0a8:0101` now blocked alongside existing RFC 1918 / loopback / link-local rules

---

## [Unreleased] — Sprint 0 MVP

### Added — Phase 3.5 Fixes (24건)

1. `AuditCategory` 열거값을 `UPPER_SNAKE_CASE`로 통일 (shared-types)
2. `NormalizedFinding.evidences` 중복 제거 — 동일 `source+path+lineStart` dedup 로직 추가
3. Cloud Tasks task name 결정론적 생성 (`audit-{runId}`) — 멱등 enqueue 보장
4. OIDC 미검증 요청 거부 — `verify-oidc.ts` 미들웨어 삽입 (audit-worker)
5. `NODE_ENV !== 'production'` 시 OIDC 검증 자동 skip — 로컬 개발 편의
6. `AUDIT_WORKER_URL` / `AUDIT_WORKER_INVOKER_SA` 미설정 시 prod 에서 503 반환 (fail-closed)
7. Firebase 익명 인증(Anonymous Auth) gating — 미인증 요청에 401 반환 (API routes)
8. Firestore Storage rules path scoping — `/artifacts/{userId}/` 경로 이외 접근 차단
9. SSRF 방어 — `deploy-url` 검증: RFC 1918 / loopback / link-local 차단
10. `size-guard.ts` — Firestore 문서 크기 1MiB 초과 시 자동 청크 분할 저장
11. `getFindings` API — 페이지네이션 (`limit`/`startAfter`) 추가
12. `AuditRun.status` 전이 검증 — `PENDING→RUNNING→COMPLETED|FAILED` 순서 강제
13. `runPipeline` 에러 핸들러 — `markRunFailed` 호출 보장 (step 외부 크래시 대응)
14. Cloud Tasks `dispatchDeadline` 600초 설정 — 워커 timeout 정렬
15. Firestore `onAuditRunCreated` — 필수 필드(`ownerId`, `projectId`, `repoUrl`) 누락 시 enqueue skip
16. `AuditTaskPayloadSchema` Zod 검증 강화 — `runId` UUID 형식 체크
17. `workers/audit-worker` vitest 설정 + deterministic task name 단위 테스트 추가
18. `packages/audit-core` vitest 설정 + `calculate-scores`, `build-prd` 단위 테스트 추가
19. `apps/web` vitest 설정 + `deploy-url`, `size-guard` 단위 테스트 추가
20. Playwright E2E 설정 (`playwright.config.ts`) + golden-path / prd-upload / url-validation spec
21. `WorkerCtx.log` 시그니처 표준화 — structured JSON to stderr
22. `NormalizedEvidence.maskedValue` 필드 추가 — 시크릿 원문 저장 금지 정책 반영
23. `packages/audit-core/src/adapter.ts` — 어댑터 계약 `audit-core` 패키지로 이동 (web ↔ worker 공유)
24. `daily-cleanup` Cloud Function 추가 — 30일 이상 된 auditRun 자동 삭제

### Added — Phase 4 Verify Infrastructure

- Terraform IaC: GCP 프로젝트 부트스트랩 (APIs, SA, IAM, Tasks, Artifact Registry, Firestore, WIF)
- GitHub Actions `ci.yml` — PR 트리거: type-check / lint / test / Docker build
- GitHub Actions `deploy.yml` — `main` 푸시 트리거: WIF OIDC 인증 후 전체 배포
- 배포 스크립트 `infra/scripts/00-all.sh ~ 05-deploy-hosting.sh`
- `infra/README.deploy.md` — 배포 전체 runbook

### Changed

- `AuditCategory` 값 케이싱: `camelCase` → `UPPER_SNAKE_CASE` (breaking — shared-types)
- `audit-worker` OIDC 미들웨어 위치: 라우트 인라인 → `src/auth/verify-oidc.ts` 모듈 분리
- `AuditToolAdapter` 계약 위치: worker-local → `@cleartoship/audit-core` 공유 패키지

### Fixed

- Cloud Tasks 중복 enqueue 시 gRPC code 6 (ALREADY_EXISTS) 무시 처리 (idempotency)
- `evidence` 배열 Firestore 직렬화 오류 — undefined 필드 명시적 null 변환
- `getClientAuth` emulator 연결 시 `window` undefined 에러 (SSR 환경 guard 추가)
- `AuditRun` 생성 후 status가 `undefined`로 남는 버그 — 초기값 `PENDING` 명시

### Security

- Cloud Run `--no-allow-unauthenticated` 강제 — OIDC 없는 직접 호출 차단
- Workload Identity Federation (WIF) 설정 — GitHub Actions에서 SA 키 파일 불필요
- Firestore rules — 인증된 사용자 본인 데이터만 읽기/쓰기 허용
- Storage rules — `userId` 경로 스코핑으로 타 사용자 파일 접근 차단
- 익명 인증 gating — 로그인 없는 API 호출 전면 차단

---

[Unreleased]: https://github.com/your-org/ClearToShip/compare/HEAD
