# ClearToShip — Claude Code Project Context

If you are Claude Code opening this repo for the first time on a new machine:

## 1. Restore project memory (run once after clone)

```bash
# bash / git-bash / WSL
bash scripts/sync-claude-memory.sh
```

```powershell
# PowerShell (Windows)
& scripts\sync-claude-memory.ps1
```

This copies `.claude/memory/*.md` into `~/.claude/projects/<projectId>/memory/` so the auto-memory system loads the project's accumulated knowledge (Phase 0 status, next-action queue, burnt-in lessons, lint tool paths, PRD navigation).

Use `--force` / `-Force` later when the repo memory updates and you want to refresh the local mirror (it preserves any local-only entries like `user_profile.md`).

## 2. Read the active handoff

The current authoritative resume guide is the newest `reports/AUTOPILOT/ap-*-resume-handoff.md`. As of 2026-05-20:

- `reports/AUTOPILOT/ap-20260520-phase0-resume-handoff.md` — Phase 0 → Phase 1 boot loader, post-merge operator ops, KPI gate.

## 3. Active state at a glance

- **Open PR**: #36 (`feat/phase0-worker-tooling`) — CI green, ready to merge. See `docs/PRD/phase0-worker-tooling-2026-05-19.md`.
- **Branch**: `feat/phase0-worker-tooling` (8+ commits ahead of main).
- **Launch target**: 2026-06-05.
- **Last full session report**: `reports/AUTOPILOT/ap-20260520-phase0-worker-tooling.md`.

## 4. What this codebase is

ClearToShip is an AI Product Auditor for vibe-coded projects — a No-LLM, deterministic ship-readiness audit. The audit-worker runs a 20-step pipeline (git clone + chromium + lighthouse + heuristics) and emits a Founder Confidence Score with uncertainty interval.

Key packages:

- `apps/web` — Next.js 15 SSR, deployed to Cloud Run.
- `workers/audit-worker` — Express + pipeline, deployed to Cloud Run.
- `packages/audit-core` — pure-Node detectors + scoring + coverage-matrix.
- `packages/shared-types` — zod schemas + TypeScript types.
- `functions/` — Firebase Cloud Functions v2 (Firestore onCreate trigger).
- `infra/` — Terraform + bash deploy scripts.

## 5. Project conventions

- pnpm 9 monorepo (root `pnpm-workspace.yaml`).
- Node 20.13 (lockfile-pinned).
- Korean prose, English/code tokens in docs and commits.
- `pnpm ci` = `pnpm -r type-check && pnpm -r lint && pnpm -r test`.
- Deploy path: push to `main` → GitHub Actions `deploy.yml` → Cloud Run (asia-northeast3) + Firebase Functions.
- Memory directory: `~/.claude/projects/<projectId>/memory/` is auto-loaded by Claude Code; repo mirror at `.claude/memory/`.
