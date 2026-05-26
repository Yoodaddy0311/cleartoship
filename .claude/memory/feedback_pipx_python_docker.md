---
name: feedback-pipx-python-docker
description: 2026-05-20 Phase 1 worker tooling — semgrep을 pipx로 Docker에 install 시 3번 fail에서 학습한 함정. python3-setuptools, pipx inject, semgrep registry cache 위치 등.
metadata:
  type: feedback
---

# pipx + Python + Docker — Phase 1 burnt-in (2026-05-20)

PR #38 (Phase 1: semgrep 1.86.0 + osv-scanner 1.9.2) Dockerfile 빌드를 3번 fail시킨 함정들. 다음 PR에서 동일 도구를 다룰 때 미리 적용해야 시간 절약.

## 함정 1 — Debian python3는 setuptools 안 가짐

**증상**: `pipx install semgrep` 후 `semgrep --version` → `ModuleNotFoundError: No module named 'pkg_resources'`

**원인**: `pkg_resources`는 `setuptools` 패키지가 제공. Debian bookworm-slim의 `python3` apt 패키지는 setuptools를 hard dep으로 안 끌어옴.

**조치**: apt에 `python3-setuptools` 명시 추가.
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-setuptools pipx
```

## 함정 2 — pipx venv는 시스템 setuptools 안 봄

**증상**: 함정 1 fix 후에도 동일 에러. pipx가 venv 격리하기 때문.

**원인**: pipx는 각 도구를 isolated venv에 install. system-level python3-setuptools가 venv 내부에서 자동으로 안 보임.

**조치**: `pipx inject`로 venv에 직접 추가.
```dockerfile
RUN pipx install semgrep==1.86.0 && \
    pipx inject semgrep setuptools pip && \
    semgrep --version
```

**How to apply**: pipx로 install되는 모든 Python tool은 그 entrypoint가 `pkg_resources` 또는 다른 setup-time module을 import한다고 가정하고 inject를 같이 박는다. semgrep, mypy, ruff, black, pre-commit 등 setuptools 기반 tool에 공통.

## 함정 3 — semgrep cache는 user-level

**증상**: 빌드 시점에 cache pre-warm해도 runtime에선 cache miss.

**원인**: semgrep cache는 `$HOME/.semgrep/` 기본. 빌드 stage에선 root user, runtime stage에선 `worker` (UID 10001). HOME이 달라 cache 못 찾음.

**조치**: 명시적 cache dir env로 system-wide 위치.
```dockerfile
ENV SEMGREP_USER_DATA_FOLDER=/opt/semgrep-data
RUN mkdir -p /opt/semgrep-data && \
    semgrep --config=p/owasp-top-ten --dryrun --quiet /tmp || true && \
    chmod -R a+rX /opt/semgrep-data
```

권한 `a+rX`로 worker user가 read+enter 가능.

## 함정 4 — osv-scanner release asset 명명 규칙

**증상**: GitHub Releases에서 download URL을 `osv-scanner_${VERSION}_linux_amd64`로 가정했는데 404.

**원인**: 실제 asset 이름은 `osv-scanner_linux_amd64` (버전 prefix 없음). 버전은 URL path의 `download/v${VERSION}/` 부분에만.

**조치**: 다운로드 전에 `gh api repos/google/osv-scanner/releases/tags/v${VERSION}` 로 정확한 asset 이름 확인.

또한 SHA256은 같은 release의 `osv-scanner_SHA256SUMS` 파일에 있음 — 직접 다운로드해서 매핑.

## 함정 5 — pipx 함정 발견 비용

PR #38 빌드 3번 fail → CI 1번당 ~2분 + 진단 시간. 합산 ~30분 낭비. pipx로 새 Python tool 추가 시 사전 적용 패턴:

1. `apt install python3 python3-pip python3-setuptools pipx`
2. `pipx install <tool>`
3. `pipx inject <tool> setuptools pip`
4. `<tool> --version` (build-time self-test)
5. user-level cache 쓰는 tool이면 system-wide path env로 우회

이 5단계를 한 RUN에 묶어두면 build 단계에서 fail-fast.

## 관련

- [[feedback_pnpm_monorepo_docker]] — Playwright + pnpm monorepo 함정 (Phase 0)
- [[feedback_gcloud_iam_wif]] — WIF + Cloud Run IAM 함정 (Phase 0)
- [[project_phase0_status]] — Phase 0 결과 (54점)
- PR #38: 머지 안 됨, 다음 세션 fix 후 머지 예정. 위 함정 1+2 fix는 commit `c0316f6` + `3363013`에 적용됨 — 그래도 build fail 지속. 다음 세션에서 (a) pipx venv path 확인 (b) semgrep entrypoint실제 import 추적 필요.
