-- AlterTable
ALTER TABLE "web_vhost" ADD COLUMN     "server_id" TEXT;

-- CreateTable
CREATE TABLE "web_server" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "ip_address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_domain" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL,
    "registrar" TEXT,
    "expires_at" TIMESTAMP(3),
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_domain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_server_company_id_idx" ON "web_server"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "web_server_company_id_code_key" ON "web_server"("company_id", "code");

-- CreateIndex
CREATE INDEX "web_domain_company_id_idx" ON "web_domain"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "web_domain_domain_key" ON "web_domain"("domain");

-- AddForeignKey
ALTER TABLE "web_vhost" ADD CONSTRAINT "web_vhost_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "web_server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
