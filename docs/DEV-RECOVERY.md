# Dev Server Recovery Playbook

> Windows 환경 (특히 한글 cwd) 에서 `pnpm dev` / Playwright auto-webServer 가 행(hang)할 때 표준 복구 절차.

---

## 증상 (Symptoms)

- `pnpm dev` 가 5분 넘게 0 바이트 출력 후 멈춤
- Playwright `webServer.command` 가 baseURL 응답 없이 2분 timeout
- `taskmgr` 에 `node.exe` 프로세스가 좀비처럼 누적 (CPU 0%, RAM 200MB+)
- 야간 자율 세션 후 발견되는 가장 흔한 패턴 (`ap-20260517-014225` 세션 사례 참조)

## 근본 원인 (Root Cause)

`apps/web/.next/` 캐시가 손상되어 Next.js 부트 시퀀스가 무한 대기. 한글 cwd (`바탕 화면`) 가 일부 Node 모듈 경로 해석 + Watchpack 파일 매처와 상호작용해 손상 확률이 높아진다.

## 1단계 — 일반 복구 (90% 케이스 해결)

```bash
# 1. 모든 node 프로세스 종료 (Windows PowerShell)
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. Next.js 캐시 삭제
Remove-Item -Recurse -Force apps/web/.next

# 3. 클린 부트
cd apps/web
pnpm dev
```

bash (Git Bash / WSL) 환경:

```bash
# 1. 종료
pkill -f "node.*next" || true

# 2. 캐시 삭제
rm -rf apps/web/.next

# 3. 클린 부트
cd apps/web && pnpm dev
```

## 2단계 — 좀비 프로세스가 남는 경우

Windows에서 PID 가 Unix 형식으로 표시되는 일이 있다 (Git Bash bash interop 이슈). `taskkill` 이 실패하면:

```powershell
# PowerShell — 강력한 매칭
Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*next*" } | ForEach-Object { $_.Terminate() }
```

그 후 컴퓨터 재로그인 또는 재부팅하면 100% 회복.

## 3단계 — Playwright auto-webServer 우회

`playwright.config.ts` 가 dev server를 직접 띄우는 모드가 hang 의 주요 패턴. dev server를 별도 터미널에서 미리 띄우고 Playwright는 재사용하도록:

```bash
# 터미널 1
cd apps/web && pnpm dev

# 터미널 2 — server가 :3100 응답한 후
cd apps/web
PLAYWRIGHT_BASE_URL=http://localhost:3100 \
  pnpm exec playwright test --reuse-existing-server
```

`playwright.config.ts` 의 `webServer.reuseExistingServer: !process.env.CI` 가 이미 설정돼 있어 위 패턴이 동작한다.

## 4단계 — 예방 (Prevention)

| 빈도 | 작업 |
|------|------|
| 매 세션 종료 시 | `pkill -f "node.*next"` 로 좀비 정리 |
| 주 1회 | `rm -rf apps/web/.next apps/web/node_modules/.cache` |
| 빌드 실패 후 | 자동으로 위 캐시 삭제 후 재시도 |

`.gitignore` 에 `apps/web/.next/` 가 이미 포함돼 있어 캐시 삭제 시 git status 영향 없음 (확인 완료).

## 5단계 — 사용자 액션이 필요한 경우

위 1~4 단계로도 회복 안 되면:
1. `apps/web/node_modules` 전체 삭제 후 `pnpm install`
2. pnpm store prune: `pnpm store prune`
3. Node 버전 확인 (Next.js 14 기준 `>=18.17` 필수)
4. Windows Defender 실시간 보호가 `node_modules` 를 스캔하지 않도록 제외 디렉토리 등록

## 참고 세션 로그

- 야간 세션 `ap-20260517-014225` Wave I — marketing-smoke 22분 hang → cache clean 으로 회복
- 야간 세션 `ap-20260517-093851` — P0-3 worktree 격리 미사용 상태에서 dev server live run 보류 사유
