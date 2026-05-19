# syntax=docker/dockerfile:1.7
#
# web-ssr Cloud Run image. Mirrors workers/audit-worker/Dockerfile:
# monorepo-root build context, pnpm workspaces, multi-stage. Runtime stage
# installs production dependencies and serves with `next start` — we
# deliberately do NOT use Next.js' `output: 'standalone'` mode because its
# nft tracer misses runtime `require('./<svc>_client_config.json')` patterns
# used by every @google-cloud/* SDK, producing MODULE_NOT_FOUND crashes the
# first time CloudTasksClient is instantiated.

# ---------- Stage 1: build ----------
FROM node:20.13-alpine AS build
WORKDIR /app

# NEXT_PUBLIC_* must be present at build time — Next.js bakes them into the
# client bundle. Server-only env vars (CLOUD_TASKS_*, AUDIT_WORKER_URL) are
# injected at runtime via Cloud Run --set-env-vars and are NOT declared here.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_USE_EMULATORS=0 \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Cache-friendly manifest copy.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/audit-core/package.json packages/audit-core/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile=false --filter web...

# Source.
COPY packages/shared-types packages/shared-types
COPY packages/audit-core packages/audit-core
COPY packages/ui packages/ui
COPY apps/web apps/web

# Build workspace deps first, then Next.js.
RUN pnpm --filter @cleartoship/shared-types... build && \
    pnpm --filter @cleartoship/audit-core... build && \
    pnpm --filter web build

# ---------- Stage 2: runtime ----------
FROM node:20.13-alpine AS runtime
WORKDIR /app

RUN addgroup -g 10001 -S web && \
    adduser -S -u 10001 -G web web

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Workspace skeleton — only the manifests pnpm needs to resolve `--filter web...`.
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/tsconfig.base.json ./
COPY --from=build /app/packages/shared-types/package.json /app/packages/shared-types/
COPY --from=build /app/packages/audit-core/package.json /app/packages/audit-core/
COPY --from=build /app/packages/ui/package.json /app/packages/ui/
COPY --from=build /app/apps/web/package.json /app/apps/web/

# Workspace dist outputs the SSR runtime actually imports.
COPY --from=build /app/packages/shared-types/dist /app/packages/shared-types/dist
COPY --from=build /app/packages/audit-core/dist /app/packages/audit-core/dist
COPY --from=build /app/packages/ui /app/packages/ui

# Install production deps only — full pnpm tree so dynamic JSON/proto loads
# (cloud_tasks_client_config.json, gapic_metadata.json, protos.json, …) all
# resolve at runtime. Bigger image than standalone, but bulletproof.
RUN pnpm install --prod --frozen-lockfile=false --filter web...

# Next.js build output + static assets.
COPY --from=build /app/apps/web/.next /app/apps/web/.next
COPY --from=build /app/apps/web/public /app/apps/web/public
COPY --from=build /app/apps/web/next.config.mjs /app/apps/web/next.config.mjs

RUN chown -R web:web /app

USER web
WORKDIR /app/apps/web
EXPOSE 8080

# Invoke `next` directly through node — avoids corepack/pnpm at runtime, which
# in prior revisions tried to verify pnpm's signing key against npmjs.com and
# failed with `Cannot find matching keyid`, killing the container before it
# could bind to $PORT. Mirrors workers/audit-worker/Dockerfile's `node …` CMD.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "8080", "-H", "0.0.0.0"]
