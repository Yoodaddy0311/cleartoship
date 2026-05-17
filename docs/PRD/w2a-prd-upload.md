# W2-A: PRD Upload Feature

**Draft**: 2026-05-17 (w2a-planner, team-issue-45) · **Effort**: ~1.5d · **Status**: ⏳ → 🔄

## 1. 배경
- step19 `ANALYZE_PRD`(T2.1, Sprint 2 완료, `workers/audit-worker/src/pipeline/steps/04c-analyze-prd.ts`)는 현재 **clone된 repo 파일시스템** (README/CHANGELOG/docs/PRD.md 등)만 스캔. 사용자 제출 PRD 미소비.
- `AuditRunSchema.prdText`(`packages/shared-types/src/domain.ts:107`)는 이미 `z.string().nullable()`. `create-audit-run.ts:104~109`에 `validateDocumentSize` 200KB 안전망 존재 — schema/server 한도 기존.
- `/audits/new` UI 입력 통로 부재 → `request.prdText`는 항상 null. 본 작업은 (a) 입력→AuditRun.prdText 통로 개통 (b) 50KB UI cap (c) worker 병합까지 close.
- LLM 03-A: SEVERITY_LANGUAGE_KO(T1.4)와 묶인 항목으로 W2-A와 직접 의존 없음. LLM PRD 분석(T3.3)은 Phase 3 후속, 본 PRD의 `prdText` 통로를 재사용.

## 2. 목표 / 비목표
**목표**
- G1: `/audits/new`에서 PRD를 textarea paste 또는 `.md`/`.txt` 파일 업로드로 제출.
- G2: 클라/서버 양쪽 50KB cap (서버 추가 200KB 안전망 유지). 초과 시 inline error + 422.
- G3: plaintext로 `AuditRun.prdText` 저장, Firestore round-trip 무손실.
- G4: step19가 `ctx.prdText`를 파일시스템 후보와 병합하여 W1-A 클레임 매칭에 사용.
- G5: 신규 8+ tests, 기존 1461 tests PASS 유지.

**비목표**
- NG1: PDF/DOCX 파싱 (Phase 3). NG2: LLM 기반 PRD 추론(T3.3). NG3: PRD 버전 관리. NG4: 다국어 매처 변경.

## 3. UX 시나리오
1. `/audits/new` 진입 — 기존 `url-input-form.tsx`의 URL/Profile 셀렉터 아래 **"PRD (선택)" 섹션** 추가.
2. 섹션: `<textarea rows=6>` + `<input type="file" accept=".md,.txt">` "파일에서 가져오기" 버튼 (toggle 아님, 둘 다 가능, 파일 선택 시 textarea overwrite) + 글자 수 카운터 `(N / 50,000)` — 90% amber, 초과 red.
3. 파일 업로드 → client `FileReader.readAsText('utf-8')` → textarea dump. 파일 250KB 초과 또는 변환 후 50KB 초과 시 reject.
4. submit: 빈 PRD → `prdText: null` 정상 진행. 50KB 초과 → 클라 가드 + 서버 422.
5. 결과 페이지에 PRD UI 노출 없음(MVP). step19 산출물은 W2-C 클레임 매칭 finding으로만 표면화.

## 4. 설계
**Frontend** (`apps/web`)
- 신규 `components/audit-start/prd-input.tsx` — props `{ value, onChange, disabled? }`. plaintext만 다루며 sanitize 불요(React textContent). 50KB 초과 시 onChange는 호출하되 inline error 표시.
- 수정 `url-input-form.tsx` — `prdText` state + submit payload 포함. i18n key 4개 ko/en (`audit.prd.label`/`placeholder`/`fileButton`/`tooLarge`).

**Backend** (`apps/web/lib/audit-runs`)
- 수정 `create-audit-run.ts` — 신규 `PRD_TEXT_USER_MAX_BYTES = 50_000` + `PrdTextTooLargeError` custom Error. 기존 200KB 안전망(`PRD_TEXT_MAX_BYTES`) 그대로 유지 (defense in depth).
- 수정 `app/api/audit-runs/route.ts` — `PrdTextTooLargeError` → **422 Unprocessable Entity** + `{ error: { code: 'PRD_TEXT_TOO_LARGE', maxBytes: 50000, actualBytes: N } }`. 기존 `PerIpRateLimitError`/`DailyQuotaExceededError` 매핑 패턴 동일.

**Worker** (`workers/audit-worker`)
- 수정 `04c-analyze-prd.ts` `collectPrdAnalysis(clonePath, userPrdText?)` — ctx.prdText 비어있지 않으면 `analyzePrdText(userPrdText, 'user-prd-upload')` 후 `mergePrdAnalyses(parts)`에 추가.
- `runner.ts`에서 `ctx.prdText = run.prdText`가 이미 전달되는지 1차 grep — 누락 시 1 line 추가.

**Shared types**: 변경 없음. prdText는 이미 nullable string. shared-types full test run 불요.

## 5. 산출 파일

| 경로 | 종류 | 비고 |
|------|------|------|
| `apps/web/components/audit-start/prd-input.tsx` | 신규 | <50 lines 목표 |
| `apps/web/components/audit-start/prd-input.test.tsx` | 신규 | 4~6 tests |
| `apps/web/components/audit-start/url-input-form.tsx` | 수정 | PRD 섹션 통합 |
| `apps/web/components/audit-start/url-input-form.test.tsx` | 수정 | submit payload 검증 +1 |
| `apps/web/lib/audit-runs/create-audit-run.ts` | 수정 | 50KB cap + Error class |
| `apps/web/lib/audit-runs/create-audit-run.test.ts` | 수정 | 경계값/초과 +2 |
| `apps/web/app/api/audit-runs/route.ts` | 수정 | 422 매핑 +1 |
| `apps/web/lib/i18n/ko.ts` · `en.ts` | 수정 | 4 keys 각각 |
| `workers/audit-worker/src/pipeline/steps/04c-analyze-prd.ts` | 수정 | userPrdText 병합 |
| `workers/audit-worker/src/pipeline/steps/04c-analyze-prd.test.ts` | 수정 | 병합 검증 +1 |
| `workers/audit-worker/src/runner.ts` | 검증/수정 | ctx forwarding 확인 |
| `apps/web/e2e/prd-upload.spec.ts` | 검증/수정 | 기존 spec 갭 보완 |
| `cleartoship/docs/ROADMAP.md` | 수정 | Phase 2에 W2-A 행 추가 + ✅ |

## 6. 실행 계획
- **1a (병렬)** Frontend: prd-input + form 통합 + i18n + 컴포넌트 테스트 — frontend-developer, ~0.5d
- **1b (병렬)** Backend: 50KB cap + Error + route 422 + unit tests — backend-developer, ~0.3d
- **1c (병렬)** Worker: step04c 병합 + runner ctx 검증 + unit test — backend-developer, ~0.3d
- **2** E2E `prd-upload.spec.ts` 갭 보완 — e2e-runner, ~0.2d
- **3** code-reviewer 2명 Opus cross-check + ROADMAP 갱신 — reviewer + doc-updater, ~0.2d

총 ~1.5d. 1a/1b/1c 독립 → 단축 가능.

## 7. 위험
- **Markdown XSS**: 본 PRD 범위에 PRD 렌더 경로 없음. 향후 렌더 도입 시 dompurify/escape 강제 — ADR로 별도 기록.
- **DoS**: 50KB UI + 250KB 파일 + 200KB server + 1MB Firestore 4중 가드 + 기존 daily-quota / per-IP 동일 적용.
- **`''` vs `null` 일관성**: `request.prdText?.trim() || null`로 정규화 — null이 SSOT (step04c가 빈 문자열 분석 시 false-positive 방지).
- **Worker ctx 미전파**: runner.ts에서 `ctx.prdText = run.prdText` 사전 grep + 누락 시 패치, unit test로 회귀 잠금.
- **Test count drift**: 변경 패키지 audit-worker + apps/web → **full test run 필수** (`feedback_full_test_run.md`). shared-types 미변경 확인 후 skip 가능.
- **Encoding**: `FileReader.readAsText('utf-8')` 명시. 비ASCII 깨짐 시 inline error.

## 8. 수락 기준
- [ ] AC1: `prd.md` 파일 선택 시 1초 이내 textarea에 표시.
- [ ] AC2: 50,001 bytes 입력 → 클라이언트 submit 차단 + inline error.
- [ ] AC3: API 직접 호출 51KB → **422** + `{ code: 'PRD_TEXT_TOO_LARGE' }`.
- [ ] AC4: 빈 PRD 제출 → `AuditRun.prdText === null` Firestore round-trip OK.
- [ ] AC5: 정상 PRD → worker `ANALYZE_PRD` 로그 `sources`에 `user-prd-upload` 포함.
- [ ] AC6: E2E `prd-upload.spec.ts` 그린 (paste / 파일 / oversize reject 3+ 케이스).
- [ ] AC7: 기존 1461 PASS + 신규 8+ PASS (audit-worker + apps/web full run).
- [ ] AC8: ROADMAP.md Phase 2에 W2-A 행 추가 + ✅ + 변경 이력 1줄.
- [ ] AC9: code-reviewer 2명(Opus) APPROVE — `feedback_review_model.md` 준수.

---

## 가정 / 확인 필요
- **LLM 03-A 위치**: repo 내 명시 파일 미확인. T1.4(SEVERITY_LANGUAGE_KO)에 묶인 항목으로 추정 — W2-A와 직접 의존 없음.
- **`prd-upload.spec.ts` 기존 내용**: sprint3 handoff에 언급되지만 본 PRD 작성 시 미read — 실행 단계에서 갭 확인.
- **`/audits/new` 마운트 여부**: sprint3 handoff §2.4에서 "url-input-form.tsx 코드 존재하나 라우트 미마운트(Sprint 4 스코프)" 언급. 미마운트 상태라면 **page.tsx 마운트 0.2d 추가** 필요.
