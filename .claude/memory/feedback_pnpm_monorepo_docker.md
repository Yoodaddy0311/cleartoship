---
name: feedback-pnpm-monorepo-docker
description: 4-iteration CI burn from Phase 0 — burnt-in patterns for Playwright + multi-stage Docker in a pnpm workspace
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f7dda967-061d-441e-8297-28bb6753e327
---

Phase 0 took 4 CI rounds (3 fixes) to ship because the obvious-looking Dockerfile recipe for Playwright + pnpm monorepo has 3 separate gotchas. Apply these patterns BEFORE the first CI push next time.

**Why**: each iteration cost ~5 min round-trip + context switching. Phase 1 will face the SAME patterns (it adds python3/pipx/semgrep/osv-scanner — same multi-stage + workspace exec questions). Pre-applying these saves at least 15 min on Phase 1.

**How to apply**: when writing any Dockerfile in this repo that installs node binaries + system tools, walk through the 3 rules below and code them in upfront. Each rule has a fail-fast self-test.

## Rule 1 — Workspace binaries are not at `/app/node_modules/.bin`

pnpm with `--filter <pkg>...` puts the binary at `workers/<pkg>/node_modules/.bin/<name>`, not the root.

**Wrong**: `RUN npx playwright install ...` (looks in root `node_modules`, fails 127)
**Right**: `RUN pnpm --filter <pkg> exec <bin> ...` (resolves through workspace)

Verify with `pnpm --filter audit-worker exec playwright --version` locally before pushing.

## Rule 2 — Playwright 1.49+ split chromium into two bundles

The leaf directory layout is no longer a stable static glob. Playwright 1.60.0 installs `chromium-1223/chrome-linux64/chrome` (note `linux64`, not `linux`). Older code paths assumed `chrome-linux/chrome`.

**Wrong**: `RUN ln -s /opt/ms-playwright/chromium-*/chrome-linux/chrome /usr/local/bin/chromium` (broken symlink on layout change, `ln` doesn't validate)
**Right**: `find` with `-type f -executable` + name `chrome` OR `chrome-headless-shell` + self-test `chromium --version` inside the same RUN.

The self-test catches both layout drift AND library issues (Rule 3) at build time, not runtime.

## Rule 3 — `--with-deps` does NOT cross multi-stage boundaries

`playwright install --with-deps chromium` apt-installs system libraries (libglib2.0-0, libnss3, libatk*, etc.) into `/var/lib/dpkg/` of the **current stage only**. Files installed by apt are NOT copied via `COPY --from=build` unless you explicitly copy every dpkg state file (don't).

**Wrong**: install deps in build stage, COPY only the playwright dir to runtime, hope libraries follow.
**Right**: in the runtime stage, after `pnpm install --prod` puts playwright back in node_modules, run `RUN pnpm --filter <pkg> exec playwright install-deps chromium`. This uses Playwright's own dep manifest as single source of truth — auto-updates with Playwright version bumps instead of drifting against a hand-maintained apt list.

Order matters: pnpm install --prod must run BEFORE install-deps (need playwright CLI), and install-deps must run BEFORE the chromium symlink self-test (need libs loadable). All BEFORE `USER worker` (need root for apt).

## Bonus — Build-time self-tests beat runtime smoke

Adding `chromium --version` inside the symlink RUN (build-time gate) catches Rule 2 + Rule 3 failures during `docker build`, not when smoke-tools.sh runs at the end of the runtime stage. Faster feedback, no need to push to CI to detect a broken chromium.

See also: [[project-phase0-status]], [[project-next-actions]].
