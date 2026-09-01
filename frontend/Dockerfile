# Multi-stage build for the Next.js frontend — SELFHOST_MIGRATION_PLAN.md
# Phase 6. Uses `output: 'standalone'` (next.config.ts) so the runtime image
# needs neither node_modules nor the Next.js CLI — just `node server.js`.
#
# Node 20, matching the README's stated minimum ("Node.js | 20+").

FROM node:20-alpine AS base

# ---- Dependencies -----------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build --------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No NEXT_PUBLIC_* build ARGs: post-migration the frontend has none (see
# frontend/.env.example) — the app talks to the backend via same-origin
# relative paths, routed by Caddy (ADR-1 in
# docs/architecture/selfhost-migration.md), not an absolute API URL baked in
# at build time.
RUN npm run build

# ---- Runtime --------------------------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
