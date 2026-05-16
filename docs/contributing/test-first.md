# Test First

테스트를 먼저 작성한다. 구현 전에 테스트가 실패하는 것을 확인한 뒤 구현한다. 이 순서는 협상 불가다.

테스트는 사양의 실행 가능한 증명이다. 구현 후에 작성된 테스트는 동작을 검증하는 것이 아니라 구현을 문서화하는 것이다. 이 둘은 다르다.

---

## 개요

**왜 test-first인가?**

구현을 먼저 작성하면 테스트가 구현에 맞춰 작성된다. 경계 조건은 이미 처리된 것만 테스트된다. 실패 경로는 "구현에 없으니까" 누락된다. 테스트가 초록불이 되는 것은 보장이 아니라 우연이 된다.

테스트를 먼저 작성하면:
- 실패 케이스를 먼저 생각하게 된다
- 인터페이스가 호출 쪽 관점에서 설계된다
- 구현이 완료된 시점이 명확해진다 (테스트가 통과하는 순간)

---

## 3단계 사이클

### RED — 실패하는 테스트를 작성한다

아직 존재하지 않는 동작을 테스트한다. `pnpm test`를 실행했을 때 이 테스트가 빨간색으로 실패해야 한다. 테스트가 에러 없이 통과되면 테스트가 잘못 작성된 것이다.

```ts
// RED 예시: 함수가 아직 존재하지 않아도 된다
it('should mark audit run as FAILED when enqueue throws', async () => {
  mockQueue.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));

  await enqueueAuditRun({ auditRunId: 'run-1' });

  const run = await db.query.auditRuns.findFirst({
    where: eq(auditRuns.id, 'run-1'),
  });
  expect(run?.status).toBe('FAILED');
});
```

### GREEN — 테스트를 통과시키는 최소한의 코드를 작성한다

아름다운 코드를 쓰지 않아도 된다. 이 단계의 목표는 오직 테스트를 통과시키는 것이다. 중복이 있어도 된다. 하드코딩도 허용된다. 단, 이 단계에서 새 테스트를 추가하지 않는다.

### REFACTOR — 테스트를 유지하면서 코드를 정리한다

중복을 제거한다. 이름을 명확히 한다. 추상화를 도입한다. 매 리팩터링 단계마다 `pnpm test`가 통과해야 한다. 리팩터링 중에 테스트가 실패하면 즉시 되돌린다.

---

## ClearToShip 도메인 예시

### 예시 1: audit-runs 실패 경로 (실제 stop hook 위반 사례)

`workers/audit-worker`에서 enqueue 실패 시 `audit_run.status`가 `'FAILED'`로 마크되지 않는 버그가 stop hook을 발동시켰다. 이 버그는 테스트가 happy path만 다루고 있었기 때문에 발견되지 않았다. 올바른 접근 방법은 다음과 같다.

```ts
// tests/audit-runs.test.ts — unhappy path 먼저
describe('enqueueAuditRun', () => {
  it('marks status as FAILED when queue is unavailable', async () => {
    vi.spyOn(queue, 'enqueue').mockRejectedValueOnce(
      new Error('Connection refused')
    );

    await enqueueAuditRun({ auditRunId: 'run-abc' });

    const result = await getAuditRunStatus('run-abc');
    expect(result.status).toBe('FAILED');
  });

  it('marks status as QUEUED on success', async () => {
    vi.spyOn(queue, 'enqueue').mockResolvedValueOnce({ jobId: 'job-1' });

    await enqueueAuditRun({ auditRunId: 'run-xyz' });

    const result = await getAuditRunStatus('run-xyz');
    expect(result.status).toBe('QUEUED');
  });
});
```

### 예시 2: DevPipelineBanner stub 모드 알림

```tsx
// apps/web/src/components/DevPipelineBanner.test.tsx — mode='stub' 먼저
describe('DevPipelineBanner', () => {
  it('renders warning when mode is stub', () => {
    render(<DevPipelineBanner mode="stub" />);

    expect(
      screen.getByRole('alert')
    ).toHaveTextContent('스텁 모드로 실행 중입니다');
  });

  it('renders nothing when mode is cloud-tasks', () => {
    const { container } = render(<DevPipelineBanner mode="cloud-tasks" />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

---

## 테스트 종류별 가이드

| 종류 | 범위 | 도구 | 위치 |
|---|---|---|---|
| Unit | 단일 함수 / 컴포넌트 | vitest + @testing-library/react | `*.test.ts` / `*.test.tsx` |
| Integration | 복수 모듈 + DB | vitest + drizzle test DB | `tests/integration/*.test.ts` |
| E2E | 브라우저 전체 흐름 | Playwright | `tests/e2e/*.spec.ts` |

**원칙:** 외부 서비스(큐, 이메일, 외부 API)는 unit/integration 테스트에서 항상 vi.mock()으로 격리한다. 실제 연결은 E2E에서만 허용된다.

---

## Vitest 설정

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',         // React import 자동 주입
  },
  test: {
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],   // React 컴포넌트는 jsdom
      ['**/*.test.ts', 'node'],     // 순수 로직은 node
    ],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 90,
      },
    },
  },
});
```

---

## 커버리지 목표

| 대상 | 기준 | 적용 범위 |
|---|---|---|
| 라인 커버리지 | 80% 이상 | 이 PR에서 변경된 파일 전체 |
| 함수 커버리지 | 90% 이상 | 이 PR에서 변경된 파일 전체 |
| 브랜치 커버리지 | 명시적 목표 없음 | 단, 모든 에러 경로에 테스트 필수 |

**증거:** `pnpm test:coverage`의 마지막 줄을 PR에 붙여넣는다.

---

## Anti-patterns

| Anti-pattern | 이유 | 올바른 대안 |
|---|---|---|
| 구현 후 테스트 작성 | 테스트가 구현을 추인(ratify)하게 된다 | 테스트 → 구현 순서 준수 |
| Snapshot 테스트 남용 | 스냅샷은 변경을 감지하지 동작을 검증하지 않는다 | 구체적인 assertion 사용 |
| `await sleep(1000)` | 타이밍에 의존하는 테스트는 flaky하다 | `vi.useFakeTimers()` 또는 `waitFor()` |
| Happy path만 테스트 | 버그는 대부분 에러 경로에서 발생한다 | 실패 케이스를 먼저 작성 |
| `it.skip` 또는 `test.skip` | 빈 안전망이다 | 테스트를 작성하거나 이유를 PR에 명시 |
