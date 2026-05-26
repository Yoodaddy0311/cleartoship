---
name: project-visual-audit-vision
description: 비개발자/초보자가 audit 결과를 "시각적으로" 이해하게 만드는 UX 비전. 사용자가 2026-05-20 첫 prod audit 결과를 보고 제안한 방향. Phase 2/3 후보 feature 정의.
metadata:
  type: project
---

# 시각적 Audit UX — Phase 2/3 비전

## 사용자 제안 (2026-05-20)

> "지금도 좋은데 사용자(초보자, 비개발자 포함)가 시각적으로 어떤 게 부족하고 어떤 걸 개선해야 될지, 어떤 건 괜찮은지가 확 와닿아야 해. 디자인 같은 경우는 레퍼런스 준 것처럼 체크체크하면서 시각적으로 어떤 게 잘되어 있고 안되어 있구나 느끼게끔."

**Why**: Phase 0 audit이 점수(54) + 카테고리별 N/A/PASS는 보여주지만, 비개발자가 "그래서 뭐가 어떻다는 거냐"를 시각화 없이는 못 느낌. ClearToShip의 differentiation은 "vibe-coded project 운영자가 알아듣게 만드는 audit" — 그러면 시각화가 핵심.

**How to apply**: Phase 1 (semgrep + osv) 끝난 뒤 Phase 2 PRD를 짤 때, 다음 3가지 visual feature를 우선 후보로 고려.

## V1 — 스크린샷 기반 시각 진단

**기능**: audit 대상 URL의 핵심 페이지 N개를 chromium으로 캡처. 각 페이지에 **레이어 overlay**로 문제 지점 시각 표시.

- 색상 토큰 어긋난 컴포넌트 → 빨간 박스
- 폰트 크기 jumping (8sp -> 13sp -> 17sp 같은 임의 스케일) → 노란 점
- 접근성 위반 (contrast ratio, alt text 누락) → 보라 박스
- 모바일에서 잘리는 버튼 → 주황 표시

**기술 조각**: chromium 이미 워커에 들어옴 (Phase 0). `playwright screenshot` + DOM coordinate overlay rendering (canvas 또는 SVG). 결과는 PNG로 GCS 저장, Firestore에서 URL 참조.

**점수에 대한 신뢰도 영향**: 큼. 지금 design-consistency가 "코드 일관성"만 보고 있어서 비개발자에겐 추상적. 시각 overlay는 "여기가 깨졌어요" 한 줄로 끝.

## V2 — 레퍼런스 비교 모드

**기능**: 사용자가 reference 디자인 시스템 URL (또는 Figma export)을 같이 제출. audit이 두 사이트의 layout/color/spacing을 SSIM + DOM diff로 비교 → "레퍼런스 대비 60% 일관" 같은 수치.

**Why**: vibe-coding 운영자는 보통 "Stripe처럼 보이게" "Linear처럼 보이게" 같은 mental reference가 있음. 그 reference와의 거리를 측정.

**기술 조각**:
- Pixel-level: SSIM (structural similarity) — 같은 viewport에서 캡처 후 비교
- DOM-level: 색상 팔레트 distance, spacing scale distance, typography hierarchy match
- Semantic-level (장기): 두 사이트의 navigation/CTA 위치 비슷한지

**비용**: reference 사이트 1개 추가 → audit 시간 +30~60초.

## V3 — "이건 괜찮아요" 가시화 (긍정 시그널)

**현재 문제**: 점수 화면이 결함 위주로 정렬돼서 사용자가 "그래도 잘된 게 있나?"를 못 느낌. ✓ 표시들은 작게 들어가서 시각 임팩트 없음.

**제안**: "Strengths" 섹션을 결함 섹션과 동일 비중으로 노출.
- "✅ 모바일 viewport 12개 페이지 모두 미응답 없음"
- "✅ 의존성 0건 critical 취약점 (Phase 1 이후)"
- "✅ 평균 LCP 1.8s (95퍼센타일 기준 Good 영역)"

각 strength에 **작은 시각 증거**(스크린샷 thumbnail, 차트, 숫자 visualisation) 첨부.

**Why**: 비개발자는 "내가 만든 거에 칭찬 한 줄"을 통해 다음 개선 의지가 생김. 결함만 나열하면 "그래서 다 다시 만들라는 거?" 좌절감.

## 채점 신뢰도와 분리할 것

Phase 0의 점수 신뢰도는 카테고리 coverage가 채워지면 자연스럽게 올라감. 시각 UX는 점수 신뢰도와 **별개로 사용자 경험**의 문제 — 같은 54점이라도 "왜 54인지 비개발자가 5초 안에 이해"하면 launch 의사결정이 가능해짐.

## 우선순위 가이드

Phase 1 (2026-06-01~02): semgrep + osv (점수 신뢰도)
Phase 2 (대략 06-15~): V1 (스크린샷 + overlay) — 가장 영향 큰 시각 feature
Phase 3+: V2 (레퍼런스 비교), V3 (긍정 시그널 패널)

## 관련

- [[project_phase0_status]] — Phase 0 점수 54 첫 KPI 통과
- [[reference_phase0_prd]] — 점수 카테고리 weight 정의된 곳
- [[project_next_actions]] — 다음 세션 첫 작업 queue
