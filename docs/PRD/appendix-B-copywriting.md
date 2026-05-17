# Appendix B: Copywriting — USP 3개 카피라이팅 초안

**작성일**: 2026-05-18
**작성자**: planner / Claude (Opus 4.7) — design-only
**상위 PRD**: [finalize-launch-2026-05-18.md](./finalize-launch-2026-05-18.md)
**참조 섹션**: §2 USP-1/2/3 + §6.4 차별화 D1/D2/D3
**목적**: 랜딩 페이지 + SEO 메타 + 트위터 카드 + 이메일 transactional 카피의 1차 초안 SSOT

---

## §B.1 브랜드 보이스 가이드

### 톤

| 축 | 위치 | 의미 |
|---|---|---|
| 직설 ↔ 완곡 | **직설** | "ship 가능" "P0 3건" 같이 결론부터 |
| 신중 ↔ 과시 | **신중** | AI hype 없음, 측정 가능한 표현만 |
| 친근 ↔ 전문 | **전문** | 개발자 대상 — 용어 (P0, CORS, CTA) 그대로 |
| 한국어 ↔ 영어 | **한국어 본문 + 영어 기술용어** | 제품명 ClearToShip는 영어 유지 |

### 금지 단어 → 대체 표현

| 금지 | 사유 | 대체 |
|---|---|---|
| "혁명적인" | 과장 | "측정 가능한" / "검증된" |
| "AI가 자동으로 모든 것을" | AI hype | "12 카테고리 자동 진단" |
| "100% 정확" | 검증 불가 | "Confidence: HIGH 표시" |
| "click and forget" | 책임 회피 | "리포트 검토 후 우선순위 선택" |
| "마법처럼" | 의미 0 | "30초 안에" / "1줄 결론" |
| "차세대" | 진부 | "ship-readiness 단일 점수" |
| "최강" / "최고" | 비교 불가 | "PRD-aware 진단 (유일)" |
| "혁신" | 과장 | "신규 진단 카테고리" |

### 선호 표현

- "ship 전 점검"
- "코드 외부 송신 0"
- "30초 진단"
- "1줄 결론"
- "P0/P1 우선순위"
- "측정된 evidence"
- "BYOK 미사용" (privacy 메시지)
- "즉시 시작 / 익명 인증"

---

## §B.2 USP-1 (Vibe-Coded) 카피

### §B.2.1 히어로 3안

| 안 | 메인 (≤25자) | 서브 (≤45자) |
|---|---|---|
| **A** | Vibe-Coded? Ship it. 다만 점검 후에. | AI 짝코딩 산출물 전용 진단 — 30초, 코드 외부 송신 0 |
| **B** | 빠르게 만든 코드, 빠르게 점검하라 | Ghost Button부터 .env leak까지 12 카테고리 자동 진단 |
| **C** | 당신의 바이브 코딩, ship 준비됐나? | 단일 점수 + 1줄 결론 + Top 3 blocker — 익명 시작 |

### §B.2.2 섹션 본문 (~150자)

> AI 짝코딩, 해커톤, 스피드런으로 만든 산출물에는 특유의 안티패턴이 있습니다 — 클릭되지 않는 ghost button, 미사용 import 폭증, mock 데이터 잔존, .env 누출. ClearToShip의 Vibe-Coded profile은 이런 패턴을 우선 검출하고, 각 finding 옆에 "지금 할 일 (5분/30분)"을 함께 제공합니다.

### §B.2.3 CTA 버튼 3안

- A: "내 코드 진단하기"
- B: "Vibe Audit 시작 (30초)"
- C: "ship 전 점검 — 무료"

### §B.2.4 메타 디스크립션 (155자 이내)

> AI 짝코딩 산출물 전용 코드 진단 도구. Ghost button, .env leak, mock 데이터 잔존 같은 바이브 코딩 안티패턴을 30초만에 12 카테고리로 자동 분석합니다. 코드 외부 송신 0, 익명 시작. (151자)

### §B.2.5 OG 이미지 캡션

> Vibe-Coded? Audit it before you ship.

### §B.2.6 트위터/X 카드 (280자 이내)

> AI로 빠르게 만든 코드, ship 전에 점검하세요. ClearToShip은 Ghost Button, .env leak, mock 데이터 잔존 같은 바이브 코딩 안티패턴을 12 카테고리로 진단합니다. 코드 외부 송신 0, 30초 안에 1줄 결론 + Top 3 blocker. 무료, 익명 시작. #vibecoding #shipreadiness (218자)

**§B.1 self-check**: ✅ 금지 단어 0건, "AI hype" 없음, 측정 가능한 수치만.

---

## §B.3 USP-2 (PRD-aware) 카피

### §B.3.1 히어로 3안

| 안 | 메인 (≤25자) | 서브 (≤45자) |
|---|---|---|
| **A** | PRD에 적은 기능, 실제로 구현됐나요? | PRD 클레임 → 구현 증거 1:1 매칭 — Coverage Matrix |
| **B** | 요구사항 vs 코드, 1대1로 점검합니다 | PRD 업로드 → claim 별 ✅/⚠️/❓ 자동 판정 |
| **C** | "기능 다 만들었나?"에 표로 답합니다 | 미구현 claim은 P0/P1으로 자동 승급 |

### §B.3.2 섹션 본문 (~150자)

> SonarQube는 코드 품질만, Snyk는 보안만, Lighthouse는 성능만 봅니다. "PRD에 적은 기능이 실제로 구현됐는지"를 검증하는 도구는 ClearToShip이 유일합니다. PRD를 업로드하면 step 5 ANALYZE_PRD가 claim을 추출하고, W1-A measuredBy detector가 코드에서 evidence를 찾아 1:1 표로 보여줍니다.

### §B.3.3 CTA 버튼 3안

- A: "PRD 업로드하고 진단"
- B: "Coverage Matrix 보기"
- C: "claim 매칭 점검 (30초)"

### §B.3.4 메타 디스크립션 (155자 이내)

> PRD 요구사항이 실제로 코드에 구현됐는지 1:1로 검증하는 유일한 진단 도구. PRD 업로드 → claim 추출 → 코드 evidence 매칭 → Coverage Matrix 자동 생성. 익명 시작, 코드 외부 송신 0. (148자)

### §B.3.5 OG 이미지 캡션

> PRD에 적은 기능, 코드에 다 있나요?

### §B.3.6 트위터/X 카드 (280자 이내)

> "PRD에 적은 기능, 실제로 구현됐나요?" — ClearToShip은 PRD 클레임을 추출해 코드 evidence와 1:1로 매칭하는 유일한 진단 도구입니다. 미구현 claim은 P0/P1으로 승급. SonarQube/Snyk/Lighthouse 어떤 도구도 못하던 진단. 무료, 익명 시작. #PRD #shipreadiness (231자)

**§B.1 self-check**: ✅ "유일한"은 측정 가능 (경쟁군 4종 비교 검증). 과장 아님.

---

## §B.4 USP-3 (Ship-Readiness 단일 점수) 카피

### §B.4.1 히어로 3안

| 안 | 메인 (≤25자) | 서브 (≤45자) |
|---|---|---|
| **A** | 이 코드, ship 가능한가? 1줄로 답합니다 | READY / NEEDS_WORK / BLOCKED — 4단계 verdict |
| **B** | "출시 가능?"에 단일 점수로 답하는 첫 도구 | 12 카테고리 통합 → Ship Score 0~100 + Top 3 blocker |
| **C** | Lighthouse + SonarQube + Snyk를 1줄로 | 단일 verdict + 비교 기준점 (P50/P90 + 직전 run diff) |

### §B.4.2 섹션 본문 (~150자)

> 코드 품질은 SonarQube, 보안은 Snyk, 성능은 Lighthouse. 그런데 "전체적으로 ship 가능한가?"에 단일 답을 주는 도구는 없었습니다. ClearToShip은 12 카테고리 가중 점수를 종합한 Ship Score와 4단계 verdict (READY/READY_WITH_CAVEATS/NEEDS_WORK/BLOCKED) + 1줄 사유를 리포트 최상단에 표시합니다.

### §B.4.3 CTA 버튼 3안

- A: "Ship Verdict 받기 (30초)"
- B: "내 코드 점수 확인"
- C: "1줄 결론 받기"

### §B.4.4 메타 디스크립션 (155자 이내)

> "이 코드, ship 가능한가?"에 1줄로 답하는 유일한 도구. 12 카테고리 통합 점수 + 4단계 verdict + Top 3 blocker + P50/P90 비교까지 30초 안에. 코드 외부 송신 0, 익명 시작. (143자)

### §B.4.5 OG 이미지 캡션

> Ship-readiness, in one verdict.

### §B.4.6 트위터/X 카드 (280자 이내)

> SonarQube는 품질만, Snyk는 보안만, Lighthouse는 성능만. "전체적으로 ship 가능?"엔 누구도 답 못했습니다. ClearToShip은 12 카테고리 통합 Ship Score + 4단계 verdict + Top 3 blocker + P50/P90 비교를 30초 안에. 1줄 결론. 무료. #shipreadiness (225자)

**§B.1 self-check**: ✅ "유일한" 검증됨, 측정 가능한 수치.

---

## §B.5 랜딩 페이지 카피 순서 (위→아래)

| # | 섹션 | 내용 | 카피 출처 |
|---|---|---|---|
| 1 | **히어로** (above the fold) | USP-3 안 A 메인 + 서브 + CTA-A | §B.4.1 / §B.4.3 |
| 2 | **신뢰 한 줄** | "코드 외부 송신 0 · BYOK 미사용 · 익명 시작" | 공통 |
| 3 | **USP-1 섹션** (Vibe-Coded) | 안 B 메인 + 본문 + CTA-B | §B.2.1-3 |
| 4 | **USP-2 섹션** (PRD-aware) | 안 A 메인 + 본문 + CTA-A | §B.3.1-3 |
| 5 | **USP-3 섹션** (Ship Verdict) | 안 C 메인 + 본문 + CTA-C | §B.4.1-3 |
| 6 | **How it works** (3 step) | 1. URL 입력 → 2. 30초 진단 → 3. 1줄 결론 + 리포트 | 신규 (LP) |
| 7 | **사회적 증거** | TBD — 런치 후 추가 (placeholder: "현재 베타 진행 중") | 신규 |
| 8 | **CTA 반복 (sticky)** | "내 코드 진단하기" — USP-1 CTA-A | §B.2.3 |
| 9 | **Privacy 한 줄** | "코드 외부 송신 0. BYOK 미사용. 익명 인증 즉시 시작." | 공통 |
| 10 | **Footer** | 약관 / 개인정보처리방침 / DATA POLICY / 회사 정보 | 신규 |

---

## §B.6 이메일 Transactional 카피

### §B.6.1 "감사 완료" 이메일

**Subject** (50자 이내):

> [ClearToShip] {repoName} 진단 완료 — Verdict: {verdict}

**본문**:

```
{repoName} 진단이 완료되었습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ship Verdict: {verdict}            (예: NEEDS_WORK)
Ship Score:   {score}/100          (P50: {p50})
Confidence:   {confidence}         (HIGH/MED/LOW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{verdict가 NEEDS_WORK/BLOCKED인 경우 Top 3 blocker}
Top blockers:
  ① {title} ({category}, {etaMinutes}분 작업)
  ② {title} ({category}, {etaMinutes}분 작업)
  ③ {title} ({category}, {etaMinutes}분 작업)

[리포트 전체 보기 → {reportUrl}]

— ClearToShip
   코드 외부 송신 0 · BYOK 미사용 · privacy 우선
```

### §B.6.2 "P0 발견됨" 이메일 (즉시 알림)

**Subject** (50자 이내):

> [ClearToShip] {repoName} P0 {count}건 — 즉시 검토 권장

**본문**:

```
{repoName} 진단에서 P0 finding {count}건이 발견되었습니다.
프로덕션 배포 전 해결이 필요합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P0 Findings (즉시 검토)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

① {title}
   카테고리: {category}
   증거: {file:line} (또는 {findingId})
   지금 할 일: {actionHint.text} ({actionHint.etaMinutes}분)

② {title}
   …

③ {title}
   …

[전체 리포트 → {reportUrl}]
[Diff 보기 (직전 run 대비) → {diffUrl}]

— ClearToShip
```

---

## §B.7 변경 이력

| 날짜 | 변경 | 작성자 |
|---|---|---|
| 2026-05-18 | 최초 작성 — 브랜드 보이스 + USP 3 × 6 카피 유형 + 랜딩 순서 + 이메일 2종 | planner / Claude (Opus 4.7) |
