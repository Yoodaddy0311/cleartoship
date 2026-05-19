# syntax=docker/dockerfile:1.7
#
# web-ssr Cloud Run image. Mirrors workers/audit-worker/Dockerfile:
# monorepo-root build context, pnpm workspaces, multi-stage. Runtime stage
# uses Next.js' standalone output so pnpm is not required at runtime.

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

# Install only what `web` and its workspace deps need. `--frozen-lockfile=false`
# tolerates the absence of devDeps that other workspaces (worker/functions) pull
# in but that we don't filter here.
RUN pnpm install --frozen-lockfile=false --filter web...

# Source.
COPY packages/shared-types packages/shared-types
COPY packages/audit-core packages/audit-core
COPY packages/ui packages/ui
COPY apps/web apps/web

# Build workspace deps first, then Next.js. transpilePackages picks up the TS
# sources directly, so the workspace `build` for shared-types / audit-core is
# only needed if Node-side code (route handlers) imports them.
RUN pnpm --filter @cleartoship/shared-types... build && \
    pnpm --filter @cleartoship/audit-core... build && \
    pnpm --filter web build

# ---------- Stage 2: runtime ----------
FROM node:20.13-alpine AS runtime
WORKDIR /app

RUN addgroup -g 10001 -S web && \
    adduser -S -u 10001 -G web web

ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output ships server.js + minimal node_modules. With
# `outputFileTracingRoot` pointing at the repo root, the standalone tree is
# emitted at `apps/web/.next/standalone/` and preserves the apps/web prefix.
COPY --from=build --chown=web:web /app/apps/web/.next/standalone ./
COPY --from=build --chown=web:web /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=web:web /app/apps/web/public ./apps/web/public

USER web
EXPOSE 8080

# server.js sits at apps/web/server.js inside the standalone bundle.
CMD ["node", "apps/web/server.js"]
