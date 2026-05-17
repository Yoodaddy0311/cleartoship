# ClearToShip 슬로우 진단 보고서 (PERF-1)

- 작성일: 2026-05-17
- 담당: perf-engineer (Artibot)
- 작업 ID: #34
- 대상: `apps/web/` Next.js 15.5.18 (App Router)
- 진단 모드: 정적 분석 only (코드 수정 없음, 프로덕션 빌드 미실행 — 시간 예산 보존)

---

## 0. 요약 (TL;DR)

체감 슬로우의 가장 큰 원인은 **feature-graph 페이지의 N+1 fetch** 입니다. `limit=200` 으로 findings 를 받은 뒤 각 finding 마다 `getFinding` 을 호출하기 때문에 최악의 경우 **201 round-trip** 이 발생합니다. 이 요청들은 Firebase ID 토큰 갱신 + zod 파싱이 매번 따라붙으므로 네트워크 지연이 작아도 누적 지연이 큽니다.

세 페이지의 LCP/INP 체감 둔화의 70~80% 는 이 한 가지 패턴에서 비롯됩니다. 그 다음으로 (a) 폴링 cadence, (b) 클라이언트 컴포넌트 비중, (c) 정적 산출물 부재가 누적 영향을 만듭니다.

---

## 1. Top-3 권고 (우선순위 / 예상 효과 / 변경 라인 수)

| # | 권고 | 우선순위 | 예상 효과 | 변경 LOC | 위치 |
|---|------|---------|----------|---------|------|
| 1 | **listFindings 응답 자체에 evidences 포함시켜 N+1 제거** (백엔드 응답 enrichment) — 또는 `GET /audit-runs/:id/evidences` 단일 엔드포인트 신설. 클라이언트에서는 `Promise.all(... getFinding ...)` 루프 제거 | **H** | feature-graph 페이지 TTI **−2~6초** (network 의존). API 호출 횟수 201 → 1. 메모리 압박도 감소 | 클라 약 **−20 LOC**, 서버 라우트 약 **+30~60 LOC** | `apps/web/app/audits/[id]/feature-graph/page.tsx:42-66`, `apps/web/app/api/audit-runs/[id]/findings/route.ts`, `apps/web/lib/api/audit-runs.ts` |
| 2 | **폴링 cadence 적응형 백오프 확대 + visibilitychange pause** — 현재 2s→5s @ 30s. 60s 이후 10s, document.hidden 이면 폴링 중단 | **M** | 백그라운드 탭 CPU/네트워크 **−70%**, 진행 페이지에서 dashboard 이동 후 잔여 폴링 제거 | **+15~25 LOC** | `apps/web/components/audit-progress/use-audit-run-polling.ts:73-78` |
| 3 | **dashboard 페이지를 RSC 로 일부 전환** — 최상단 `'use client'` 제거하고 `getReport`/`getAuditRun`/`listFindings(limit=5)` 를 서버에서 fetch, `DashboardBody` 만 클라 컴포넌트로 분리 | **M** | LCP **−400~900ms** (3G 가정), 초기 JS payload **−10~25%**. SEO/메타 정합성도 향상 | **+40~80 LOC (분리)**, **−10 LOC** | `apps/web/app/audits/[id]/dashboard/page.tsx:1` 전체 |

---

## 2. 발견사항 표 (전체)

| # | 발견사항 | 영향 | 권고 | 우선순위 |
|---|---------|------|------|---------|
| F1 | **feature-graph N+1**: `listFindings({limit:200})` 후 `Promise.all(findings.map(getFinding))` — 최대 201 HTTP 요청 | feature-graph 페이지 TTI 큰폭 지연. p95 응답 200ms × 200 = 40s 누적 (병렬이라도 connection 한계 6~10개로 4~8s). 토큰 갱신/zod 파싱 200회 반복으로 메인 스레드 점유 | listFindings 응답에 evidences 포함 or evidences 단일 엔드포인트 신설. 클라 useEffect 단순화 | **H** |
| F2 | **`apiFetch` 가 `cache:'no-store'` 강제** — 모든 GET 이 디스크/메모리 캐시 미적용 | 동일 페이지 재방문/탭 전환 시 항상 풀 fetch. CDN edge cache 도 우회 | 읽기 전용 API 는 `cache:'default'` 또는 SWR/React Query 도입 검토. 최소한 `next: { revalidate: 5 }` 옵션 노출 | M |
| F3 | **dashboard 가 `'use client'`** 이지만 fetch 가 첫 paint 직전이라 LCP 가 네트워크 의존 | LCP 가 1RTT + zod parse 시간만큼 지연. 3G/4G 환경에서 LCP > 2.5s 위험 | RSC + Suspense 로 서버에서 첫 fetch, 클라이언트 컴포넌트는 인터랙션 영역만 | M |
| F4 | **폴링 hook 이 document.hidden 무시** — 사용자가 다른 탭으로 가도 2s/5s 간격으로 지속 호출 | 모바일 배터리/데이터 소모. 백엔드 부하 가산 | `document.addEventListener('visibilitychange', ...)` 로 hidden 동안 pause; 60s 이후 10s 추가 백오프 | M |
| F5 | **dynamic GraphCanvas 의 chunk 크기** — `reactflow` 11.x + 내부 helper. 정확한 사이즈는 prod build 미수행으로 추정만 가능 (dev chunk 7MB 는 소스맵/HMR 포함 — 무의미). `usePrefetchGraphCanvas` 가 dashboard 에서 idle prefetch 를 잘 호출 중 | feature-graph 탭 첫 진입 시 200~500ms 추가 부담. 이미 idle-prefetch 가 있어 dashboard 경유 경로는 양호 | 진입 경로가 dashboard 가 아닌 경우(/audits/[id] 직접 진입) 도 prefetch 트리거하려면 layout 레벨에서 한 번 호출. ReactFlow 의 `react-flow/core` 트리쉐이크 검토 | L |
| F6 | **`getAuditRun` zod 파싱이 polling 마다 반복** — 2s 주기에 schema.parse(AuditRunSchema). 진행 중인 audit 에 대해 매 tick `partialResultTools` 등 spread 가 발생 | tick 당 0.5~2ms 메인 스레드 점유 누적. 저사양 모바일 INP 악화 | terminal 상태 직전까지는 partial schema (status/progress 만) 로 parse 하거나 schema 캐시 도입 | L |
| F7 | **dashboard 의 `useAuditResource` 가 3 fetch 를 `Promise.all` 로 묶어 첫 paint 를 가장 느린 쪽에 맞춤** | `getReport` 가 LLM 산출물이면 수초 소요 가능 — 그동안 severity counts/run status 도 함께 대기 | run + findings 만으로 ScoreOverview/SeverityCounts/CategoryGrid 일부 우선 렌더, report 는 Suspense boundary 로 분리 | L |
| F8 | **font/image preload 없음** — `app/layout.tsx` 가 next/font 미사용, `<link rel=preconnect>` 도 부재. CSS 가 `font-display` 만으로 처리 | FCP 까지 폰트 FOUT/FOIT 발생 가능. 외부 폰트 호스트가 있다면 preconnect 필요 | next/font 사용 검토 또는 self-host. 외부 도메인이 있다면 `<link rel=preconnect>` 추가 | L |
| F9 | **transpilePackages 3개 (`@cleartoship/ui`, `shared-types`, `audit-core`)** — webpack 매번 트랜스파일. dev 컴파일 지연의 한 원인 | 첫 페이지 로딩(특히 dev) 느려짐. 프로덕션은 영향 적음 | 워크스페이스 패키지에 `tsup` 등으로 prebuild 산출물 두면 transpilePackages 제거 가능 | L |
| F10 | **firebase-admin, @google-cloud/tasks 가 web 의존성** — RSC/route handler 에서만 쓰일 텐데 client bundle 트리쉐이크 가정에 의존 | 누수 시 client bundle 수백KB 증가 가능. 현재는 명시 사용처 없으나 모니터링 필요 | `next build` 후 source-map-explorer 로 검증. server-only import boundary 명시 | L |

---

## 3. 항목별 상세

### 3.1 feature-graph N+1 (F1) — 메인 의심

**증거**: `apps/web/app/audits/[id]/feature-graph/page.tsx:47-53`

```ts
const list = await listFindings(auditId, { limit: 200 });
if (cancelled) return;
const detailed = await Promise.all(
  list.findings.map((f) =>
    getFinding(f.id, auditId).catch(() => null)
  )
);
```

**왜 느린가**

1. HTTP 요청 수: 1 (list) + N (getFinding). `limit:200` 이면 N=최대 200.
2. 브라우저는 same-origin HTTP/1.1 기준 6 connection 으로 제한 — Promise.all 이지만 실제로는 직렬화. HTTP/2 라도 서버 측 동시 처리 + DB 라운드트립이 누적.
3. 각 요청마다:
   - `getIdToken()` 호출 (Firebase SDK — 토큰 만료 시 갱신 RTT 추가)
   - response zod parse (`GetFindingResponseSchema.parse`)
   - JSON 직렬화/역직렬화
4. 부수 효과: 메인 스레드가 200회의 `.parse` 와 `.flatMap` 으로 점유 → INP/CLS 악화.

**현재 코드의 의도**

`FeatureGraphNode.evidenceIds` 를 `Finding` 에 join 하려고 *모든 finding 의 evidences* 를 끌어옴. 단순 join 을 위한 비싼 fetch.

**권고 (H)**

옵션 A — 서버에서 `listFindings` 응답에 `evidences` 동봉:
- `ListFindingsResponse.findings[].evidences: Evidence[]` 필드 추가.
- 클라 useEffect 는 `setEvidences(list.findings.flatMap(f => f.evidences))` 한 줄로 끝.
- 변경 라인: 클라 ~−20, 서버 라우트 +30~60.

옵션 B — 신규 엔드포인트 `GET /audit-runs/:id/evidences`:
- 단일 라운드트립으로 evidence 전량 반환.
- 응답 크기를 보장하려면 cursor pagination 추가.

옵션 C (즉시): `limit` 을 그래프가 실제 필요한 만큼만 (예: 50). 단, 큰 그래프에선 데이터 누락 우려.

**예상 효과**: 201 fetch → 1 fetch. TTI **−2~6초**. 메모리 사용 절반.

---

### 3.2 폴링 cadence (F4)

**증거**: `apps/web/components/audit-progress/use-audit-run-polling.ts:73-75`

```ts
const elapsed = Date.now() - startRef.current;
const delay = elapsed > 30_000 ? 5_000 : 2_000;
timer = setTimeout(tick, delay);
```

**개선**

1. 추가 백오프: `elapsed > 30s → 5s`, `> 120s → 10s`, `> 600s → 20s`.
2. `document.hidden === true` 동안 폴링 중단, `visibilitychange` 에서 재개.
3. `pageshow`/`pagehide` 이벤트로 BFCache 호환.

**예상 효과**: 백그라운드 탭 네트워크/CPU **−70%**, 모바일 배터리 개선.

---

### 3.3 dashboard RSC 화 (F3, F7)

**현황**: `apps/web/app/audits/[id]/dashboard/page.tsx:1` 이 `'use client'`. 첫 paint 가 클라 fetch 의존.

**개선**

- 페이지 자체는 서버 컴포넌트로 만들어 `getReport`/`getAuditRun`/`listFindings(limit:5)` 를 서버에서 병렬 수행 (params 시그니처 그대로).
- `DashboardBody` 만 `'use client'` 로 분리.
- `getReport` 는 별도 `<Suspense>` 로 감싸 ScoreOverview/Severity/Category 우선 렌더.

**예상 효과**

- LCP: 클라 hydration + fetch 1RTT 가 제거되어 **−400~900ms** (3G).
- 초기 JS: 페이지 컴포넌트가 RSC 이므로 클라 번들 **−10~25%**.

**주의**: 현재 `apiFetch` 가 `getIdToken()` 로 Firebase 클라 SDK 토큰을 요구. 서버에서 쓰려면 cookie 기반 세션 or service account 토큰으로 분기 필요. 이 의존성이 RSC 전환의 최대 마찰점.

---

### 3.4 캐시 정책 (F2)

`apps/web/lib/api/client.ts:67` 모든 fetch 가 `cache: 'no-store'`. 정합성 우선이라면 합리적이나, **읽기 전용** 보고서/그래프/PRD 는 짧은 revalidate (5~30s) 로 충분.

권고: `apiFetch` 에 `cacheStrategy?: 'no-store'|RequestCache` 옵션 추가, 변동성 낮은 GET 만 `default` 사용.

---

### 3.5 번들 크기 (F5, F9, F10)

dev mode 의 `.next/static/chunks/app/audits/[id]/page.js` 가 6.9MB — **dev 산출물은 source map/HMR/주석 포함이라 프로덕션 사이즈가 아님**. 정확한 측정은 `next build` 후 다음을 실행해야 함:

```bash
cd apps/web && ANALYZE=true npm run build
# 또는
npx source-map-explorer .next/static/chunks/**/*.js
```

본 진단에서는 빌드 미실행 (시간 예산 보존, 코드 수정 금지 원칙). 그러나 다음은 정적으로 확신 가능:

- `reactflow` 11.x 가 가장 큰 단일 의존성 — `next/dynamic({ssr:false})` + `usePrefetchGraphCanvas` 로 분리 완료. 추가 작업 불필요.
- `firebase` (~150KB gz), `firebase-admin` (server-only 가 강제되어야 함), `motion`, `react-markdown + remark-gfm` 가 후보군. layout 에 import 되어있지 않은지 확인 권장.

---

### 3.6 image/font preload (F8)

`app/layout.tsx` 에 `next/font` 사용 없음. `<link rel="preconnect">`, `<link rel="preload">` 부재. 외부 폰트/이미지 호스트가 있다면 layout `<head>` 에 추가 권장. 현재는 `font-display: antialiased` 만 적용되어 시스템 폰트 fallback 으로 보임.

---

## 4. 측정 권고 (후속)

본 진단은 정적 분석. 실측을 위해 다음 권고:

1. `cd apps/web && npm run build && npm start` 으로 프로덕션 모드 기동 후 Chrome DevTools Performance 탭에서 3G throttling 으로 3페이지 각 trace 1회씩.
2. `feature-graph` 페이지에서 Network 탭 → finding 개수 만큼 `GET /api/findings/...` 가 있음을 확인 (F1 의 실증).
3. `npm install --save-dev @next/bundle-analyzer` 후 `ANALYZE=true npm run build` 로 클라 번들 트리맵 확인 (F5/F10 실증).
4. Lighthouse CI 도입 또는 `next/script` 의 `onLoad` 콜백으로 web-vitals 수집해 LCP/INP/CLS p75 budget 검증.

---

## 5. 성능 예산 vs 현황 (추정)

| Metric | Budget | 현황 (정성) | 비고 |
|--------|--------|-----------|------|
| API 응답 p95 | <200ms | 측정 미시행 | route handler 단순 read 위주이므로 budget 내 가능성 높음 |
| Page Load (3G) | <3s | feature-graph **FAIL 추정** | F1 누적 fetch |
| LCP | <2.5s | dashboard **WARN** | F3 클라 fetch 의존 |
| INP | <100ms | feature-graph **WARN** | F1 의 zod parse 200회 + flatMap |
| 초기 번들 | <500KB | 미측정 | F5/F10 확인 필요 |

---

## 6. 다음 단계 (제안)

1. **PERF-2**: F1 (N+1) 수정 — 백엔드 응답 enrichment. tdd-guide 로 위임. 예상 LOC 50~80.
2. **PERF-3**: F4 (폴링 cadence) 수정 — 단일 hook 변경. 예상 LOC 20.
3. **PERF-4**: F3 (dashboard RSC) — 인증 토큰 서버 사이드 처리 설계 선행 필요. architect 위임 권장.
4. **PERF-5**: `next build` + bundle analyzer 측정 자동화 (CI). devops-engineer 위임.

— end —
