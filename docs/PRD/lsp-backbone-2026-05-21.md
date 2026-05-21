# PRD — Serena-inspired LSP Backbone for Code Inspection

**작성일**: 2026-05-21
**저자**: planner (with leader review)
**상태**: DRAFT — 다음 세션이 구현 시작 전 검토 + 합의
**관계**: `audit-quality-framework-2026-05-21.md`의 §D plug-in 구조 + §A.2 vibe-coding 검사 8개의 **정확도 backbone**

---

## 0. Executive Summary

ClearToShip audit이 "코드 검사"라고 부르지만 사실 **file-glob + regex + 부분 AST** — Symbol-level navigation, cross-reference 추적, type-aware diagnostics 없음. semgrep (Phase 1 PR #38) 머지 후에도 LSP semantic 분석은 부재. vibe-coding 특화 위험 (hallucinated imports, type safety, missing auth, dead code) 정확 감지에 LSP 필수.

[Serena MCP](https://github.com/oraios/serena)는 LSP 추상화로 40+ 언어를 grep precision이 아닌 **IDE precision**으로 분석. 우리 audit이 이 패턴을 채택하면:

| 위험 | 현재 감지 | Serena 패턴 적용 후 |
|---|---|---|
| V1 hallucinated imports | regex (FP 많음) | LSP resolution 실패 = 확정 |
| V3 `any` 남용 | 단순 count | LSP diagnostic type narrowing 인식 |
| V6 missing auth middleware | route AST | handler chain LSP resolve |
| V8 N+1 query | AST 패턴 매칭 | callee 그래프 + ORM call 추적 |
| Dead code | 없음 | symbol export + zero references |
| Unused imports | 없음 | LSP unused-imports diagnostic |
| Cross-file 정합성 | 없음 | find_references |

**가장 빠른 effective 시작**: Phase 1+2 (~2주) — LSP infra + symbol inventory. 후속 plug-in이 자동으로 IDE precision 활용.

---

## 1. 배경 — Serena MCP 분석

### 1.1 Serena MCP 핵심 강점

- **LSP 추상화** — typescript-language-server / pyright / 등 40+ 언어 LSP를 단일 인터페이스로 노출
- **Symbol-level navigation** — `find_symbol`, `find_referencing_symbols`, `find_declaration`, `type_hierarchy`
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

**채택**: B. typescript-language-server 직접 spawn, JSON-RPC로 통신. 향후 pyright 등 추가.

---

## 2. PHASE 1 — LSP Infrastructure (Foundation)

**Objective**: TypeScript Language Server를 worker에서 spawn + JSON-RPC 통신 + lifecycle 관리

**Tasks**:
- `workers/audit-worker/src/lsp/client.ts` (NEW) — LSP client class (`vscode-languageserver-protocol` 또는 직접 JSON-RPC)
- `workers/audit-worker/src/lsp/typescript-server.ts` (NEW) — typescript-language-server spawn + initialize/didOpen/shutdown lifecycle
- `workers/audit-worker/src/lsp/types.ts` (NEW) — Symbol/Position/Range zod schema
- `workers/audit-worker/Dockerfile` — `npm install -g typescript-language-server` (Node 이미 있음)
- `workers/audit-worker/scripts/smoke-tools.sh` — `typescript-language-server --version` 검증 추가
- `.github/workflows/deploy.yml` smoke step — 5번째 도구 검증 (옵션)

**Depends on**: 없음 (Phase 1 PR #38과 무관, 별 트랙)

**Risk + Mitigation**:
| Risk | Mitigation |
|---|---|
| LSP cold start ~3-5s | per-audit single instance + clone-repo step에서 warm-up. 5분 timeout. |
| 큰 repo에서 메모리 500MB+ | Cloud Run 4Gi 이미 충분. profile + cap. |
| typescript-language-server install 시간 ~20MB | Dockerfile build cache layer. |

**Verify**: smoke test에서 LSP server 응답. mock LSP server unit test.

**추정**: 1주

---

## 3. PHASE 2 — Symbol Inventory Step

**Objective**: 새 pipeline step — repo의 모든 symbol (function/class/component/import) 인벤토리 구축

**Tasks**:
- `workers/audit-worker/src/pipeline/steps/20-symbol-inventory.ts` (NEW) — LSP `textDocument/documentSymbol` 모든 파일 호출
- `packages/shared-types/src/symbol-inventory.ts` (NEW) — `SymbolInventorySchema` zod (functions[], classes[], components[], imports[])
- `packages/audit-core/src/symbols/extract-symbols.ts` (NEW) — LSP response → SymbolInventory 변환
- `packages/audit-core/src/symbols/extract-symbols.test.ts` — fixture 기반 unit test
- `workers/audit-worker/src/pipeline/steps/index.ts` — `state.symbolInventory` 신규 필드 + AUDIT_STEPS 삽입 (index 15, RUN_CHECK_PLUGINS 직전)
- `packages/shared-types/src/domain.ts` — `AuditReportSchema.symbolInventory` optional 추가
- Firestore writer 확장

**Depends on**: Phase 1

**Risk + Mitigation**:
| Risk | Mitigation |
|---|---|
| 큰 repo (10K+ files) 시간 폭주 | `budget.maxFiles=1000` cap. 파일별 timeout 2s. |
| JS/JSX symbol 누락 | LSP가 `*.js` / `*.jsx`도 처리 (config). |
| monorepo 다중 tsconfig | workspace root 자동 감지 + sub-project별 initialize. |

**Verify**: cleartoship 자가 audit에서 `state.symbolInventory.functions.length > 500` (실제 LOC 기준 합리적).

**추정**: 1주

---

## 4. PHASE 3 — Cross-Reference Analysis (V1, V3, Dead code)

**Objective**: `find_references` + `find_declaration` — vibe-coding 위험 V1/V3 + dead code 정확 감지

**Tasks**:
- `packages/audit-core/src/symbols/reference-graph.ts` (NEW) — caller/callee 그래프 (LSP `textDocument/references`)
- `packages/audit-core/src/plugins/checks/frontend.hallucinated-imports.check.ts` (NEW, PRD A.2 V1) — LSP resolution 실패 = hallucinated
- `packages/audit-core/src/plugins/checks/frontend.any-overuse.check.ts` (NEW, V3) — LSP diagnostic이 `any` 사용 카운트
- `packages/audit-core/src/plugins/checks/quality.dead-code.check.ts` (NEW) — symbol export + zero references = dead
- `packages/audit-core/src/plugins/checks/quality.unused-imports.check.ts` (NEW) — import한 symbol zero references = unused
- 각 check `.test.ts` (4개)

**Depends on**: Phase 2 + **audit-quality-framework PRD §D plug-in 구조 (Phase 0)**

**Risk + Mitigation**:
| Risk | Mitigation |
|---|---|
| `find_references` 가 큰 repo에서 30s+ | per-symbol timeout + max 100 symbol resolve. 우선순위 = top-level export. |
| type narrowing 통한 정교한 우회 (`as unknown as X`) | 후속 LLM step (Phase B) 보강. checklist 미스 OK. |
| monorepo cross-workspace reference 부정확 | workspace root별 분리 분석. |

**Verify**: cleartoship에서 `hallucinated-imports` 0건. 의도적 fake import 추가 시 감지.

**추정**: 1주

---

## 5. PHASE 4 — Type-Aware Diagnostics (V6, V7)

**Objective**: LSP `textDocument/diagnostics` — TS 에러를 audit finding으로

**Tasks**:
- `packages/audit-core/src/symbols/diagnostics.ts` (NEW) — LSP diagnostic → NormalizedFinding 변환
- `packages/audit-core/src/plugins/checks/quality.tsc-errors.check.ts` (NEW) — TS strict error finding
- `packages/audit-core/src/plugins/checks/security.missing-auth-middleware.check.ts` (NEW, V6) — handler AST → middleware chain LSP resolve
- `packages/audit-core/src/plugins/checks/backend.cors-wildcard.check.ts` (NEW, V7) — config file LSP + value extraction
- tests (3개)

**Depends on**: Phase 2

**Risk + Mitigation**:
| Risk | Mitigation |
|---|---|
| TS 설정 (strict, noImplicitAny) repo마다 다름 | ClearToShip strict tsconfig override 적용 + report에 명시. |
| handler middleware 패턴 framework마다 다름 | framework profile (이미 있음) 기반 분기. |

**Verify**: cleartoship에서 `tsc-errors` 0건, 의도적 `any` 추가 시 count 증가.

**추정**: 1주

---

## 6. PHASE 5 — Project Memory Layer (Serena pattern)

**Objective**: 같은 repo 재 audit 시 LSP startup 비용 절약 + symbol inventory cache

**Tasks**:
- `workers/audit-worker/src/cache/lsp-cache.ts` (NEW) — Firestore-backed cache: key = `${repoUrl}@${commitSha}#lsp-v1`, value = SymbolInventory
- `workers/audit-worker/src/pipeline/steps/20-symbol-inventory.ts` — cache hit 시 LSP skip
- Firestore `lspCache` collection + TTL 인덱스 (7일)
- `firestore.rules` — `lspCache`는 worker만 write
- Cache invalidation strategy (commit SHA 자동)

**Depends on**: Phase 2

**Risk + Mitigation**:
| Risk | Mitigation |
|---|---|
| Cache key 충돌 | `repoUrl + commitSha` 조합 + hash. |
| Stale cache | commitSha key가 자동 invalidate. 7일 TTL. |

**Verify**: 같은 repo 2번 audit — 2번째 LSP step 50%+ 단축.

**추정**: 1주

---

## 7. PHASE 6 — Multi-language Support (Python)

**Objective**: Python (FastAPI/Django) 프로젝트 LSP 분석

**Tasks**:
- `workers/audit-worker/src/lsp/python-server.ts` (NEW) — pyright LSP spawn (npm 설치 가능)
- `Dockerfile` — pyright 설치
- LSP client 추상화 — `LspClient` 인터페이스 (TS + Python 구현)
- Framework profile 자동 감지 — `pyproject.toml` / `requirements.txt` 발견 시 Python branch

**Depends on**: Phase 1-3, **PR #38 (Python install 이미 됨)**

**Risk + Mitigation**:
| Risk | Mitigation |
|---|---|
| pyright vs jedi-language-server 선택 | benchmark + 측정. 일반적으로 pyright 권장. |
| Python 의존 (이미 PR #38) | PR #38 머지 후 진행. |

**Verify**: Python sample repo (FastAPI) audit → symbol inventory 정상.

**추정**: 1주

---

## 8. RISKS — 종합

| Severity | 항목 | Mitigation |
|---|---|---|
| HIGH | LSP cold start + memory footprint | per-audit single instance + 4Gi Cloud Run 확장 |
| HIGH | typescript-language-server가 monorepo / 큰 codebase에서 hang | per-symbol timeout 5s + 전체 step 10min cap |
| MED | Phase 1 PR #38과 의존 충돌 | Phase 6만 의존, 1-5는 독립 진행 |
| MED | LSP diagnostic 결과 noise (deprecated API 등) | confidence LOW로 자동 down-rank (audit-quality-framework §B.1) |
| MED | 사용자가 LSP 분석을 무겁다고 느낌 | 별도 step 명시 + cache (Phase 5) |
| LOW | LSP 자체 의존성 버전 drift | semver pin (PR #38 패턴) |

---

## 9. 권장 진행 옵션

| 옵션 | scope | 비용 | 효과 |
|---|---|---|---|
| **A** | Phase 1+2 (LSP infra + symbol inventory) | 2주 | 후속 plug-in이 LSP 활용. 정확도 자동 상승 |
| **B** | Phase 1-3 (+cross-ref) | 3-4주 | V1/V3/dead code 정확 감지 |
| **C** | Phase 1-5 (+memory cache) | 5-6주 | 재 audit 50%+ 단축 + 운영비 절감 |
| **D** | 전체 Phase 1-6 | 8-10주 | Python까지. 시장 확대 |

**가장 빠른 effective 시작**: **A** (2주). 그 후 audit-quality-framework PRD §A.2의 V1/V3/V8 plug-in 추가 시 LSP 활용 — 정확도 IDE 수준.

---

## 10. audit-quality-framework PRD와의 관계

이 PRD는 **§D plug-in 구조 + §A.2 vibe-coding 검사 8개**의 **정확도 backbone**:

| audit-quality-framework | LSP backbone 기여 |
|---|---|
| §A.2 V1 (hallucinated imports) | LSP resolution 실패 감지 |
| §A.2 V3 (any 남용) | LSP diagnostic count |
| §A.2 V6 (missing auth) | handler chain LSP resolve |
| §A.2 V8 (N+1 query) | callee 그래프 + ORM call |
| §B.1 confidence 정량화 | LSP는 +0.5 가중치 (AST 최상위) |
| §D plug-in `CheckContext` | `lspClient` 노출 — plug-in이 LSP 호출 가능 |
| §F Visual Surfacing | RepoTreeView가 SymbolInventory 활용 |

**통합 권장**: audit-quality-framework PRD §D의 `CheckContext`에 `lspClient: LspClient | null` 필드 추가 (Phase 0 + Phase 1 머지 후).

---

## 11. 미해결 결정 (다음 세션 ADR)

| Q | 항목 | 옵션 | 권장 |
|---|---|---|---|
| L1 | LSP client 라이브러리 | `vscode-languageserver-protocol` / 직접 JSON-RPC / `@volar-plugins/typescript` | `vscode-languageserver-protocol` (표준) |
| L2 | typescript-language-server vs ts-server (Microsoft) | community vs Microsoft 공식 | typescript-language-server (더 표준 LSP) |
| L3 | Symbol inventory cache 위치 | Firestore / Redis / Cloud Storage | Firestore (기존 인프라) |
| L4 | Phase 6 Python LSP | pyright / pylsp / jedi | pyright (Microsoft, 빠름) |
| L5 | LSP step 실패 시 fallback | hard fail / soft skip (다른 check 계속) | soft skip + N/A 처리 (audit-quality-framework §B.4 패턴) |

---

## 12. 참고

- [Serena MCP GitHub](https://github.com/oraios/serena) — LSP 추상화 + MCP server 패턴
- [LSP 명세](https://microsoft.github.io/language-server-protocol/) — Microsoft Language Server Protocol
- [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server) — community LSP for TS
- 관련 PRD: `audit-quality-framework-2026-05-21.md` (§A.2 vibe-coding 8개, §D plug-in 구조)
- 의존: PR #38 (Phase 1 worker tooling) — Python LSP (Phase 6)는 PR #38 머지 필요. Phase 1-5는 독립.
