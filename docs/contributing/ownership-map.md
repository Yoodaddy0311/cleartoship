# Ownership Map

코드베이스의 어떤 영역이 깨졌을 때 **누가 책임지는가**를 한 곳에서 답한다. 이 문서는 PR 리뷰어 배정, 인시던트 에스컬레이션, agent 위임 결정의 단일 출처(Single Source of Truth)다.

---

## 개요

ClearToShip은 복수의 app, worker, 공유 패키지, 인프라 설정으로 구성된다. 변경이 발생했을 때 "이 파일을 누가 검토해야 하나"를 즉시 알 수 없으면 리뷰가 지연되거나 책임이 공백으로 남는다.

Ownership Map은 다음 질문에 답한다:

- 이 경로의 변경을 1차로 검토하는 agent는 누구인가?
- 1차 owner가 부재 시 2차 owner는 누구인가?
- 이 영역과 관련된 PRD 또는 설계 문서는 무엇인가?

---

## 영역별 Ownership 표

| Path / Glob | Primary Owner Agent | Secondary Owner Agent | 관련 PRD / 문서 |
|---|---|---|---|
| `apps/web/**` | `frontend-developer` | `code-reviewer` | UI 명세, PRD-WEB |
| `apps/api/**` | `backend-developer` | `code-reviewer` | API 설계 문서, PRD-API |
| `workers/audit-worker/**` | `backend-developer` | `llm-architect` | 감사 워커 설계, PRD-AUDIT |
| `packages/shared-types/**` | `typescript-pro` | `backend-developer` | 타입 계약 문서 |
| `packages/audit-core/**` | `llm-architect` | `backend-developer` | LLM 파이프라인 설계 |
| `packages/ui/**` | `frontend-developer` | `typescript-pro` | 컴포넌트 스펙 |
| `.github/workflows/**` | `devops-engineer` | `security-reviewer` | CI/CD 런북 |
| `docs/**` | `doc-updater` | (없음) | 이 문서 자체 |
| `tests/` + `**/*.test.ts` | `tdd-guide` | `code-reviewer` | test-first.md |
| `**/*.test.tsx` | `tdd-guide` | `frontend-developer` | test-first.md |

**규칙:** Primary owner는 해당 경로에 영향을 주는 모든 PR을 리뷰 대상으로 간주한다. Secondary owner는 Primary가 응답 없을 때 또는 cross-domain 변경 시 자동으로 포함된다.

---

## Cross-cutting 책임

일부 관심사는 특정 경로에 국한되지 않고 코드베이스 전반에 걸쳐 적용된다.

| 관심사 | 담당 Agent | 적용 범위 |
|---|---|---|
| 인증 / 비밀키 / 권한 코드 | `security-reviewer` | 모든 `auth`, `secret`, `token`, `env` 관련 변경 |
| 모든 PR 코드 품질 | `code-reviewer` | 경로 무관, 모든 PR 리뷰 최종 통과 |
| 타입 안전성 전반 | `typescript-pro` | `noEmit` 실패 시 자동 참여 |
| 성능 회귀 | `performance-engineer` | 번들 크기 변경, DB 쿼리 추가 시 |
| 데이터베이스 스키마 변경 | `database-reviewer` | 모든 마이그레이션 파일 |

---

## Escalation Path

아래 조건에 해당하면 `architect` agent로 에스컬레이션한다. 판단이 애매할 때는 에스컬레이션이 기본값이다.

```
에스컬레이션 트리거:
  1. 변경이 2개 이상의 Primary owner 영역에 걸친다
  2. 기존 설계 결정을 번복하는 변경이다
  3. 신규 외부 서비스 통합이 포함된다
  4. Primary owner가 48시간 이내 응답하지 않는다
  5. "이 변경이 안전한가"라는 질문에 자신 없이 답하게 된다

에스컬레이션 방법:
  → SendMessage(recipient="architect", type="message")
  → 변경 경로, 영향 범위, 판단이 어려운 이유를 포함할 것
```

---

## Maintenance

이 문서 자체의 owner는 `doc-updater`다.

- 새 경로 또는 패키지가 추가될 때마다 이 표를 갱신한다.
- Agent 이름이 변경되거나 역할이 재편될 때 즉시 반영한다.
- 매 분기(quarter) 표 전체를 검토하여 현실과의 drift를 제거한다.

**갱신 책임:** 새 경로를 추가한 개발자(또는 담당 agent)가 PR에서 이 표를 함께 수정한다. 표 갱신 없이 새 경로를 도입하는 PR은 `doc-updater`의 리뷰 없이 머지될 수 없다.
