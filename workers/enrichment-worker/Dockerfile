# syntax=docker/dockerfile:1.7
#
# enrichment-worker — Cloud Run JOB (batch), NOT an HTTP service.
# Entry: dist/index.js, reads RUN_ID env, loads .claude/skills/audit-* SKILL.md
# at runtime, calls the Anthropic API, writes report.enrichment to Firestore.
#
# This image is DELIBERATELY much lighter than workers/audit-worker/Dockerfile:
# the enrichment job needs NO chromium, NO playwright, NO lighthouse, NO git,
# NO semgrep/osv-scanner. It is a pure-Node ESM workload. The only non-code
# asset it needs at runtime is the `.claude/skills/` bundle (SKILL.md prompts),
# which we COPY into the image at $SKILLS_DIR.

# ---------- Stage 1: build ----------
# Digest pinned 2026-05-20 — same digest as workers/audit-worker/Dockerfile so
# both images share one base layer. Bump procedure: re-run
# `docker buildx imagetools inspect node:20.13-bookworm-slim`, replace BOTH FROM
# lines (build + runtime) here AND in audit-worker in lock-step.
FROM node:20.13-bookworm-slim@sha256:cffed8cd39d6a380434e6d08116d188c53e70611175cd5ec7700f93f32a935a6 AS build
WORKDIR /app

# git for any git+ npm/pnpm deps, ca-certs for TLS during install.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack (same version as audit-worker).
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy monorepo manifest + workspace lock for cache-friendly install.
# Same workspace dep order as audit-worker: shared-types → audit-core → worker.
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/audit-core/package.json packages/audit-core/
COPY workers/enrichment-worker/package.json workers/enrichment-worker/

# Install all deps for the worker + its workspace deps (workspace links).
RUN pnpm install --frozen-lockfile=false --filter enrichment-worker...

# Copy source and build only the worker + its workspace deps, in dep order.
COPY packages/shared-types packages/shared-types
COPY packages/audit-core packages/audit-core
COPY workers/enrichment-worker workers/enrichment-worker

RUN pnpm --filter @cleartoship/shared-types... build && \
    pnpm --filter @cleartoship/audit-core... build && \
    pnpm --filter enrichment-worker build

# ---------- Stage 2: runtime ----------
# Same digest as build stage above — both stages MUST move together.
FROM node:20.13-bookworm-slim@sha256:cffed8cd39d6a380434e6d08116d188c53e70611175cd5ec7700f93f32a935a6 AS runtime
WORKDIR /app

# ca-certs for outbound TLS to the Anthropic API. No git/chromium/python here —
# the enrichment job has no system-tool dependencies.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Non-root user (UID 10001 per architecture §7.1), mirrors audit-worker.
RUN groupadd -g 10001 worker && \
    useradd -u 10001 -g worker -s /bin/false worker

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

ENV NODE_ENV=production
# skill-loader.ts resolves SKILLS_DIR to <cwd>/.claude/skills by default; we set
# it explicitly to the absolute path the skills are COPY'd to below so the
# resolution never depends on the process CWD.
ENV SKILLS_DIR=/app/.claude/skills

# Copy minimal runtime artifacts (built dist + manifests for the prod install).
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/
COPY --from=build /app/packages/shared-types/package.json /app/packages/shared-types/
COPY --from=build /app/packages/shared-types/dist /app/packages/shared-types/dist
COPY --from=build /app/packages/audit-core/package.json /app/packages/audit-core/
COPY --from=build /app/packages/audit-core/dist /app/packages/audit-core/dist
COPY --from=build /app/workers/enrichment-worker/package.json /app/workers/enrichment-worker/
COPY --from=build /app/workers/enrichment-worker/dist /app/workers/enrichment-worker/dist

# Skill bundles — the job reads SKILL.md at runtime from $SKILLS_DIR (=/app/.claude/skills).
COPY .claude/skills /app/.claude/skills

RUN pnpm install --prod --filter enrichment-worker... --frozen-lockfile=false

# chown app dir BEFORE switching to USER worker so the non-root user can read it.
RUN chown -R worker:worker /app

USER worker

# It is a Cloud Run JOB — no port, no EXPOSE, no healthcheck. The job process
# reads RUN_ID from the environment, does its work, and exits.
CMD ["node", "workers/enrichment-worker/dist/index.js"]
