# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
FROM node:20.13-alpine AS build
WORKDIR /app

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

# ---------- Stage 2: runtime ----------
FROM node:20.13-alpine AS runtime
WORKDIR /app

# Non-root user (UID 10001 per architecture §7.1).
RUN addgroup -g 10001 -S worker && \
    adduser -S -u 10001 -G worker worker

# Production-only deps.
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

ENV NODE_ENV=production
ENV WORKER_PORT=8080

# Copy minimal runtime artifacts.
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/
COPY --from=build /app/packages/shared-types/package.json /app/packages/shared-types/
COPY --from=build /app/packages/shared-types/dist /app/packages/shared-types/dist
COPY --from=build /app/packages/audit-core/package.json /app/packages/audit-core/
COPY --from=build /app/packages/audit-core/dist /app/packages/audit-core/dist
COPY --from=build /app/workers/audit-worker/package.json /app/workers/audit-worker/
COPY --from=build /app/workers/audit-worker/dist /app/workers/audit-worker/dist

RUN pnpm install --prod --filter audit-worker... --frozen-lockfile=false && \
    chown -R worker:worker /app

USER worker
EXPOSE 8080

# Sprint 0 — no system tools yet. Sprint 1+ will add: git, ripgrep, semgrep, etc.
CMD ["node", "workers/audit-worker/dist/server.js"]
