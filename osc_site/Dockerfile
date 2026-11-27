# ==============================================================================
# Stage 1: Base & Dependencies Stage
# ==============================================================================
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ==============================================================================
# Stage 2: Builder Stage
# ==============================================================================
FROM deps AS builder

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN mkdir -p public && npm run build && npm prune --omit=dev && rm -rf .next/cache

# ==============================================================================
# Stage 3: Production Runner Stage
# ==============================================================================
FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Buat grup dan user sistem non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/package.json /app/server.mjs ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
