# PRD — Serena-inspired LSP Backbone for Code Inspection

**작성일**: 2026-05-21
**저자**: planner (with leader review)
**상태**: DRAFT v2 — 4명 critical review 반영 (plugin-architect / confidence-typer / quality-reviewer / ux-designer)
**관계**: `audit-quality-framework-2026-05-21.md`의 §D plug-in 구조 + §A.2 vibe-coding 검사 8개의 **정확도 backbone**

---

## v2 변경 요약 (CUT / MODIFY / ADD)

| 항목 | 결정 | 출처 |
|---|---|---|
| Phase 5 (Memory cache) | **CUT → Phase Y (deferred, 6주 dogfood 후 재평가)** | plugin-architect |
| Phase 6 (Python LSP) | **CUT → Phase Z (deferred, Phase 8+)** | plugin-architect |
| Option D (전체 트랙) | **DELETE** | plugin-architect |
| `CheckContext.lspClient` 노출 | **CUT** → data-only `state.lspAnalysis` 결과만 | plugin-architect |
| P3 + P4 plug-in 통합 | **MODIFY** → 별도 step `RUN_LSP_ANALYSIS`로 묶기 | plugin-architect |
| P2 SymbolInventory | **MODIFY** → TS/JS only 명시 + `byFile` tree + `summary` field | plugin-architect + confidence-typer |
| P1 동시성 모델 | **MODIFY** → max-instances ≥2, 768MB cap, RSS 로깅 | plugin-architect + confidence-typer |
| L1 LSP client lib | **MODIFY** → `vscode-jsonrpc` (lightweight) | plugin-architect |
| LSP +0.5 confidence | **MODIFY** → +0.35 보수적 시작, 측정 후 상향 | quality-reviewer |
| Tree-sitter 검토 | **ADD** → §1.3 "parsing-only → ❌" 한 줄 | confidence-typer |
| §7.5 UX Surfacing Plan | **ADD** (신설 섹션) | ux-designer |
| 프레임워크 coverage matrix | **ADD** (§1.4) | plugin-architect |
| Serena `symbol_overview` / `type_hierarchy` | **ADD** to P2 / P4 | plugin-architect |
| Severity mapping table (LSP 1-4 → P0-P3) | **ADD** to P4 | confidence-typer |
| dead code `referenceContext` + actionHint | **ADD** to P3 | ux-designer + quality-reviewer |
| V1 hallucinated 3-case 분류 | **ADD** to P3 (FP 방지) | quality-reviewer |
| V3 `as any` suppress 조건 | **ADD** to P4 | quality-reviewer |
| L6 미해결 결정 (decorator/DI/eval recall) | **ADD** | quality-reviewer |
| Coverage Disclaimer 보강 | **ADD** | quality-reviewer |

---

## 0. Executive Summary

ClearToShip audit이 "코드 검사"라고 부르지만 사실 **file-glob + regex + 부분 AST** — Symbol-level navigation, cross-reference 추적, type-aware diagnostics 없음. semgrep (Phase 1 PR #38) 머지 후에도 LSP semantic 분석은 부재. vibe-coding 특화 위험 (hallucinated imports, type safety, missing auth, dead code) 정확 감지에 LSP 필수.

[Serena MCP](https://github.com/oraios/serena)는 LSP 추상화로 40+ 언어를 grep precision이 아닌 **IDE precision**으로 분석. 우리 audit이 이 패턴을 채택하면:

| 위험 | 현재 감지 | Serena 패턴 적용 후 |
|---|---|---|
| V1 hallucinated imports | regex (FP 많음) | LSP resolution 실패 + 3-case 분류 |
| V3 `any` 남용 | 단순 count | LSP diagnostic + suppress 조건 적용 |
| V6 missing auth middleware | route AST | handler chain `type_hierarchy` |
| V8 N+1 query | AST 패턴 매칭 | callee 그래프 + ORM call 추적 |
| Dead code | 없음 | symbol export + zero refs + `referenceContext` |
| Unused imports | 없음 | LSP unused-imports diagnostic |
| Cross-file 정합성 | 없음 | find_references |

**가장 빠른 effective 시작**: Phase 1+2 (~2주) — LSP infra + symbol inventory. 후속 plug-in이 자동으로 IDE precision 활용.

---

## 1. 배경 — Serena MCP 분석

### 1.1 Serena MCP 핵심 강점

- **LSP 추상화** — typescript-language-server / pyright / 등 40+ 언어 LSP를 단일 인터페이스로 노출
- **Symbol-level navigation** — `find_symbol`, `find_referencing_symbols`, `find_declaration`, `type_hierarchy`, `symbol_overview`
- **Semantic search vs grep** — false positive 감소, 동적 import 추적
- **Memory + project context** — 세션 간 지식 공유, YAML 다층 설정
- **Symbol-level editing** (audit엔 무관) — atomic refactoring

### 1.2 우리 audit과의 Gap

| 측면 | 현재 ClearToShip | Serena | Gap |
|---|---|---|---|
| Symbol resolution | 부분 AST (PR-A3 route만) | LSP (function/class/var/import) | 🔴 큼 |
| Cross-reference (caller/callee) | 없음 | find_references | 🔴 큼 |
| Type-aware 분석 | 없음 | LSP + diagnostics | 🔴 큼 |
| Dead code detection | 없음 | symbol_overview + refs | 🔴 큼 |
| 동적 import 추적 | regex | LSP resolution | 🔴 큼 |
| 다중 언어 | TS/JS 위주 | 40+ | 🟡 중 |
| Project memory | `.claude/memory/` 있음 | YAML config | 🟡 활용 부족 |

### 1.3 채택 전략 — 자체 LSP infra vs Serena를 dep으로

| 옵션 | 장점 | 단점 | 결정 |
|---|---|---|---|
| A. Serena MCP를 worker dep으로 추가 | 빠른 시작, 40+ 언어 즉시 | worker process spawn 무거움, audit 도구 독립성↓ | ❌ |
| **B. 자체 LSP infra (Serena 패턴만 채택)** | control 가능, 운영비 절감 | 구현 시간 ↑ | ✅ |
| C. hybrid (dev = Serena, prod = LSP 직접) | 양쪽 장점 | 운영 복잡 | 후속 |
| D. Tree-sitter만 사용 (no LSP) | 가볍고 빠름 | **parsing-only, semantic resolution 불가** → V1/V3/V6 핵심 분석 불가 | ❌ |

**채택**: B. `vscode-jsonrpc` (lightweight) 위에 typescript-language-server 직접 spawn, JSON-RPC로 통신.

### 1.4 프레임워크 LSP coverage matrix (v2 신규)

| 프레임워크 / 언어 | Phase 1-2 (인벤토리) | Phase 3-4 (cross-ref + type) | 비고 |
|---|---|---|---|
| TS / JS (strict) | ✅ Full | ✅ Full | Phase 1 ICP |
| TS / JS (loose / no tsconfig) | ✅ Partial | 🟡 Partial | strict 강제 override 적용 |
| Next.js App Router | ✅ Full | ✅ Full | `'use client'` boundary는 별도 처리 |
| Next.js Pages Router | ✅ Full | ✅ Full | PR-A3 route AST 활용 |
| SvelteKit | 🟡 Partial | 🟡 Partial | `+page.server.ts` 분리 필요 |
| Vue (SFC) | 🟡 Partial | 🟡 Partial | `<script>` 블록만 LSP 인식 — Phase 7+ Volar |
| Svelte (SFC) | 🟡 Partial | 🟡 Partial | svelte-language-server, Phase 7+ |
| Astro | ❌ | ❌ | Phase 7+ |
| Express / Fastify (dynamic routing) | ✅ Partial | 🟡 Partial | dynamic dispatch 한계 |
| FastAPI / Django (Python) | ❌ | ❌ | **Phase Z (deferred)** |
| Rust / Go | ❌ | ❌ | Phase 8+ |

ICP는 Next.js / Vite + TS strict. Phase 1-4는 이 범위에서 효과 극대.

---

## 2. PHASE 1 — LSP Infrastructure (Foundation)

**Objective**: TypeScript Language Server를 worker에서 spawn + JSON-RPC 통신 + lifecycle 관리

**Tasks**:
- `workers/audit-worker/src/lsp/client.ts` (NEW) — LSP client class 위 `vscode-jsonrpc` 사용 (lightweight, ~30% smaller than `vscode-languageserver-protocol`)
- `workers/audit-worker/src/lsp/typescript-server.ts` (NEW) — typescript-language-server spawn + initialize/didOpen/shutdown lifecycle
- `workers/audit-worker/src/lsp/lsp-client-interface.ts` (NEW) — `LspClient` 인터페이스 + `capabilities(): ServerCapabilities` 메서드 (graceful skip 지원)
- `workers/audit-worker/src/lsp/types.ts` (NEW) — Symbol/Position/Range zod schema
- `workers/audit-worker/Dockerfile` — `typescript-language-server@4.x` + `typescript@5.x` 버전 pin (PR #38 semver 패턴)
- `workers/audit-worker/scripts/smoke-tools.sh` — `typescript-language-server --version` 검증 추가
- `.github/workflows/deploy.yml` smoke step — 5번째 도구 검증

**v2 추가 — 동시성 모델 (plugin-architect + confidence-typer)**:
- **Cloud Run scaling**: `min-instances=0`, `max-instances≥2` (audit 동시 5건 시 4-5GB 소요 → instance 분리)
- **Per-audit memory budget**: `--max-old-space-size=768` 하드 캡 (Node 부모 200MB + LSP 600-900MB 가능성)
- **RSS 모니터링**: `process.memoryUsage()` 매 step 종료 시 로깅, threshold 초과 시 graceful shutdown

**Depends on**: 없음 (Phase 1 PR #38과 무관, 별 트랙)

**Risk + Mitigation**:
| Risk | Mitigation |
|---|---|
| LSP cold start ~3-5s | per-audit single instance + clone-repo step에서 warm-up. 5분 timeout. |
| 큰 repo에서 메모리 폭주 | 768MB hard cap + RSS 로깅. Cloud Run max-instances ≥2. |
| typescript-language-server install 시간 ~20MB | Dockerfile build cache layer. |
| TS 6.x ESM-first 파괴적 변경 | 4.x + TS 5.x로 버전 pin (Dockerfile) |

**Verify**: smoke test에서 LSP server 응답 + RSS < 768MB. mock LSP server unit test.

**추정**: 1주

---

## 3. PHASE 2 — Symbol Inventory Step

**Objective**: 새 pipeline step — repo의 모든 symbol (function/class/component/import) 인벤토리 구축. **TS/JS only** — Vue/Svelte/Astro는 Phase 7+.

**Tasks**:
- `workers/audit-worker/src/pipeline/steps/20-symbol-inventory.ts` (NEW) — LSP `textDocument/documentSymbol` 모든 파일 호출
- `packages/shared-types/src/symbol-inventory.ts` (NEW) — `SymbolInventorySchema` zod 확장
- `packages/audit-core/src/symbols/extract-symbols.ts` (NEW) — LSP response → SymbolInventory 변환
- `packages/audit-core/src/symbols/extract-symbols.test.ts` — fixture 기반 unit test
- `workers/audit-worker/src/pipeline/steps/index.ts` — `state.symbolInventory` 신규 필드 + AUDIT_STEPS 삽입 (index 15, RUN_CHECK_PLUGINS 직전)
- `packages/shared-types/src/domain.ts` — `AuditReportSchema.symbolInventory` optional 추가
- Firestore writer 확장

**v2 SymbolInventorySchema (확장)**:
```typescript
const SymbolInventorySchema = z.object({
  // 전체 합산 (LLM context 폭주 방지 — confidence-typer §AXIS 2)
  summary: z.object({
    totalFunctions: z.number(),
    totalClasses:   z.number(),
    totalComponents: z.number(),
    totalImports:   z.number(),
    topModules:     z.array(z.string()).max(20),  // hot files
  }),
  // 전체 인벤토리
  functions:  z.array(SymbolSchema),
  classes:    z.array(SymbolSchema),
  components: z.array(SymbolSchema),
  imports:    z.array(ImportSchema),
  // v2 — Serena symbol_overview 패턴 (plugin-architect)
  byFile: z.record(z.string(), z.object({
    filePath: z.string(),
    tree: z.array(SymbolTreeNodeSchema),  // per-file symbol tree
  })),
});
```

**v2 budget 조정 (confidence-typer)**:
- `budget.maxFiles` default 500 (1000 → 500), config로 override 가능
- 파일 선택 우선순위: `src/`, `app/`, `pages/`, `lib/` → 그 외 → `node_modules/.git/dist/build` 제외

**Depends on**: Phase 1

**Risk + Mitigation**:
| Risk | Mitigation |
|---|---|
| 큰 repo (10K+ files) 시간 폭주 | `budget.maxFiles=500` cap + 파일별 timeout 2s |
| JS/JSX symbol 누락 | LSP가 `*.js` / `*.jsx`도 처리 (config) |
| monorepo 다중 tsconfig | workspace root 자동 감지 + sub-project별 initialize |
| Vue/Svelte SFC `<script>` 외 누락 | Phase 7+ 별도 server (Volar / svelte-language-server) — Phase 2 범위 외 |

**Verify**: cleartoship 자가 audit에서 `state.symbolInventory.summary.totalFunctions > 500`. `byFile` tree가 UI RepoTreeView (§F)에 그대로 전달 가능.

**추정**: 1주

---

## 4. PHASE 3+4 — LSP Analysis Step (v2 통합)

**v2 변경 (plugin-architect)**: 기존 Phase 3 (cross-ref plug-in) + Phase 4 (diagnostics plug-in)를 **별도 step `RUN_LSP_ANALYSIS`로 묶음**. 이유:
- plug-in의 30s timeout 안에 `find_references` per-symbol 5s × 100 symbol = 500s 못 끝냄
- plug-in이 LSP server crash 시키면 다른 plug-in 줄도산 위험
- plug-in 정신모델 = "데이터 함수" 유지, LSP 복잡도는 worker step에 격리

**Objective**: LSP cross-reference + type-aware diagnostics 일괄 수행 → `state.lspAnalysis`에 결과 저장. plug-in은 결과만 ctx에서 read-only로 소비.

**새 step 위치**: AUDIT_STEPS 인덱스 16 (`SYMBOL_INVENTORY` 다음, `RUN_CHECK_PLUGINS` 이전)

**Tasks**:
- `workers/audit-worker/src/pipeline/steps/21-run-lsp-analysis.ts` (NEW) — `find_references` + diagnostics 일괄 수집
- `packages/shared-types/src/lsp-analysis.ts` (NEW) — `LspAnalysisSchema` zod (references map, diagnostics, type_hierarchy)
- `packages/audit-core/src/symbols/reference-graph.ts` (NEW) — caller/callee 그래프 빌더
- `packages/audit-core/src/symbols/diagnostics.ts` (NEW) — LSP diagnostic → NormalizedFinding 변환
- `packages/audit-core/src/symbols/dynamic-dispatch-detector.ts` (NEW, v2 — quality-reviewer) — `obj[methodName]()`, `EventEmitter.emit`, dynamic routing 패턴 감지

**LSP severity → audit Severity mapping (v2 신규, confidence-typer)**:
| LSP severity | LSP enum | audit Severity | 비고 |
|---|---|---|---|
| 1 | Error | **P0** | 컴파일 차단급 |
| 2 | Warning | **P1** | strict mode 위반 |
| 3 | Information | **P2** | suggestion |
| 4 | Hint | **P3** | hint (auto-fix 가능) |

→ `confidenceFactors.ast` 가중치 연동: P0/P1은 `ast=0.4`, P2/P3는 `ast=0.2`.

**Plug-in 4개 (`RUN_CHECK_PLUGINS` 단계에서 ctx.lspAnalysis read-only 소비)**:
- `quality.dead-code.check.ts` (v2 — ux-designer + quality-reviewer)
- `frontend.hallucinated-imports.check.ts` (v2 — quality-reviewer 3-case 분류)
- `frontend.any-overuse.check.ts` (v2 — quality-reviewer suppress 조건)
- `quality.unused-imports.check.ts`

### v2 Dead code precision (quality-reviewer + ux-designer)

zero-references → dead 판정에 다음 enum 추가:
```typescript
const ReferenceContextSchema = z.enum([
  'truly-dead',              // 진짜 unused (confidence: HIGH)
  'dynamic-import-suspected', // dynamic import 패턴 발견 (MEDIUM)
  'reflection-suspected',     // obj[methodName] 패턴 (MEDIUM)
  'test-only',                // *.test.ts / __tests__ 내에서만 ref (LOW)
]);
```

**Confidence floor**:
- `truly-dead` = HIGH 가능
- `dynamic-import-suspected` / `reflection-suspected` = max MEDIUM
- `test-only` = max LOW

**Dead code finding `actionHint`**:
```typescript
{
  steps: [
    "1. `git log -S 함수명` 으로 과거 사용처 확인",
    "2. 별도 브랜치에서 삭제 후 CI dry-run",
    "3. CI 통과 시 git rm + PR",
  ],
  revertHint: "걱정되면 새 브랜치에서 1주 관찰 후 main merge",
  estimatedMinutes: 5,
}
```

### v2 V1 hallucinated imports 3-case 분류 (quality-reviewer)

LSP resolution 실패 → confidence 분류:
| 케이스 | 조건 | Confidence |
|---|---|---|
| (a) **확정 hallucinated** | `package.json`에 패키지 없음 + LSP 실패 | HIGH |
| (b) **tsconfig 문제** | `package.json`에 있음 + LSP 실패 | LOW + suppress 후보 + "tsconfig/workspace 설정 문제 가능성" |
| (c) **conditional / optional peer** | `import type` 또는 try/catch 안 | LOW + suppress 후보 |

### v2 V3 `as any` 자동 suppress 조건 (quality-reviewer)

다음 패턴은 confidence LOW + suppress 후보:
- `// eslint-disable` 또는 `// @ts-ignore` 바로 위
- 파일명에 `adapter`, `shim`, `compat`, `legacy` 포함
- 외부 `node_modules` 타입 없는 패키지 import 직후

audit-quality-framework §B.3의 `.cleartoshipignore`와 연동.

### v2 type_hierarchy 추가 (plugin-architect)

V6 `missing-auth-middleware` check가 handler 타입의 `type_hierarchy`를 따라 middleware decorator/wrapper 추적. 새 helper:
- `packages/audit-core/src/symbols/type-hierarchy.ts` (NEW) — `LspClient.typeHierarchy(symbol)` wrap

**Depends on**: Phase 2 + audit-quality-framework PRD §D plug-in foundation

**Risk + Mitigation**:
| Risk | Mitigation |
|---|---|
| `find_references` 가 큰 repo에서 30s+ | per-symbol timeout 2s + max 100 symbol resolve, top-level export 우선 |
| dynamic dispatch FP | `dynamic-dispatch-detector.ts` + confidence floor MEDIUM |
| eval / decorator / DI recall 한계 | L6 (§11) 미해결 + Coverage Disclaimer 명시 |
| LSP server crash | step-level isolation, soft skip + N/A (L5 패턴) |

**Verify**: cleartoship에서 `hallucinated-imports` 0건, 의도적 fake import 추가 시 (a)로 감지. dead code finding이 `referenceContext` 명시.

**추정**: 2-3주

---

## 5. PHASE Y — DEFERRED — Project Memory Layer (재평가 후)

**상태**: ⏸ **CUT from Phase 1 cycle** (plugin-architect critical review)

**이유**: per-audit 재실행 빈도 데이터 없는 상태에서 cache infra 먼저는 over-engineering. Phase 1-4 dogfood 6주 후 `commitSha` 재방문률 metric 확보 → 그때 재평가.

**저장소 결정 변경 (confidence-typer)**: Firestore (1MB 문서 상한 + 비용 불리) → **Cloud Storage GCS** (크기 무제한, GB당 $0.02/월). 단, 단일 audit run 내 cache는 **in-memory** (Cloud Run instance 내부)로 최적.

**재평가 트리거**:
- Phase 1-4 머지 후 6주 dogfood
- `commitSha` 재방문률 ≥ 20%
- LSP step wall-clock 평균 ≥ 60s

---

## 6. PHASE Z — DEFERRED — Multi-language Support (Python / Rust / Go)

**상태**: ⏸ **CUT to Phase 8+** (plugin-architect critical review)

**이유**: ICP가 Next.js/JS 중심. pyright 추가 = +~150MB image + +400MB runtime memory + 동시성 모델 재계산. Phase 1-4 측정 metric 확보 후 진행.

**미해결 결정 (L7)**: Phase Z 진입 조건 — Python audit 요청 비율 ≥ 15% 또는 enterprise customer 명시 요구.

---

## 7. RISKS — 종합

| Severity | 항목 | Mitigation |
|---|---|---|
| HIGH | LSP cold start + memory footprint | per-audit single instance + 768MB cap + max-instances ≥2 |
| HIGH | typescript-language-server가 monorepo / 큰 codebase에서 hang | per-symbol timeout 2s + 전체 step 10min cap |
| HIGH | LSP +0.5 confidence 가중치 baseline 없음 | **v2 — +0.35로 보수적 시작, Phase 1-2 후 측정 baseline 확보 후 상향** (quality-reviewer) |
| MED | Phase 1 PR #38과 의존 충돌 | Phase Z (Python)만 의존, 1-4는 독립 진행 |
| MED | LSP diagnostic 결과 noise (deprecated API 등) | confidence LOW로 자동 down-rank + suppress 조건 |
| MED | dynamic dispatch / decorator / DI / eval recall 한계 | v2 — `referenceContext` enum + Coverage Disclaimer (§7.6) |
| MED | 사용자가 LSP 분석을 무겁다고 느낌 | 별도 step 명시 + Phase Y cache (deferred) |
| LOW | LSP 자체 의존성 버전 drift | semver pin (TS 5.x + tsl 4.x) |

### 7.5 UX Surfacing Plan (v2 신설 — ux-designer)

LSP 분석 결과가 **사용자에게 보이지 않는 인프라**로 끝나지 않도록:

**Dashboard 노출**:
- "LSP 분석 완료 — N개 symbol 인덱싱" chip (ScoreOverview 상단)
- Categories 페이지에 "LSP-derived findings (N건)" 별도 섹션

**신규 페이지 `/audits/{id}/symbols` — Symbol Explorer**:
- 좌측: `byFile` tree (RepoTreeView 컴포넌트 재사용)
- 중앙: 선택한 symbol의 reference graph (React Flow)
- 우측: dead code = 🪦 icon overlay, finding deep-link

**Finding 상세 panel — dead code action UX (ux-designer)**:
- `referenceContext` 뱃지 표시 ("truly-dead" / "dynamic-import-suspected" / "reflection-suspected" / "test-only")
- `actionHint.steps` 단계 가이드 렌더
- `actionHint.revertHint` 안전망 표시

**Confidence 라벨 한국어화 (ux-designer)**:
- LSP-derived = "코드 자동완성 수준의 정확도" tooltip
- `D` origin + `HIGH` confidence: "TypeScript 컴파일러가 직접 검증한 결과"

**Dual-origin UX (v2 — ux-designer)**:
audit-quality-framework §E의 `OriginBadge` mixed enum 세분화:
- `mixed` → `dl-consensus` (LSP+LLM 동의) / `dl-conflict` (둘 다른 결론)
- `dl-consensus` = `very-high` confidence + ⭐⭐ count
- `dl-conflict` = `low` confidence + ⚠️ 강조

**Visualization 통합 (§F Phase G와)**:
- `state.symbolInventory.byFile` → `feature-graph/adapter.ts`로 직접 흐름
- 큰 repo (500+ functions) cluster-by-module 자동 폴딩
- "이 함수 시각화" deep-link from finding detail → graph node hover

### 7.6 Coverage Disclaimer (v2 — quality-reviewer)

PartialResultBanner 또는 audit Result 페이지에 명시:
> **LSP 분석 한계**
> - decorator/DI 프레임워크 (NestJS, Angular) 사용 시 dead code false positive 증가
> - dynamic dispatch (`obj[methodName]()`), `eval()`, dynamic `import()`로 호출되는 심볼은 LSP가 추적 못 함 — `referenceContext` 뱃지 확인 필수
> - monorepo workspace 설정이 불완전하면 hallucinated import false positive 증가

---

## 8. 권장 진행 옵션 (v2 — D 삭제)

| 옵션 | scope | 비용 | 효과 |
|---|---|---|---|
| **A** | Phase 1+2 (LSP infra + symbol inventory) | 2주 | 후속 plug-in이 LSP 활용. 정확도 자동 상승 + UI Symbol Explorer 기반 |
| **B** | Phase 1-4 (+ RUN_LSP_ANALYSIS step + 4 plug-in) | 3-4주 | V1/V3/V6/dead code IDE precision 감지 |
| **C** | A + B 후 metric 확보 → Phase Y/Z 재평가 | 측정 후 결정 | 캐시 + 다중 언어는 dogfood 이후 |

**~~D 옵션 (전체 Phase 1-6)~~**: **DELETE** — 8-10주 단일 트랙은 비대, 측정 기반 의사결정과 맞지 않음.

**가장 빠른 effective 시작**: **A** (2주). 그 후 audit-quality-framework PRD §A.2의 V1/V3/V8 plug-in 추가 시 LSP 활용 — 정확도 IDE 수준.

**Verify 조건 (A 완료 시 신규)**: cleartoship 자가 audit에서 LSP precision baseline measurement — finding ≥ 5건 sample, manual classification (TP/FP/FN) → +0.35 가중치 정당화. baseline 충족 시 Phase B 진행.

---

## 9. audit-quality-framework PRD와의 관계

이 PRD는 **§D plug-in 구조 + §A.2 vibe-coding 검사 8개**의 **정확도 backbone**:

| audit-quality-framework | LSP backbone 기여 |
|---|---|
| §A.2 V1 (hallucinated imports) | LSP resolution 실패 + 3-case 분류 (v2) |
| §A.2 V3 (any 남용) | LSP diagnostic + suppress 조건 (v2) |
| §A.2 V6 (missing auth) | handler chain `type_hierarchy` (v2) |
| §A.2 V8 (N+1 query) | callee 그래프 + ORM call |
| §B.1 confidence 정량화 | **v2 — +0.35 보수적 시작** (LSP 측정 baseline 후 상향) |
| §B.3 `.cleartoshipignore` | V3 suppress 조건과 연동 (v2) |
| §D plug-in `CheckContext` | **v2 — `lspClient` 직접 노출 X, `state.lspAnalysis` 결과만 ctx에 read-only** |
| §E confidence + OriginBadge | v2 — `dl-consensus` / `dl-conflict` 세분화 (UX) |
| §F Visual Surfacing | `byFile` tree → RepoTreeView. Symbol Explorer 신규 페이지 |

**통합 권장 (v2 수정)**: audit-quality-framework PRD §D의 `CheckContext`에 **`lspAnalysis: LspAnalysisResult | null`** 필드 추가 (data only). plug-in은 LSP client에 접근 X — worker가 `RUN_LSP_ANALYSIS` step에서 일괄 수행한 결과만 read.

**plug-in `requires` field (v2 — plugin-architect)**:
LSP-dependent plug-ins은 `requires: ['lspAnalysis']` 필드. runner가 prerequisite 미충족(LSP step skipped/failed) 시 자동 SKIPPED 처리.

---

## 10. cleartoship.config.json `lsp` 섹션 (v2 신규 — plugin-architect)

audit-quality-framework §B.3의 `cleartoship.config.json`에 `lsp` 섹션 추가:

```json
{
  "lsp": {
    "excludeGlobs": ["**/generated/**", "vendor/**", "**/*.test.ts"],
    "tsconfigPath": "./tsconfig.audit.json",
    "maxFiles": 500,
    "dependsOnPlugins": ["frontend.hallucinated-imports", "quality.dead-code"]
  }
}
```

repo-owner가 override 가능 → false positive 감소.

---

## 11. 미해결 결정 (다음 세션 ADR)

| Q | 항목 | 옵션 | v2 권장 |
|---|---|---|---|
| L1 | LSP client 라이브러리 | `vscode-languageserver-protocol` / **`vscode-jsonrpc`** / 직접 JSON-RPC | **`vscode-jsonrpc`** (lightweight, ~30% smaller) |
| L2 | typescript-language-server vs ts-server (Microsoft) | community vs Microsoft 공식 | typescript-language-server (더 표준 LSP) |
| L3 | ~~Symbol inventory cache 위치~~ | ~~Firestore / Redis / Cloud Storage~~ | **deferred to Phase Y** — 측정 후 GCS 우선 |
| L4 | ~~Phase 6 Python LSP~~ | ~~pyright / pylsp / jedi~~ | **deferred to Phase Z** |
| L5 | LSP step 실패 시 fallback | hard fail / soft skip | **soft skip + N/A + `requires` field** (audit-quality-framework §B.4 패턴) |
| **L6 (v2 NEW)** | decorator/DI/eval로 호출되는 심볼 처리 | dead code 판정에서 제외 패턴 목록 / 자동 confidence floor | confidence floor MEDIUM + Coverage Disclaimer + 패턴 dictionary 향후 추가 (quality-reviewer) |
| **L7 (v2 NEW)** | Phase Z 진입 조건 | Python audit 요청 비율 / enterprise 요구 | Python audit 요청 ≥ 15% 또는 enterprise customer 명시 요구 |

---

## 12. 참고

- [Serena MCP GitHub](https://github.com/oraios/serena) — LSP 추상화 + MCP server 패턴
- [LSP 명세](https://microsoft.github.io/language-server-protocol/) — Microsoft Language Server Protocol
- [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server) — community LSP for TS
- [`vscode-jsonrpc`](https://www.npmjs.com/package/vscode-jsonrpc) — lightweight JSON-RPC for LSP (v2 채택)
- 관련 PRD: `audit-quality-framework-2026-05-21.md` (§A.2 vibe-coding 8개, §D plug-in 구조, §E confidence, §F Visual Surfacing)
- 의존: PR #38 (Phase 1 worker tooling) — Phase Z (Python)는 PR #38 머지 필요. Phase 1-4는 독립.

---

## v2 Review Trail

| 리뷰어 | Axis | 핵심 결정 (요약) |
|---|---|---|
| **plugin-architect** | 확장성 + 워크플로우 | P5/P6 CUT, `CheckContext.lspClient` CUT, P3+P4 별도 step 통합, `byFile` tree + `type_hierarchy` 추가, `vscode-jsonrpc` |
| **confidence-typer** | 효율성 + 미래지향성 | 768MB cap + RSS 로깅, `summary` field (LLM 폭주 방지), TS 버전 pin, severity mapping table, Tree-sitter row 추가, Firestore → GCS |
| **quality-reviewer** | 퀄리티 (precision/recall) | dead code `referenceContext`, V1 3-case 분류, V3 suppress 조건, +0.5 → +0.35, L6 decorator/DI/eval, Coverage Disclaimer |
| **ux-designer** | 미래지향성 UX | §7.5 UX Surfacing Plan, Symbol Explorer 페이지, dead code action hint, `dl-consensus`/`dl-conflict`, 신뢰도 라벨 한국어화 |
