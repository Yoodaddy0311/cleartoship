---
name: feedback-gcloud-iam-wif
description: WIF + Cloud Run ID-token 발급 + Cloud Run service invoker 5가지 burnt-in 함정. deploy.yml smoke step이 prod 첫 실행에서 3번 실패하면서 학습.
metadata:
  type: feedback
---

# WIF + Cloud Run IAM — 2026-05-20 burnt-in 학습

5개 함정. PR #36 Phase 0 deploy가 prod에서 처음 smoke step을 돌렸을 때 3번 연속 실패. CI green이 prod 동작을 보장하지 않음을 다시 확인. 4시간 디버그 후 각 함정 해결.

## 1. WIF auth는 federated user — `--audiences` 거부

**증상**: `gcloud auth print-identity-token --audiences=$URL` →
> ERROR: Invalid account type for `--audiences`. Requires valid service account.

**원인**: `google-github-actions/auth@v2`는 `service_account` 옵션을 줘도 gcloud 세션을 federated identity로 둠. `--audiences` 플래그는 SA-typed principal만 받음.

**조치**: `--impersonate-service-account="$DEPLOYER_SA"` 추가.

```bash
TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="${{ secrets.GCP_DEPLOYER_SA }}" \
  --audiences="$URL")
```

## 2. SA가 자기 자신 impersonate하려면 self Token Creator 필요

**증상**: 위 1번 fix 후 — `PERMISSION_DENIED: Failed to impersonate [deployer-ci]`

**원인**: WIF federated identity → deployer-ci impersonate 시도 → `iam.serviceAccountTokenCreator` 없음.

**조치**: SA에게 self Token Creator 부여.
```bash
gcloud iam service-accounts add-iam-policy-binding deployer-ci@... \
  --member=serviceAccount:deployer-ci@... \
  --role=roles/iam.serviceAccountTokenCreator
```

## 3. `roles/run.admin`은 `run.routes.invoke` 포함 안 함

**증상**: 토큰 발급은 성공한 후 curl이 GFE 404. 토큰 valid (tokeninfo 통과), email_verified=true, aud 일치.

**원인**: deploy.yml 코멘트가 잘못된 가정 — "run.admin subsumes run.invoker"는 거짓. run.admin은 `run.services.*` (deploy/update)만 포함. `run.routes.invoke`는 별도.

**조치**: service-level invoker 명시 부여.
```bash
gcloud run services add-iam-policy-binding audit-worker \
  --member=serviceAccount:deployer-ci@... \
  --role=roles/run.invoker
```

## 4. `update-traffic` 한 번이 manual routing lock

**증상**: deploy 후 baseline으로 트래픽 회수 → 그 다음 deploy들이 새 리비전 만들어도 자동 promote 안 함. 트래픽 split이 `00026-srx=100, new=0`으로 고정.

**원인**: Cloud Run의 "manual traffic management" 모드. 사용자가 명시적으로 routing을 셋팅하면 그 split이 lock되고 이후 deploy는 새 리비전을 만들지만 routing 안 바꿈.

**조치**: 의도적으로 manual mode를 쓰지 않는다면, `update-traffic --to-latest`로 lock 해제 + auto-promote 모드 복귀.

**How to apply**: PR #36 Q1=A (manual 1회 procedure) 결정의 숨겨진 비용. Phase 1에서 `--no-traffic` 구조로 가면 이 함정 자동 회피.

## 5. baseline 이미지가 artifact registry tag와 매핑 안 됨

**증상**: rollback pin 시 prior image digest는 알지만 어떤 commit SHA로 빌드됐는지 추적 불가. `gcloud artifacts docker tags list`에 baseline digest 안 보임.

**원인**: artifact registry GC가 tag 정리. digest는 살아있어도 sha-XXX 태그가 사라지면 commit 추적 끊김.

**조치**: 매 prod-grade revision에 `prod-pin-YYYY-MM-DD` 태그를 박는 운영 routine. PR #36의 baseline 00026-srx에는 `rollback-pin-2026-05-20` 박음.

## 6. Cloud Run 404가 진단을 어렵게 한다

**증상**: GFE는 인증 실패, URL 미인식, IAM 거부를 **전부 404로 응답** (정보 노출 방지). 토큰 valid한데도 404 → 워커 도달 여부가 로그 봐야 알 수 있음.

**Why**: 보안 의도지만 디버그 경험 최악.

**How to apply**: GFE 404 받으면 즉시 `gcloud logging read` 로 워커까지 도달했는지 확인. 도달 흔적 없으면 IAM/audience 의심. 도달했으면 워커 코드의 route 등록 의심.

## 관련

- [[reference_phase0_prd]] §3.4 smoke step (이번에 fix됨)
- [[project_phase0_status]]
- 추가 mystery: `/healthz` GET이 새 리비전에서도 GFE 404 (다른 path는 워커 도달). 원인 불명. POST `/run` 401 응답은 워커까지 도달함을 증명. Phase 1 시작 전 시간 있으면 별도 조사.
