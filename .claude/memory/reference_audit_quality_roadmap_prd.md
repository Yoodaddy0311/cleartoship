---
name: audit-quality-roadmap-prd-pointer
description: Audit Quality Roadmap PRD (2026-05-26) 위치 + 3-phase 요약. Claude-BugHunter 벤치마킹 결과 통합.
metadata: 
  node_type: memory
  type: reference
  originSessionId: 013ed79c-4b70-4cbc-84bb-cb9c8f3f9875
---

# Audit Quality Roadmap PRD pointer

**파일**: `docs/PRD/audit-quality-roadmap-2026-05-26.md` (746 lines)

**작성 배경**: 2026-05-26 세션. ClearToShip audit 12 카테고리 중 7개 N/A. 사용자 ground truth: "너무 N/A가 많은거 아니야? LLM을 쓰고 있는데"

[`elementalsouls/Claude-BugHunter`](https://github.com/elementalsouls/Claude-BugHunter) 면밀 분석 후 (repo-benchmarker, 146 files, 25K LOC) 3-phase 통합 plan 도출.

## 핵심 architectural decision

**LLM을 audit pipeline 안에 박지 말 것**. CBH 패턴 따라:
- audit-worker = deterministic D + F evidence emit
- L bucket = optional Claude Code skill bundle (사용자 opt-in)

## 3-Phase 요약

| Phase | Scope | Effort | 효과 |
|---|---|---|---|
| **1** | 7-Question Gate + CVE refresh + Inventory→score | 1주 | 측정 카테고리 5→9 (75%) |
| **2** | Pattern Library 시리즈 (7 카테고리) | 2-3주 | 측정 12/12 (100%, D origin) |
| **3** | L bucket skill bundle (`audit-*` skills) | 2-3주 | mixed origin + AI-assisted UI |

## Phase 1 = 다음 세션 즉시 시작 대상

PRD §4 (Phase 1) + [[next-actions-2026-05-26]] 참조. 3개 PR:
1. `feat/launch-verdict-7q-gate` — PRD §4.1
2. `feat/cve-coverage-refresh` — PRD §4.2
3. `feat/inventory-baseline-scoring` — PRD §4.3 (원래 "1번 작업" + CBH 통찰)

## 미해결 결정 (L1-L6)

PRD §10 Open Questions — 모두 default 권장값 있음, 별 결정 없이 시작 가능.

## CBH 채택 안 한 것 (skip 결정)

- Burp MCP integration (deterministic audit과 fit X)
- Slash commands (ClearToShip은 web UI 중심)
- H1 disclosure source (vibe-coded 도메인과 다름)
- Mid-engagement IR detection (1-shot audit과 무관)

## CBH 점수 비교 (PRD §1.4)

- ClearToShip: 6.05 / 10
- Claude-BugHunter: 7.45 / 10
- CBH 압도 영역: Skill (10/3), Command (9/4), Innovation (9/6), Doc (10/8)
- CTS 압도 영역: Agent architecture (5/3), API integration (7/5), CI/CD (8/7)

→ 결합 시 best-in-class.

## Related

- [[next-actions-2026-05-26]] — 즉시 시작 액션 큐
- [[setuptools-82-pkg-resources-removal]] — Phase 1 PR #38 burnt-in
- [[project-visual-audit-vision]] — orthogonal visual axis (Phase G already 머지됨)
