---
name: reference-lint-tools
description: "Static lint tools installed via winget on this Windows host for ClearToShip — shellcheck, hadolint, actionlint"
metadata: 
  node_type: memory
  type: reference
  originSessionId: f7dda967-061d-441e-8297-28bb6753e327
---

3 static analysis tools installed locally during the 2026-05-20 Phase 0 verification session. Available for any future Dockerfile / shell / GHA workflow change without re-installing.

**Why**: PR #36 needed an independent check beyond the spec-reviewer + quality-reviewer agents. winget had clean entries for all three, so we standardized on them. Phase 1 PR will reuse these — don't `winget install` again unless they're missing.

**How to apply**: when reviewing any PR that touches a Dockerfile, shell script, or `.github/workflows/*.yml`, run the matching tool from the repo root using the binary paths below. Pipe through `git show HEAD:<path>` if the file shows up as CRLF in the Windows working tree (autocrlf artifact — git stores LF).

## Installation (already done — verify first before re-running)

```powershell
# Check first:
shellcheck --version 2>&1
hadolint --version   2>&1
actionlint --version 2>&1

# Only if missing:
winget install --id=koalaman.shellcheck --silent --accept-source-agreements --accept-package-agreements
winget install --id=hadolint.hadolint   --silent --accept-source-agreements --accept-package-agreements
winget install --id=rhysd.actionlint    --silent --accept-source-agreements --accept-package-agreements
```

After winget install, PATH updates only apply to NEW shells. Until you restart the shell:

```bash
SC="/c/Users/HeechangLee/AppData/Local/Microsoft/WinGet/Packages/koalaman.shellcheck_Microsoft.Winget.Source_8wekyb3d8bbwe/shellcheck.exe"
HL="/c/Users/HeechangLee/AppData/Local/Microsoft/WinGet/Packages/hadolint.hadolint_Microsoft.Winget.Source_8wekyb3d8bbwe/hadolint.exe"
AL="/c/Users/HeechangLee/AppData/Local/Microsoft/WinGet/Packages/rhysd.actionlint_Microsoft.Winget.Source_8wekyb3d8bbwe/actionlint.exe"
```

## Standard invocations for this repo

```bash
# Shell scripts
shellcheck workers/audit-worker/scripts/smoke-tools.sh
git show HEAD:infra/scripts/03-deploy-worker.sh | shellcheck -    # CRLF in working tree

# Dockerfiles
hadolint workers/audit-worker/Dockerfile

# GHA workflows
git show HEAD:.github/workflows/deploy.yml | actionlint -         # CRLF in working tree
actionlint .github/workflows/ci.yml
actionlint .github/workflows/docker-build.yml
```

## Phase 0 lint baseline (2026-05-20, PR #36)

- shellcheck: 1 INFO (SC2086 intentional in 03-deploy-worker.sh:70)
- hadolint: 3 warnings (DL3008 ×2 = Phase 2 polish, DL4006 = false positive) + 1 info (DL3059 = intentional)
- actionlint: clean

Full report in [[project-phase0-status]] §6.5 and `reports/AUTOPILOT/ap-20260520-phase0-resume-handoff.md` §6.5.

See also: [[feedback-pnpm-monorepo-docker]] (Rule 1 also explains the SC2086 design choice).
