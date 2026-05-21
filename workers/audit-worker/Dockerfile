# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
# Digest pinned 2026-05-20 from `docker buildx imagetools inspect node:20.13-bookworm-slim`.
# Bump procedure: re-run inspect, replace BOTH FROM lines (build + runtime), re-run full V1~V6 (PRD §4.1).
FROM node:20.13-bookworm-slim@sha256:cffed8cd39d6a380434e6d08116d188c53e70611175cd5ec7700f93f32a935a6 AS build
WORKDIR /app

# P0.W1.2 — system tools for build deps (git for npm/pnpm git+ deps, ca-certs for TLS).
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack.
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy monorepo manifest + workspace lock for cache-friendly install.
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/audit-core/package.json packages/audit-core/
COPY workers/audit-worker/package.json workers/audit-worker/

# Install all deps (workspace links).
RUN pnpm install --frozen-lockfile=false --filter audit-worker...

# Copy source and build only the worker + its workspace deps.
COPY packages/shared-types packages/shared-types
COPY packages/audit-core packages/audit-core
COPY workers/audit-worker workers/audit-worker

RUN pnpm --filter @cleartoship/shared-types... build && \
    pnpm --filter @cleartoship/audit-core... build && \
    pnpm --filter audit-worker build

# P0.W1.3 — Chromium + system deps installed via Playwright (single command).
# Must run AFTER pnpm install. pnpm monorepo: the playwright binary lives at
# workers/audit-worker/node_modules/.bin/playwright, NOT /app/node_modules.
# `pnpm --filter audit-worker exec` resolves to the workspace's node_modules/.bin.
# Chromium ends up at $PLAYWRIGHT_BROWSERS_PATH (defaults to /root/.cache/ms-playwright
# under root; we override to /opt/ms-playwright so the runtime stage can COPY it).
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN pnpm --filter audit-worker exec playwright install --with-deps chromium

# ---------- Stage 2: runtime ----------
# Same digest as build stage above — pinned 2026-05-20. Both stages MUST move together
# to keep the playwright deps installed in build stage ABI-compatible with the runtime base.
FROM node:20.13-bookworm-slim@sha256:cffed8cd39d6a380434e6d08116d188c53e70611175cd5ec7700f93f32a935a6 AS runtime
WORKDIR /app

# P0.W2.2 — git for step 03 (clone-repo), ca-certs for TLS. Chromium runtime
# libraries (libglib2.0-0, libnss3, libatk, etc.) are NOT installed here —
# `playwright install-deps chromium` further down owns that responsibility,
# so the dep list stays single-sourced and auto-updates with Playwright
# version bumps instead of drifting against a hand-maintained apt list.
#

# P1.W1.1 — python3 + venv module for semgrep, curl for osv-scanner binary fetch.
# `python3-venv` provides the `venv` module used by `python3 -m venv` below;
# Debian bookworm-slim's `python3` package does NOT pull it as a hard dep.
# pip-in-a-venv auto-installs setuptools/wheel into the venv, so the
# `pkg_resources` import that semgrep depends on resolves cleanly without
# any pipx-internal magic. DL3008 (apt pin) skipped — Phase 2 cleanup
# item per PRD §7.2.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates \
      python3 python3-venv \
      curl \
    && rm -rf /var/lib/apt/lists/*

# P0.W2.3 — Non-root user (UID 10001 per architecture §7.1). Debian-style.
RUN groupadd -g 10001 worker && \
    useradd -u 10001 -g worker -s /bin/false worker

# Production-only deps.
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

ENV NODE_ENV=production
ENV WORKER_PORT=8080
ENV CHROME_PATH=/usr/local/bin/chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

# Copy minimal runtime artifacts.
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/
COPY --from=build /app/packages/shared-types/package.json /app/packages/shared-types/
COPY --from=build /app/packages/shared-types/dist /app/packages/shared-types/dist
COPY --from=build /app/packages/audit-core/package.json /app/packages/audit-core/
COPY --from=build /app/packages/audit-core/dist /app/packages/audit-core/dist
COPY --from=build /app/workers/audit-worker/package.json /app/workers/audit-worker/
COPY --from=build /app/workers/audit-worker/dist /app/workers/audit-worker/dist

# P0.W2.4 — Chromium directory from build stage.
COPY --from=build /opt/ms-playwright /opt/ms-playwright

RUN pnpm install --prod --filter audit-worker... --frozen-lockfile=false

# P0.W2.5a — install chromium's system library deps using Playwright's own
# manifest (libglib2.0-0, libnss3, libatk*, fonts, etc.). This requires the
# playwright CLI which `pnpm install --prod` above placed in the workspace's
# node_modules. Runs as root (USER worker is later) so apt can write.
# Equivalent to `--with-deps` but applied to the runtime stage where it counts.
RUN pnpm --filter audit-worker exec playwright install-deps chromium && rm -rf /var/lib/apt/lists/*

# P0.W2.5b — symlink the versioned Playwright chromium binary to a stable path.
# Playwright 1.49+ split chromium into multiple bundles (full chromium-* AND
# chromium_headless_shell-*) and any specific bundle's leaf binary name can
# vary (`chrome`, `chrome-headless-shell`). Glob-then-symlink with a fixed
# subpath is fragile — discover the actual binary with `find` and assert
# exactly one candidate, fail fast if 0 or 2+.
RUN set -eu; \
    candidate=$(find /opt/ms-playwright \
                  \( -name chrome -o -name chrome-headless-shell \) \
                  -type f -executable 2>/dev/null | head -n1); \
    if [ -z "$candidate" ]; then \
      echo "ERROR: no chromium binary found under /opt/ms-playwright"; \
      ls -la /opt/ms-playwright || true; \
      exit 1; \
    fi; \
    ln -sfn "$candidate" /usr/local/bin/chromium; \
    echo "Symlinked $candidate -> /usr/local/bin/chromium"; \
    /usr/local/bin/chromium --version || { echo "ERROR: symlink target not runnable"; exit 1; }

# P1.W1.2 — semgrep via an explicit venv (NOT pipx).
#
# Four prior attempts failed (commits a4871e9, c0316f6, 3363013, a145d11):
#   1-3: pipx-isolated venv — `ModuleNotFoundError: No module named 'pkg_resources'`
#        even after `pipx inject setuptools`.
#   4:   plain venv — pip install SUCCEEDED (setuptools 82.0.1 + semgrep 1.86.0
#        installed cleanly), but `semgrep --version` failed with:
#          [ERROR]: Error: exception Unix_error: No such file or directory execvp pysemgrep
#          Raised at CLI.safe_run in src/osemgrep/cli/CLI.ml line 266
#        The semgrep 1.x dist ships an OCaml `osemgrep` binary that shells out
#        to its Python sibling `pysemgrep` via `execvp`, which searches PATH.
#        Symlinking only `semgrep` left `pysemgrep` unreachable from PATH.
#
# Fix (attempt 5): symlink BOTH `semgrep` AND `pysemgrep` from the venv into
# /usr/local/bin. The venv's pip generates wrapper scripts with venv-absolute
# shebangs (`#!/opt/semgrep-venv/bin/python3`), so a symlink (not a copy) is
# enough — Python resolves `sys.executable` via /proc/self/exe and the shebang
# still points at the venv interpreter regardless of how the script was invoked.
#
# Lessons captured in `.claude/memory/feedback_pipx_python_docker.md`.
# Build-time self-test (`semgrep --version`) per burnt-in Rule "build-time
# self-tests beat runtime smoke".
RUN python3 -m venv /opt/semgrep-venv && \
    /opt/semgrep-venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel && \
    /opt/semgrep-venv/bin/pip install --no-cache-dir semgrep==1.86.0 && \
    ln -sfn /opt/semgrep-venv/bin/semgrep /usr/local/bin/semgrep && \
    ln -sfn /opt/semgrep-venv/bin/pysemgrep /usr/local/bin/pysemgrep && \
    semgrep --version && \
    pysemgrep --version

# P1.W1.3 — semgrep registry cache pre-warm.
# semgrep stores rule packs in $SEMGREP_USER_DATA_FOLDER. Warm the owasp-top-ten
# pack at build time so the first audit doesn't pay the cold network fetch
# (~5-10s saved per cold-start invocation). Cache dir is world-readable so
# USER worker can hit it. `|| true` — warming is best-effort; if the registry
# is briefly unreachable at build time, runtime fetch still works.
ENV SEMGREP_USER_DATA_FOLDER=/opt/semgrep-data
RUN mkdir -p /opt/semgrep-data && \
    SEMGREP_USER_DATA_FOLDER=/opt/semgrep-data semgrep --config=p/owasp-top-ten --dryrun --quiet /tmp || true && \
    chmod -R a+rX /opt/semgrep-data

# P1.W1.4 — osv-scanner v1.9.2 binary from GitHub Releases.
# Pinned version + SHA256 verify so a compromised mirror or wrong tag is caught
# at build time. linux/amd64 matches Cloud Run amd64. Self-test after install.
# If upstream releases a v1.9.3, bump BOTH the URL version AND the digest in lock-step.
ARG OSV_SCANNER_VERSION=1.9.2
# SHA256 from official osv-scanner_SHA256SUMS at the v1.9.2 release.
# Verified 2026-05-20. Bump procedure: re-download SHA256SUMS for the new
# version and replace BOTH the ARG VERSION and DIGEST in lock-step.
ARG OSV_SCANNER_SHA256=d6af4b67fa5de658598bd2d445efb99e90d1734b3146962418719c4350ecb74b
RUN set -eu; \
    url="https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_amd64"; \
    echo "Fetching osv-scanner v${OSV_SCANNER_VERSION} from $url"; \
    curl -fsSL -o /tmp/osv-scanner "$url"; \
    echo "${OSV_SCANNER_SHA256}  /tmp/osv-scanner" | sha256sum -c -; \
    install -m 0755 /tmp/osv-scanner /usr/local/bin/osv-scanner; \
    rm /tmp/osv-scanner; \
    osv-scanner --version

# P0.W2.8 — chown playwright dir BEFORE switching to USER worker (R-P0-2).
RUN chown -R worker:worker /opt/ms-playwright
# P0.W2.9 — chown app dir BEFORE switching to USER worker.
RUN chown -R worker:worker /app

# P0.W4.2 — build-time smoke gate (git + chromium + semgrep + osv-scanner probe).
COPY workers/audit-worker/scripts/smoke-tools.sh /usr/local/bin/smoke-tools.sh
RUN chmod +x /usr/local/bin/smoke-tools.sh && /usr/local/bin/smoke-tools.sh

USER worker
EXPOSE 8080

# Phase 1 — git + chromium + semgrep + osv-scanner installed. Phase 2: prisma + tailwind detectors.
CMD ["node", "workers/audit-worker/dist/server.js"]
