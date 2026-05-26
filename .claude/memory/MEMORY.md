# ClearToShip — Memory Index (repo mirror)

> This is the **repo-committed copy** of the project's Claude Code auto-memory.
> The active copy lives at `~/.claude/projects/<projectId>/memory/` on each machine.
> After `git clone`, run `scripts/sync-claude-memory.{sh,ps1}` to install these into the local Claude Code memory dir so future sessions auto-load them.

- [Phase 0 status](project_phase0_status.md) — PR #36 fully green, awaiting operator merge + manual ops
- [Next session action queue](project_next_actions.md) — exact commands the next session must run before doing anything else (2026-05-26 업데이트: Phase 1 Quick Wins)
- [Audit quality roadmap PRD pointer](reference_audit_quality_roadmap_prd.md) — `docs/PRD/audit-quality-roadmap-2026-05-26.md` 본 PRD 위치 + 3-phase 요약
- [pnpm monorepo + Docker — 4-iteration lesson](feedback_pnpm_monorepo_docker.md) — burnt-in fix patterns for Playwright + multi-stage builds
- [Phase 0 PRD reference](reference_phase0_prd.md) — pointer to the 750-line plan + how to read it
- [Static lint tools installed locally](reference_lint_tools.md) — shellcheck/hadolint/actionlint paths + reproduction commands
- [gcloud IAM + WIF burnt-in lessons (2026-05-20)](feedback_gcloud_iam_wif.md) — 5 IAM/Cloud Run traps from Phase 0 prod deploy
- [Visual audit UX vision — Phase 2/3 candidates](project_visual_audit_vision.md) — 비개발자가 audit 결과를 시각적으로 이해하게 만드는 V1/V2/V3 후보
- [setuptools 82 pkg_resources 제거](feedback_setuptools_82_pkg_resources.md) — Python venv 빌드 시 `"setuptools<82"` 항상 pin (2026-02-08 이후 unbounded upgrade 위험)

> `user_profile.md` is intentionally **not committed** — it lives only in the host's local memory dir as a personal preference scratch pad. Each contributor can write their own.
