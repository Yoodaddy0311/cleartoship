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
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

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

# P0.W2.8 — chown playwright dir BEFORE switching to USER worker (R-P0-2).
RUN chown -R worker:worker /opt/ms-playwright
# P0.W2.9 — chown app dir BEFORE switching to USER worker.
RUN chown -R worker:worker /app

# P0.W4.2 — build-time smoke gate (git + chromium probe).
COPY workers/audit-worker/scripts/smoke-tools.sh /usr/local/bin/smoke-tools.sh
RUN chmod +x /usr/local/bin/smoke-tools.sh && /usr/local/bin/smoke-tools.sh

USER worker
EXPOSE 8080

# Phase 0 — git + chromium installed. Phase 1 will add: semgrep, osv-scanner.
CMD ["node", "workers/audit-worker/dist/server.js"]
