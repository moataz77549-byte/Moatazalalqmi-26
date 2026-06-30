# syntax=docker/dockerfile:1
# ============================================================
# Moataz AI — Production Dockerfile
# Multi-stage build for Next.js 16 (standalone) + Prisma + Bun
# ============================================================

ARG BUN_VERSION=1.3.14-slim

# ---------- Stage 1: base ----------
FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app
# OpenSSL is required by Prisma's query engine at runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# ---------- Stage 2: deps ----------
# Installs dependencies in their own layer so they're cached
# whenever only application source changes.
FROM base AS deps
WORKDIR /app

# FIX: the repo ships the new text-based "bun.lock", not the old
# binary "bun.lockb". 
COPY package.json bun.lock ./
COPY prisma ./prisma

RUN bun install --frozen-lockfile

# ---------- Stage 3: builder ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Generates the Prisma client and builds the standalone Next.js output.
RUN bun run build

# ---------- Stage 4: runner ----------
FROM oven/bun:${BUN_VERSION} AS runner
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    # Non-root runtime user
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

# Standalone server + static assets + public files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Startup script: diagnostics, DB retry, conditional migrate/seed, graceful shutdown
COPY --chown=nextjs:nodejs scripts/start.sh ./start.sh
RUN chmod +x ./start.sh

USER nextjs

EXPOSE 3000

# Container-level healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT}/api/v1/health/live || exit 1

CMD ["./start.sh"]
