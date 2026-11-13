# syntax=docker/dockerfile:1
# =============================================================================
# osc_base — Prisma migration & seed runner (standar ai-main).
# One-shot container/job yang dijalankan SEBELUM osc_rest start:
#   npx prisma migrate deploy   → terapkan seluruh migrasi SQL (idempotent)
#   npx prisma db seed          → seed bootstrap (idempotent, upsert)
#
# Desain:
#   - `npm ci` memasang SEMUA deps (termasuk devDeps: prisma CLI + tsx) —
#     seed dieksekusi via `tsx prisma/seed.ts` (lihat package.json).
#   - Non-root: berjalan sebagai user `node` (UID 1000) image node:22-alpine.
#   - Tidak ada source aplikasi; hanya prisma/ + package manifests.
#   - `prisma migrate deploy` & engine bekerja offline (engine sudah dibundel
#     oleh npm ci) — aman untuk network internal tanpa egress internet.
# =============================================================================

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    CHECKPOINT_DISABLE=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node prisma ./prisma

USER node

CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]
