# PRD — Audit Quality Roadmap (Claude-BugHunter benchmarking 반영)

**작성일**: 2026-05-26
**저자**: orchestrator + repo-benchmarker
**상태**: DRAFT v1 — 다음 세션 즉시 착수용
**관계**:
- 원본 1번 작업 (Inventory→score 반영) — 본 PRD §4.3로 통합
- `source-driven-extraction-2026-05-20.md` (3-bucket framework D/F/L)
- `audit-quality-framework-2026-05-21.md` (audit-quality §A-F, PR #48)
- `lsp-backbone-2026-05-21.md` v2 (PR #49 머지됨)

---

## 0. Executive Summary

ClearToShip audit이 prod에서 동작하지만 **12개 카테고리 중 7개가 N/A** (실측 readiness 점수 = 85, status READY 받았지만 7개 카테고리 측정 안 됨). 사용자 피드백: "너무 N/A가 많은거 아니야? LLM을 쓰고 있는데"

[`elementalsouls/Claude-BugHunter`](https://github.com/elementalsouls/Claude-BugHunter) 면밀 분석 결과 (repo-benchmarker 2026-05-26):
- 같은 도메인(코드 분석)에서 **LLM을 runtime pipeline에서 빼고, knowledge layer로만 활용**하는 architectural pattern
- 7-Question Gate + Pattern Library + Skill bundle 3개 기둥
- ClearToShip이 가진 multi-agent + production deploy 인프라 + Claude-BugHunter의 skill system 결합 → ★★★ best-in-class

**핵심 결정**:
1. **L (LLM) bucket을 audit pipeline 안에 박지 말 것** — 별도 Claude Code skill bundle로 분리 (cleanest architecture)
2. **7개 N/A 카테고리는 "Pattern Library + Inventory + 7-Question Gate" 조합으로 해결**
3. **3-Phase 단계적 진행** — Phase 1 quick wins (1주) → Phase 2 Pattern Library (2-3주) → Phase 3 L bucket skill (2-3주)

총 6-8주 timeline, 단 Phase 1만으로도 사용자 체감 변혁 가능.

---

## 1. 배경 — Claude-BugHunter 분석 (압축)

### 1.1 Claude-BugHunter 구조 (146 files, 25K LOC)

| 요소 | 수치 |
|---|---|
| Skills (`SKILL.md`) | 51 |
| Slash commands | 15 |
| Python scripts (stdlib only, **0 deps**) | 3 |
| Progressive disclosure refs (`offensive-osint/references/`) | 15 |
| Pattern Library docs (`docs/disclosed-reports/hunt-*.md`) | 13 |
| Verification labs (`docs/verification/`) | 13 |
| **LLM API runtime calls** | **0** |

### 1.2 핵심 architectural decision

**LLM을 어디에 쓰는가?**

| Layer | LLM 사용? |
|---|---|
| Recon, classify, triage (cbh.py) | 0% — stdlib Python |
| Pattern delivery, decision tree | 100% — Claude Code skill auto-trigger via `description:` field |
| Chain construction (A→B→C) | 100% — LLM judgment |
| Skill regeneration | 100% offline (Anthropic API, separate `public-skills-builder`) |

→ **결정론적 로직은 Python으로, LLM은 knowledge layer로 분리.**

### 1.3 Validation discipline

7-Question Gate (offensive-osint/SKILL.md):
- Q1: Real HTTP request?
- Q2: Accepted-impact list?
- Q3: In scope?
- Q4: No privileged-access assumption?
- Q5: Not already known?
- Q6: Concrete impact beyond "technically possible"?
- Q7: Not on never-submit list?

**4-outcome verdict** (one NO → KILL):
- **PASS** (all 7 ✓) → Capture
- **DOWNGRADE** (Q2/Q5 fail) → Capture with severity reduction
- **CHAIN REQUIRED** (e.g., open redirect alone) → back to Hunt for primitive B
- **KILL** (any other failure) → abandon

### 1.4 ClearToShip-vs-Claude-BugHunter 점수

| Dimension | CTS | CBH | Winner |
|---|---|---|---|
| Skill system | 3 | 10 | CBH +7 |
| Command system | 4 | 9 | CBH +5 |
| Innovation | 6 | 9 | CBH +3 |
| Code quality | 7 | 9 | CBH +2 |
| Doc | 8 | 10 | CBH +2 |
| Agent architecture | 5 | 3 | CTS +2 |
| Hook system | 6 | 4 | CTS +2 |
| API integration | 7 | 5 | CTS +2 |
| CI/CD | 8 | 7 | CTS +1 |
| Orchestration | 7 | 8 | CBH +1 |
| **Weighted total** | **6.05** | **7.45** | **CBH +1.40** |

CTS는 production infra가 강점, CBH는 knowledge/skill system이 압도적. 결합 시 best-in-class.

---

## 2. 현재 ClearToShip audit 상태

### 2.1 12개 카테고리 N/A 매트릭스

| 카테고리 | 현재 상태 | Origin | 측정 step | N/A 원인 |
|---|---|---|---|---|
| LAUNCH_READINESS | ✅ 100 | D | step04 W1-A evidence | OK |
| UX_UI | ✅ 92 | D | ANALYZE_DEPLOY_URL | OK (lighthouse 일부 fail이지만 점수 산출) |
| BACKEND_API | ✅ 84 | D | 코드 휴리스틱 | OK |
| SECURITY_PRIVACY | ✅ 68 | D | RUN_STATIC_ANALYSIS (semgrep) | OK (PR #55 fix 후) |
| BUSINESS_READINESS | ✅ 60 | D | ANALYZE_BUSINESS_READINESS | OK |
| **FEATURE_GRAPH** | ❌ N/A | none | (없음) | inventory 있지만 score 반영 X (PR-A4-fix 결정) |
| **FUNCTIONAL_FLOW** | ❌ N/A | none | (없음) | 측정 step 없음 |
| **FRONTEND_CODE** | ❌ N/A | none | (없음) | semgrep은 SECURITY로만 매핑 |
| **DATA_MODEL** | ❌ N/A | none | (없음) | Firestore detect됐지만 score 반영 X |
| **MAINTAINABILITY_DOCUMENTATION** | ❌ N/A | none | (없음) | 측정 step 없음 |
| **PRODUCT_INTENT** | ❌ N/A | none | (없음) | PRD 의존 (L bucket 미구현) |
| **REQUIREMENT_COVERAGE** | ❌ N/A | none | (없음) | PRD 의존 (L bucket 미구현) |

7개 N/A 중:
- **2개는 사용자 입력 부재** (PRD 없음) — PRODUCT_INTENT, REQUIREMENT_COVERAGE
- **5개는 측정 표면 부족** — FEATURE_GRAPH, FUNCTIONAL_FLOW, FRONTEND_CODE, DATA_MODEL, MAINTAINABILITY

### 2.2 사용자 불만 ground truth

- "너무 N/A가 많은거 아니야?" → 7/12 = 58% N/A는 audit 신뢰성 침해
- "LLM을 쓰고 있는데" → L bucket이 PRD에만 있고 코드 0건 — 사용자는 LLM 활용을 기대했음

---

## 3. 채택 결정 매트릭스 (CBH → CTS)

### 3.1 채택 (ADOPT) — Top 5

| # | 아이디어 | CBH 출처 | CTS 적용 | Phase | 점수 |
|---|---|---|---|---|---|
| 1 | **7-Question Gate** (PASS/DOWNGRADE/CHAIN/KILL) | `triage-validation/SKILL.md` | LAUNCH_READINESS 명료화 | 1 | 10 |
| 2 | **Pattern Library docs** (per category) | `docs/disclosed-reports/hunt-*.md` | 7개 N/A 카테고리 해결 | 2 | 10 |
| 3 | **Skill bundle** (`audit-*`) | `skills/hunt-*/SKILL.md` | L bucket cleanest impl | 3 | 9 |
| 4 | **Progressive disclosure** (1 SKILL + N refs) | `offensive-osint/references/` | 큰 카테고리 context 절약 | 2 | 9 |
| 5 | **Validation gate** (4-outcome) | `triage-validation/SKILL.md` | 0-100 numeric → 4-state | 1 | 9 |

### 3.2 후속 검토 (CONSIDER) — Top 5

| # | 아이디어 | Phase | 점수 |
|---|---|---|---|
| 6 | CVE/KEV refresh script (F bucket) | 1 | 8 |
| 7 | Verification lab corpus | 2 | 8 |
| 8 | ENGAGEMENTS.md calibration pattern | 후속 | 8 |
| 9 | JSONL memory + rotation | 후속 | 7 |
| 10 | Engagement scaffold (per-target folder) | 후속 | 7 |

### 3.3 채택 안 함 (SKIP)

- **Burp MCP integration** — manual HTTP testing 도구, deterministic audit과 fit X
- **Slash commands** — ClearToShip은 web UI 중심
- **H1 disclosure source** — vibe-coded project audit이라 source 다름 (GitHub trending로 대체 가능)
- **Mid-engagement IR detection** — pen-test specific, 1-shot audit과 무관

---

## 4. PHASE 1 — Quick Wins (1주)

### 4.1 7-Question Gate for LAUNCH_READINESS

**현재**: LAUNCH_READINESS = 100/100 (W1-A checklist 5개 모두 PASS → 100점). 하지만 이 점수가 "출시 가능"인지 명확한 verdict 없음.

**채택안**: CBH의 7-Question Gate 패턴을 ClearToShip launch readiness에 mapping.

```typescript
// packages/audit-core/src/launch-gate/seven-question-gate.ts (NEW)

export interface LaunchQuestion {
  id: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6' | 'Q7';
  question: string;
  answer: 'YES' | 'NO' | 'UNKNOWN';
  evidence: string[];
}

export type LaunchVerdict = 'READY' | 'CONDITIONAL' | 'BLOCK' | 'FIX_FIRST';

export interface LaunchGateResult {
  questions: LaunchQuestion[];
  verdict: LaunchVerdict;
  rationale: string;
}
```

**7개 질문 spec**:
| ID | Question | YES 조건 (D bucket evidence) |
|---|---|---|
| Q1 | README가 있고 production 클레임이 검증된가? | W1-A README + step04c PRD analysis |
| Q2 | License + CONTRIBUTING 존재? | W1-A LICENSE_PRESENT + step04 |
| Q3 | CI 설정 + 테스트 통과? | W1-A CI_CONFIG_PRESENT + (TBD: actions run check) |
| Q4 | P0 finding이 0건? | severityCounts.P0 === 0 |
| Q5 | Deploy URL 도달 가능 + Lighthouse 통과? | ANALYZE_DEPLOY_URL 통과 |
| Q6 | 보안 audit (semgrep) clean + 의존성 vuln 처리? | SECURITY_PRIVACY ≥ 70 |
| Q7 | 비즈니스 readiness (분석 도구, 고객 지원) OK? | BUSINESS_READINESS ≥ 70 |

**Verdict 산정**:
- All 7 YES → **READY**
- Q4/Q5/Q6 중 1 NO → **CONDITIONAL** (소소한 issue만)
- Q1/Q2/Q3 NO → **FIX_FIRST** (foundation 미흡)
- Q4 NO (P0 있음) → **BLOCK**

**UI**:
- ScoreOverview에 "🟢 READY" / "🟡 CONDITIONAL" / "🔴 FIX_FIRST" / "⛔ BLOCK" chip
- 각 question yes/no chip + evidence link

**Effort**: S (1-2일)
**파일**:
- `packages/audit-core/src/launch-gate/seven-question-gate.ts` (NEW)
- `packages/audit-core/src/launch-gate/seven-question-gate.test.ts`
- `packages/audit-core/src/scoring/calculate-scores.ts` (verdict 통합)
- `packages/shared-types/src/launch-gate.ts` (zod)
- `apps/web/components/dashboard/launch-verdict-chip.tsx` (NEW)

### 4.2 CVE/KEV refresh script (F bucket 구현체)

**현재**: OSV scanner로 deps vuln 검출. 하지만 audit-worker가 cover 못하는 CVE 범위 추적 없음.

**채택안**: CBH의 `refresh-cve-index.py` 패턴 — 주간 CISA KEV diff.

```python
# scripts/refresh-osv-coverage.py (NEW)
# 주간 cron으로 CISA KEV JSON + GitHub Advisory 받음
# audit-worker의 covered ecosystems와 diff
# Markdown report → reports/CVE-COVERAGE/<date>.md
# 신규 CVE > threshold 시 GitHub issue auto-create
```

**Effort**: S (2-3일)
**파일**:
- `scripts/refresh-osv-coverage.py` (NEW)
- `.github/workflows/refresh-cve-coverage.yml` (NEW — weekly cron)
- `reports/CVE-COVERAGE/.gitkeep`

### 4.3 Inventory→score 반영 (원래 "1번 작업" + CBH 통찰 결합)

**현재**: PR-A4-fix가 dataModelInventory + routeInventory를 strength card로만 표시 (점수 미반영). 결과: FEATURE_GRAPH, FUNCTIONAL_FLOW, DATA_MODEL 모두 N/A.

**원래 계획**: Inventory 존재 시 카테고리 점수 산정 baseline 적용.

**CBH 통찰 반영**: 단순 "존재"가 아니라 **Pattern Library evidence 적용 후 점수**.

**Phase 1 단계** (Pattern Library는 Phase 2에서):
- `state.routeInventory.routes.length > 0` → FEATURE_GRAPH score = 50 (baseline, "structure detected") + origin = D
- `state.routeInventory.routes.length > 5 && has Link/router edges` → FEATURE_GRAPH score = 70
- `state.dataModelInventory.tech !== 'none'` → DATA_MODEL score = 60 (baseline)
- `state.dataModelInventory.entities.length >= 3` → DATA_MODEL score = 75
- `state.routeInventory.dynamicRouteCount > 0 && pageCount > 0` → FUNCTIONAL_FLOW score = 50

**핵심**: baseline 점수 + Phase 2 Pattern Library로 더 세밀하게 보강.

**Effort**: S (2-3일)
**파일**:
- `packages/audit-core/src/scoring/calculate-scores.ts` — inventory baseline score 추가
- `packages/audit-core/src/scoring/inventory-scoring.ts` — 기존 헬퍼 확장
- 관련 test 업데이트

### 4.4 Phase 1 deliverable

- 3개 PR (또는 1개 큰 PR)
- 4개 카테고리 N/A 감소:
  - FEATURE_GRAPH: N/A → 50-70점
  - FUNCTIONAL_FLOW: N/A → 50점
  - DATA_MODEL: N/A → 60-75점
  - LAUNCH_READINESS: 100/100 + verdict (READY/CONDITIONAL/BLOCK/FIX_FIRST)
- 측정 가능한 카테고리 5→9 (75% coverage)

---

## 5. PHASE 2 — Pattern Library 시리즈 (2-3주)

### 5.1 목표

7개 N/A 카테고리 중 5개를 **Pattern Library + audit-worker 검출 + 점수 부여**로 해소.

(나머지 2개 PRODUCT_INTENT, REQUIREMENT_COVERAGE는 Phase 3에서 L bucket으로)

### 5.2 Pattern Library 구조 (CBH `hunt-*.md` 모방)

각 카테고리별 `docs/audit-patterns/<category>.md`:

```markdown
# Audit Pattern Library — <Category>

## Overview
- 무엇을 측정하는가
- 왜 중요한가
- 점수 산정 logic

## Patterns (8-15개)

### Pattern 1: <Name>
**When to suspect**: <시그널>
**Test**: <코드 또는 도구 명령>
**Validation**: <pass/fail 기준>
**Score impact**: +N (적용 시) / -N (위반 시)

## Score formula
baseline 50
+ pattern1 (if found) +10
+ pattern2 +5
...
```

### 5.3 7개 카테고리 Pattern Library spec

| 카테고리 | Patterns 예시 | Effort |
|---|---|---|
| **FEATURE_GRAPH** | route AST density / Link edges count / API surface size / page tree depth | M (3일) |
| **FUNCTIONAL_FLOW** | onboarding flow / auth flow / checkout flow / error handling consistency | M (3일) |
| **FRONTEND_CODE** | component count / hook usage / accessibility ARIA / responsive breakpoints / CSS modularity | M (4일) |
| **DATA_MODEL** | entity count / relations density / index presence / migration history / type safety (zod/schema) | M (3일) |
| **MAINTAINABILITY** | LOC per file / cyclomatic complexity / test coverage / commit message quality / docs coverage | M (4일) |
| **PRODUCT_INTENT** | README sections / CHANGELOG presence / roadmap.md / page titles vs README claims | M (3일) — L bucket 없이도 일부 가능 |
| **REQUIREMENT_COVERAGE** | PRD section ↔ detected features mapping / acceptance criteria patterns | M-L (5일) — Phase 3 시너지 |

### 5.4 Worker 구현 step (각 카테고리)

각 카테고리마다 새 audit step 또는 기존 step 확장:

| Category | New step | 또는 확장할 step |
|---|---|---|
| FEATURE_GRAPH | step10b-feature-graph-quality.ts | GENERATE_FEATURE_GRAPH 확장 |
| FUNCTIONAL_FLOW | step10c-flow-quality.ts | GENERATE_FEATURE_GRAPH 확장 |
| FRONTEND_CODE | step06b-frontend-code-quality.ts | RUN_STATIC_ANALYSIS와 별도 |
| DATA_MODEL | step16b-data-model-quality.ts | ANALYZE_DATA_MODEL 확장 |
| MAINTAINABILITY | step19-maintainability.ts | NEW |
| PRODUCT_INTENT | step04d-product-intent-deterministic.ts | ANALYZE_PRD 확장 |

### 5.5 Pattern Library 채점 모델

baseline 50 + Pattern Library hits → 산점.

```typescript
// packages/audit-core/src/patterns/score-from-patterns.ts (NEW)

export interface PatternEvidence {
  patternId: string;
  matched: boolean;
  scoreImpact: number; // +N or -N
  evidence: string;
}

export function scoreFromPatterns(
  patterns: PatternEvidence[],
  baseline: number = 50,
): { score: number; origin: 'D'; confidence: 'HIGH' | 'MEDIUM' | 'LOW' } {
  const score = patterns.reduce(
    (acc, p) => acc + (p.matched ? p.scoreImpact : 0),
    baseline,
  );
  return {
    score: Math.max(0, Math.min(100, score)),
    origin: 'D',
    confidence: patterns.length >= 5 ? 'HIGH' : 'MEDIUM',
  };
}
```

### 5.6 Phase 2 deliverable

- 6-7개 PR (카테고리별 + 공통)
- 7개 N/A 카테고리 모두 점수화 (D origin)
- 측정 카테고리 9→12 (100% coverage)

---

## 6. PHASE 3 — L Bucket Skill Bundle (2-3주)

### 6.1 Architectural decision (CBH 통찰)

**audit-worker pipeline 안에 LLM call 박지 말 것.**

대신:
1. **audit-worker** = deterministic D + F evidence emit (Phase 2까지)
2. **Claude Code skill bundle** = audit-worker output 읽고 L-judgment 추가

### 6.2 Skill bundle 구조

```
.claude/skills/
├── audit-product-intent/
│   ├── SKILL.md          — 본 skill의 trigger keywords + workflow
│   ├── prompts/
│   │   ├── README-analysis.md
│   │   └── claim-vs-reality.md
│   └── references/
│       ├── stage-keywords.md
│       └── beta-vs-production-signals.md
├── audit-requirement-coverage/
│   ├── SKILL.md
│   └── ...
├── audit-pattern-explainer/      # 각 Pattern Library finding의 자연어 설명
│   ├── SKILL.md
│   └── ...
└── audit-launch-verdict-narrative/ # 7-Question Gate 결과의 narrative
    ├── SKILL.md
    └── ...
```

### 6.3 Skill loading 패턴

CBH의 `description:` keyword auto-trigger:

```yaml
---
name: audit-product-intent
description: |
  Run when audit output mentions PRODUCT_INTENT, product intent inference,
  README claim verification, or stage keyword (MVP/Beta/Production)
  inconsistency detection.
sources:
  - claude-bughunter benchmarking 2026-05-26
report_count: 0  # to be populated
---
```

### 6.4 audit-worker output → skill input contract

```typescript
// audit-worker가 emit하는 evidence (Phase 2까지)
interface AuditEvidence {
  category: 'PRODUCT_INTENT' | ...;
  patterns: PatternEvidence[];
  rawArtifacts: {
    readme?: string;
    changelog?: string;
    detectedFeatures: Feature[];
  };
  // L bucket이 추가 judgment 가능한 hooks
  llmHooks: {
    productIntentInference?: 'enabled' | 'optional' | 'disabled';
    requirementCoverageNarrative?: 'enabled' | 'optional' | 'disabled';
  };
}
```

Skill이 이걸 read하고 supplementary score 또는 narrative 생성.

### 6.5 점수 통합 (D + L)

```typescript
// Final score = D score (Phase 2) + optional L adjustment
{
  category: 'PRODUCT_INTENT',
  scoreD: 55,        // Phase 2 deterministic
  scoreL: 70,        // Phase 3 LLM-assisted (skill)
  scoreFinal: 60,    // 가중 평균 (D 60% + L 40%)
  origin: 'mixed',   // D + L
  confidence: 'MEDIUM',
  uiLabel: 'AI-assisted',
}
```

### 6.6 Cost 관리 (CBH 패턴)

- **Default = audit-worker only** (D + F, LLM 없음)
- **"AI enhanced" toggle** = skill bundle 활성화 (사용자 명시적 opt-in)
- Session isolation per audit
- Token budget per category (e.g., 5K tokens max for PRODUCT_INTENT)
- 결과 캐시 (commitSha + category 별)

### 6.7 Phase 3 deliverable

- 4-5개 skill bundle (`audit-product-intent`, `audit-requirement-coverage`, `audit-pattern-explainer`, `audit-launch-verdict-narrative`)
- audit-worker → skill contract 정형화
- UI: "AI enhanced" toggle + AI-assisted 라벨
- 사용자 cost 관리 (skill 활성 시 token 사용량 표시)

---

## 7. 점수 산정 모델 (통합)

### 7.1 카테고리별 점수 형성 (Phase 별)

| Category | Phase 1 | Phase 2 | Phase 3 | Final |
|---|---|---|---|---|
| LAUNCH_READINESS | 100 + verdict | (same) | + narrative | D + verdict |
| UX_UI | 92 (Lighthouse) | + a11y patterns | + UX narrative | D + L |
| BACKEND_API | 84 | + API quality patterns | + narrative | D + L |
| SECURITY_PRIVACY | 68 | + 보안 patterns | + 자연어 설명 | D + L |
| BUSINESS_READINESS | 60 | + business patterns | + narrative | D + L |
| FEATURE_GRAPH | 50-70 (inventory) | + flow patterns | + narrative | D |
| FUNCTIONAL_FLOW | 50 (inventory) | + flow patterns | + narrative | D + L |
| FRONTEND_CODE | (N/A) | 50-75 (patterns) | + narrative | D |
| DATA_MODEL | 60-75 (inventory) | + schema patterns | + narrative | D |
| MAINTAINABILITY | (N/A) | 50-80 (patterns) | + narrative | D |
| PRODUCT_INTENT | (N/A) | 30-50 (deterministic 부분) | 60-80 (LLM 보강) | mixed |
| REQUIREMENT_COVERAGE | (N/A) | 30-50 (deterministic) | 50-80 (LLM 보강) | mixed |

### 7.2 측정 카테고리 비율

| Phase | 측정 / 전체 |
|---|---|
| 현재 | 5/12 (42%) |
| Phase 1 | 9/12 (75%) |
| Phase 2 | 12/12 (100%, D origin) |
| Phase 3 | 12/12 (100%, mixed origin) |

### 7.3 confidence 모델 (CBH 7-Question Gate 영감)

| Source | Confidence base |
|---|---|
| D only (Phase 1-2) | HIGH |
| D + F (CVE refresh) | HIGH |
| L only | LOW |
| D + L consensus | HIGH (very-high if dual signal) |
| D + L conflict | LOW + ⚠️ flag |

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Phase 1 inventory→score가 baseline 너무 후함 | MED | A/B test — 일부 user audit에 baseline 적용, KPI 추적 |
| Pattern Library가 너무 많아 maintenance burden | MED | 각 카테고리 8-15개로 cap, 자동 generation 고려 |
| Skill bundle이 ClearToShip user에게 너무 advanced | HIGH | Default = OFF, opt-in toggle, 명확한 UI label |
| LLM 비용 폭주 (skill 활성 시) | MED | Token budget cap per category, daily quota |
| Pattern Library mismatch — false positive 증가 | MED | CBH의 7-Question Gate 패턴 적용 (KILL/DOWNGRADE) |
| Phase 1 다 끝나기 전에 Phase 2 시작하면 score 모델 불일치 | LOW | 단계별 PR, 머지 후 다음 단계 |

---

## 9. 다음 세션 즉시 시작 명령 (Quick start)

다음 세션이 이 PRD를 보고 즉시 시작할 수 있도록 정형화.

### 9.1 시작 전 확인

```bash
# 0. memory sync (필수)
bash scripts/sync-claude-memory.sh
# 또는 Windows: & scripts\sync-claude-memory.ps1

# 1. main 기준 + PR #55 적용 확인
git checkout main && git pull --ff-only
git log --oneline -5
# expect: b43ba21 fix(static-analysis): use p/owasp-top-ten config (#55)
```

### 9.2 Phase 1.1 — 7-Question Gate 즉시 시작

```bash
git checkout -b feat/launch-verdict-7q-gate
# 파일 생성:
# - packages/audit-core/src/launch-gate/seven-question-gate.ts
# - packages/audit-core/src/launch-gate/seven-question-gate.test.ts
# - packages/shared-types/src/launch-gate.ts
# - apps/web/components/dashboard/launch-verdict-chip.tsx
# - packages/audit-core/src/scoring/calculate-scores.ts (verdict 통합)
```

§4.1의 7개 질문 그대로 적용.

### 9.3 Phase 1.2 — CVE refresh script

```bash
git checkout -b feat/cve-coverage-refresh
# scripts/refresh-osv-coverage.py + .github/workflows/refresh-cve-coverage.yml
```

§4.2 spec 따라.

### 9.4 Phase 1.3 — Inventory→score

```bash
git checkout -b feat/inventory-baseline-scoring
# packages/audit-core/src/scoring/calculate-scores.ts 수정
# packages/audit-core/src/scoring/inventory-scoring.ts 확장
```

§4.3 spec. baseline 점수 표 그대로.

### 9.5 Phase 2 시작 조건

Phase 1 3개 PR 모두 머지 후 → Phase 2 (Pattern Library 시리즈).

---

## 10. Open Questions (다음 세션 시작 시 확인)

| Q | 내용 | 권장 default |
|---|---|---|
| L1 | Phase 1을 1개 PR vs 3개 PR | 3개 (작은 단위, 빠른 review) |
| L2 | 7-Question Gate에서 NO 답변이 1개 있을 때 verdict | CONDITIONAL (FIX_FIRST 너무 strict) |
| L3 | Pattern Library를 docs/audit-patterns/ vs packages/audit-core/src/patterns/ | 둘 다 — docs는 markdown spec, code는 implementation |
| L4 | Phase 2 카테고리 진행 순서 | DATA_MODEL → FEATURE_GRAPH → FRONTEND_CODE → MAINTAINABILITY → FUNCTIONAL_FLOW → PRODUCT_INTENT → REQUIREMENT_COVERAGE (의존도 낮은 순서) |
| L5 | Phase 3 L bucket toggle UI 위치 | audit 시작 form에 "AI enhanced (옵션)" checkbox |
| L6 | LSP backbone (PR #51) hotfix vs SYMBOL_INVENTORY step 영구 disable | 다음 세션 별도 판단 — 현재 step disable 상태 유지 (PR #54) |

---

## 11. 참고

- 분석 원본: repo-benchmarker 보고서 (2026-05-26)
- Source repo: https://github.com/elementalsouls/Claude-BugHunter (146 files, 25K LOC)
- 비교 baseline: ClearToShip v1.1.0 main (commit b43ba21)
- 관련 PRD:
  - `source-driven-extraction-2026-05-20.md` (3-bucket framework)
  - `audit-quality-framework-2026-05-21.md` (PR #48, §A-F)
  - `lsp-backbone-2026-05-21.md` v2 (PR #49, 머지됨)
- 관련 PR 히스토리 (이 세션):
  - #38 Phase 1 worker tooling (semgrep + osv) — MERGED
  - #50 Phase G MVP (RepoTreeView + PageCard grid) — MERGED
  - #51 LSP Phase A (infra + Symbol Inventory) — MERGED
  - #52 typescript-language-server install — MERGED (later reverted)
  - #53 PR #52 revert — MERGED (LSP server crash)
  - #54 SYMBOL_INVENTORY step disable — MERGED (spawn ENOENT crash)
  - #55 semgrep --config=p/owasp-top-ten — MERGED (이 PRD 작성 시점 main HEAD)
