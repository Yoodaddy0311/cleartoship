# Billing Kill Switch

결제 계정 전체(모든 프로젝트) 지출이 **₩5,000**에 도달하면 모든 프로젝트에서 결제 계정을 자동 분리해 이후 지출을 0으로 만드는 안전장치. 2026-07-05 무료 티어 결정의 일부.

## 구성 요소

| 리소스 | 이름 | 위치 |
|--------|------|------|
| 예산 | `kill-switch-krw-5000` (₩5,000, 결제 계정 전체 범위) | billing account `016B17-6277B6-57F6E1` |
| Pub/Sub 토픽 | `billing-kill-switch` | `cleartoship-prod` |
| Cloud Function (gen2) | `billing-kill-switch` | `cleartoship-prod` / `asia-northeast3` |
| 서비스 계정 | `billing-kill-switch@cleartoship-prod.iam.gserviceaccount.com` (billing account에 `roles/billing.admin`) | — |

## 동작

1. 예산이 비용 재계산 때마다(하루 수회) Pub/Sub으로 메시지 발행 — `costAmount`, `budgetAmount` 포함
2. Function이 `costAmount >= budgetAmount`일 때만 발동
3. 결제 계정에 연결된 **모든** 프로젝트를 순회하며 결제 분리 → Cloud Run/Firestore 등 유료 서비스 전체 정지

주의: 비용 집계가 실사용보다 몇 시간 늦으므로 임계값을 약간 초과한 뒤 멈출 수 있음. "정확히 ₩5,000 보장"이 아니라 폭주 방지 장치.

## 발동 후 복구 절차

1. [콘솔 → 결제 → 계정 관리](https://console.cloud.google.com/billing/016B17-6277B6-57F6E1/manage)에서 프로젝트별 "결제 계정 연결" 다시 설정
2. 폭주 원인 파악 후 예산 임계값 재조정 (`gcloud billing budgets update`)
3. Cloud Run 서비스는 결제 재연결 후 자동 복구 (재배포 불필요, 단 첫 요청은 cold start)

## 무장 해제 (일시적으로 끄기)

```bash
gcloud functions deploy billing-kill-switch --gen2 --region=asia-northeast3 \
  --project=cleartoship-prod --update-env-vars=KILL_SWITCH_ARMED=0
```

`KILL_SWITCH_ARMED=0`이면 로그만 남기고 결제를 분리하지 않는다 (dry run).

## 배포 (변경 시)

```bash
gcloud functions deploy billing-kill-switch --gen2 --runtime=nodejs20 \
  --region=asia-northeast3 --project=cleartoship-prod \
  --source=infra/billing-kill-switch --entry-point=stopBilling \
  --trigger-topic=billing-kill-switch \
  --service-account=billing-kill-switch@cleartoship-prod.iam.gserviceaccount.com \
  --set-env-vars=BILLING_ACCOUNT=billingAccounts/016B17-6277B6-57F6E1,KILL_SWITCH_ARMED=1 \
  --memory=256Mi --quiet
```
