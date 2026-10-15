# Image utilitas Prisma untuk migrasi & seed (bukan aplikasi runtime).
# Digunakan oleh service `osc_migrate` pada docker-compose.yml.
#
#   docker build -t omnisight/schema ./osc_base
#   docker run --rm -e DATABASE_URL=... omnisight/schema
#
# Menggunakan varian Debian (bukan alpine) agar dependensi native (bcrypt)
# tersedia tanpa kompilasi tambahan.
FROM node:24-slim

WORKDIR /app

# Instal dependensi (termasuk Prisma CLI & tsx untuk seed).
COPY package.json package-lock.json ./
RUN npm ci

# Berkas skema & konfigurasi Prisma.
COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma

# Perintah default: jalankan seluruh migrasi yang belum diterapkan.
CMD ["npx", "prisma", "migrate", "deploy"]
