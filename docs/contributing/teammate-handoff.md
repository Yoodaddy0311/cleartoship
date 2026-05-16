# Teammate Handoff Protocol

한 agent의 작업이 완료되고 다음 agent가 이어받을 때, 컨텍스트 손실 없이 정보를 전달하는 표준 절차다. 이 프로토콜을 따르지 않으면 다음 agent가 완료된 작업을 다시 수행하거나, 알려진 제약을 무시하거나, 이미 결정된 사항을 재논의하게 된다.

---

## 개요

`/team` 모드에서 agent는 독립적인 컨텍스트 창을 가진다. planner가 설계한 내용을 frontend-developer가 그대로 이어받는다고 가정하면 안 된다. 각 agent는 자신의 작업이 끝날 때 **Handoff Payload**를 작성하고, `SendMessage`로 다음 agent에게 전달해야 한다.

**컨텍스트 단절이 발생하는 이유:**
- agent 간 메모리는 공유되지 않는다
- 이전 agent가 내린 판단(예: "A 방식 대신 B 방식을 선택한 이유")이 전달되지 않으면 다음 agent가 A로 되돌리는 역행이 발생한다
- 미해결 질문이 전달되지 않으면 조용히 묻힌다

---

## Handoff 트리거

다음 조건 중 하나에 해당하면 Handoff Payload를 작성하고 전송한다.

| 트리거 | 예시 |
|---|---|
| Task status를 `completed`로 전환할 때 | `TaskUpdate(taskId, status="completed")` 직전 |
| 다른 agent에게 작업을 위임할 때 | planner → frontend-developer |
| 자신의 작업 결과가 다른 agent의 입력이 될 때 | backend-developer → tdd-guide |
| 리뷰어가 변경 요청(REQUEST_CHANGES)을 반환할 때 | code-reviewer → 원작자 |

---

## Handoff Payload 표준

Handoff Payload는 아래 5개 필드를 모두 포함해야 한다. 필드를 생략하면 수신 agent는 해당 항목을 "알 수 없음"으로 처리하고 가장 보수적인 가정을 적용한다.

```
HANDOFF PAYLOAD
===============
From:         [송신 agent 이름]
To:           [수신 agent 이름]
TaskID:       [관련 Task ID]

1. 완료된 작업
   [이번 단계에서 실제로 완료된 작업을 구체적으로 기술한다.
    "설계 완료"가 아니라 "X 파일의 Y 함수 시그니처 확정, Z 컴포넌트 구조 결정"처럼 명시한다.]

2. 변경된 파일 목록
   [절대 경로 또는 프로젝트 루트 기준 상대 경로 목록.
    생성/수정/삭제를 구분한다.]

3. 다음 단계
   [수신 agent가 수행해야 할 작업을 번호 목록으로 기술한다.
    우선순위가 있으면 명시한다.]

4. 알려진 제약
   [수신 agent가 모르면 잘못된 방향으로 진행할 수 있는 결정 사항.
    예: "X 라이브러리는 사용 금지 — 라이선스 이슈", "Y API는 rate limit 100/분"]

5. 미해결 질문
   [아직 답을 모르거나 판단이 필요한 항목.
    수신 agent가 답하거나 에스컬레이션해야 한다.]
```

---

## 예시 1: planner → frontend-developer

```
HANDOFF PAYLOAD
===============
From:         planner
To:           frontend-developer
TaskID:       TASK-042

1. 완료된 작업
   - DevPipelineBanner 컴포넌트의 3가지 mode(cloud-tasks/direct-worker/stub) 동작 명세 확정
   - packages/ui/src/DevPipelineBanner/ 디렉토리 구조 설계 완료
   - Props 인터페이스 초안 작성 (packages/shared-types/src/banner.ts)

2. 변경된 파일 목록
   [생성] packages/shared-types/src/banner.ts
   [생성] docs/specs/dev-pipeline-banner.md

3. 다음 단계
   1. banner.ts의 BannerProps 인터페이스를 기반으로 컴포넌트 구현
   2. mode='stub'일 때 노란 배너 노출, mode='cloud-tasks'일 때 숨김
   3. tdd-guide에게 인수인계 전 storybook story 1개 작성

4. 알려진 제약
   - Tailwind만 사용 (CSS Modules 금지, 팀 결정 2025-03-10)
   - 접근성: 배너는 role="alert" aria-live="polite" 필수

5. 미해결 질문
   - mode='direct-worker'일 때 재시도 버튼을 포함할지 여부 — PM 확인 필요
```

---

## 예시 2: backend-developer → tdd-guide

```
HANDOFF PAYLOAD
===============
From:         backend-developer
To:           tdd-guide
TaskID:       TASK-055

1. 완료된 작업
   - apps/api/src/audit-runs/enqueue.ts 구현 완료
   - enqueue 실패 시 audit_run.status를 'FAILED'로 업데이트하는 로직 추가
   - Drizzle 트랜잭션으로 enqueue + status update 원자적으로 처리

2. 변경된 파일 목록
   [수정] apps/api/src/audit-runs/enqueue.ts
   [수정] apps/api/src/db/schema.ts (status enum에 'FAILED' 추가)

3. 다음 단계
   1. tests/audit-runs.test.ts에 unhappy path 테스트 작성
      - enqueue 실패 → status='FAILED' 마크 확인
      - 중복 enqueue 시도 → 409 응답 확인
   2. 커버리지 80% 이상 확보
   3. 완료 후 code-reviewer에게 인수인계

4. 알려진 제약
   - 테스트에서 실제 큐 연결 금지 — vi.mock()으로 격리할 것
   - status 전환은 enqueue.ts 내부에서만 발생해야 함 (외부에서 직접 변경 금지)

5. 미해결 질문
   - 없음
```

---

## 예시 3: code-reviewer → 원작자 (REQUEST_CHANGES)

```
HANDOFF PAYLOAD
===============
From:         code-reviewer
To:           backend-developer
TaskID:       TASK-055

1. 완료된 작업
   - PR #87 코드 리뷰 완료
   - REQUEST_CHANGES 결정

2. 변경된 파일 목록
   [없음 — 리뷰만 수행]

3. 다음 단계
   1. [필수] enqueue.ts L43: try/catch에서 catch 블록이 에러를 삼키고 있음
      status를 'FAILED'로 마크하지 않음 → test-first.md의 unhappy path 요건 위반
   2. [권장] enqueue.ts L67: 매직 넘버 3000 → MAX_RETRY_MS 상수로 추출
   3. 수정 후 tdd-guide에게 테스트 재확인 요청

4. 알려진 제약
   - 이 PR은 TASK-055 범위만 수정할 것 — 드라이브바이 변경 금지

5. 미해결 질문
   - catch 블록에서 에러를 Sentry로도 전송해야 하는가? (scope 밖이면 별도 이슈 등록)
```

---

## Anti-patterns

다음 패턴은 Handoff Payload로 인정하지 않는다.

| Anti-pattern | 문제 | 올바른 대안 |
|---|---|---|
| "이어서 해줘" | 완료된 작업, 제약, 미해결 질문이 없다 | 5개 필드 전체 작성 |
| "코드 보면 알 거야" | 수신 agent는 의도를 코드에서 역추론할 수 없다 | 결정 이유를 명시적으로 기술 |
| 변경 파일 목록 생략 | 수신 agent가 어느 파일을 읽어야 하는지 모른다 | 절대/상대 경로 목록 필수 |
| "다음 단계는 알아서" | 위임이 아니라 방기(abandonment)다 | 번호 목록으로 구체적 지시 |
| 미해결 질문 생략 | 묻힌 질문이 나중에 큰 재작업으로 돌아온다 | 질문이 없으면 "없음"으로 명시 |
