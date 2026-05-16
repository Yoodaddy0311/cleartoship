# Skip Ban

multi-part 요청의 일부를 조용히 건너뛰지 않는다. 요청과 결과의 1:1 일치는 신뢰의 기반이다. 이를 위반하면 어떤 이유로도 정당화되지 않는다.

---

## 개요

요청 항목을 조용히 생략하는 것은 단순한 실수가 아니다. 요청자는 결과물이 요청을 완전히 반영한다고 전제한다. 그 전제가 깨지면 결과물 전체를 신뢰할 수 없게 된다.

**Skip이 발생하는 이유 (모두 무효한 이유다):**

- "이건 작아서 굳이 안 해도 될 것 같아서"
- "시간이 오래 걸릴 것 같아서"
- "다음 PR에서 하면 될 것 같아서"
- "어차피 다른 사람이 할 것 같아서"

이유의 타당성과 관계없이, 요청 항목을 처리하지 않을 때는 반드시 **명시적으로 보고**해야 한다.

---

## DEV Protocol 1단계: DECOMPOSE 의무

모든 작업은 실행 전에 원자적 항목으로 분해한다. 분해는 건너뛸 수 없다.

**분해 규칙:**

- 요청 문장에 포함된 모든 **액션 동사**는 별도 아이템이다
- "A를 하고 B도 수정하고 C 문서 업데이트" → 3개 아이템
- 각 아이템에는 번호를 부여한다
- 분해된 아이템 목록을 먼저 출력한 뒤 실행한다

```
올바른 분해 예시:

요청: "enqueue 실패 시 FAILED 마크를 추가하고 테스트를 작성하고
       PR 설명을 업데이트해줘"

DECOMPOSE:
  1. enqueue.ts catch 블록에 status='FAILED' 업데이트 로직 추가
  2. tests/audit-runs.test.ts에 enqueue 실패 unhappy path 테스트 작성
  3. PR 설명의 Test Plan 섹션 업데이트
```

분해 목록을 작성한 뒤 각 항목을 순서대로 실행하고, 실행 후 증거를 항목별로 보고한다.

---

## 블로커 발생 시 보고 형식

항목을 처리할 수 없는 경우, 조용히 생략하지 않고 아래 형식으로 보고한다.

```
DECOMPOSE 결과 보고:

  ✅ 1. enqueue.ts catch 블록 수정
        → apps/api/src/audit-runs/enqueue.ts L43 수정 확인

  ❌ 2. tests/audit-runs.test.ts 테스트 작성
        WHY: 테스트 대상 함수의 인터페이스가 확정되지 않음
             (enqueueAuditRun의 반환 타입이 void인지 Promise<void>인지 미확정)
        대안: typescript-pro에게 인터페이스 확정 요청 후 재시도
              또는 요청자가 직접 반환 타입을 지정해주면 즉시 진행 가능

  ✅ 3. PR 설명 업데이트
        → PR #87 Test Plan 섹션 갱신 확인
```

**규칙:**
- ✅ 는 완료와 증거(파일:라인 또는 출력 결과)를 포함한다
- ❌ 는 WHY(정확한 이유)와 대안(다음 액션)을 포함한다
- "❌ 못 했음"만 적고 끝내는 것은 보고가 아니다

---

## 실제 사례: audit-runs stop hook 발동

**발생 상황:**

`enqueueAuditRun` 함수에 enqueue 실패 처리를 추가하는 작업에서, 구현자가 try/catch를 추가했지만 catch 블록에서 `audit_run.status`를 `'FAILED'`로 마크하는 로직을 조용히 누락했다. 해당 항목은 요청 원문에 명시되어 있었다.

**결과:**

- stop hook이 발동되어 PR이 머지 차단됨
- 누락된 동작을 발견하기 위해 전용 테스트를 새로 작성해야 했음
- 재작업 비용: 원래 구현 시간의 약 2배

**올바른 처리 방법:**

```ts
// apps/api/src/audit-runs/enqueue.ts
export async function enqueueAuditRun({ auditRunId }: { auditRunId: string }) {
  try {
    await queue.enqueue({ auditRunId });
    await db.update(auditRuns)
      .set({ status: 'QUEUED' })
      .where(eq(auditRuns.id, auditRunId));
  } catch (err) {
    // catch 블록에서 FAILED 마크 — 이 줄이 누락되었다
    await db.update(auditRuns)
      .set({ status: 'FAILED' })
      .where(eq(auditRuns.id, auditRunId));
    throw err;
  }
}
```

**테스트로 강제 검증:**

```ts
// tests/audit-runs.test.ts
it('marks status FAILED when queue.enqueue throws', async () => {
  vi.spyOn(queue, 'enqueue').mockRejectedValueOnce(new Error('unavailable'));

  await enqueueAuditRun({ auditRunId: 'run-1' }).catch(() => {});

  expect(await getAuditRunStatus('run-1')).toBe('FAILED');
});
```

이 테스트가 존재했다면 catch 블록 누락은 RED 단계에서 발견되었을 것이다.

---

## 검수 체크리스트 (Phase 4.5)

작업 완료 선언 전에 아래 5개 항목을 체크한다. 하나라도 ❌이면 완료가 아니다.

```
Phase 4.5 검수:

  [ ] 1. 요청 일치
         요청 문장의 모든 액션 동사에 대응하는 완료 항목이 있는가?
         DECOMPOSE 목록과 결과 보고를 1:1로 대조한다.

  [ ] 2. 범위 준수
         요청 범위 밖의 파일을 변경하지 않았는가?
         드라이브바이 변경은 별도 이슈로 분리한다.

  [ ] 3. 무결성
         변경 후 pnpm test, pnpm type-check, pnpm lint가 통과하는가?
         CI가 아니라 로컬에서 직접 확인한다.

  [ ] 4. 품질
         functions < 50줄, files < 800줄 기준을 충족하는가?
         새로운 TODO/fixme 주석이 이슈 링크 없이 추가되지 않았는가?

  [ ] 5. 부작용
         이 변경이 의도하지 않은 동작 변경을 일으키지 않는가?
         특히 공유 패키지(packages/*) 변경 시 의존 모듈을 확인한다.
```

---

## Anti-patterns

| Anti-pattern | 왜 금지인가 |
|---|---|
| "나중에 할게요" | 나중은 없다. 요청 시점에 완료하거나 명시적 블로커를 보고한다. |
| "이건 작아서 안 해도 됨" | 크기는 skip의 이유가 되지 않는다. 작으면 바로 한다. |
| "테스트는 다음 PR에서" | 테스트 없는 코드는 완료가 아니다. definition-of-done 기준 미달이다. |
| 블로커를 보고하지 않고 다음 항목으로 넘어감 | 요청자는 모든 항목이 완료됐다고 전제한다. 침묵은 완료 신호다. |
| DECOMPOSE 없이 바로 실행 | 누락 항목이 실행 중에 조용히 사라진다. 분해 목록이 감사 기록이다. |
