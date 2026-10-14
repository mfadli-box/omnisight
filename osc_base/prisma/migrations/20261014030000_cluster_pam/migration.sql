-- CreateTable
CREATE TABLE "pam_asset" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SERVER',
    "protocol" TEXT NOT NULL DEFAULT 'SSH',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "os" TEXT,
    "tags" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_account" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "auth_type" TEXT NOT NULL DEFAULT 'PASSWORD',
    "secret_enc" TEXT,
    "key_enc" TEXT,
    "passphrase_enc" TEXT,
    "privileged" BOOLEAN NOT NULL DEFAULT false,
    "auto_rotate" BOOLEAN NOT NULL DEFAULT false,
    "rotate_interval_days" INTEGER,
    "last_rotated_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pam_asset_company_id_idx" ON "pam_asset"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pam_asset_company_id_code_key" ON "pam_asset"("company_id", "code");

-- CreateIndex
CREATE INDEX "pam_account_asset_id_idx" ON "pam_account"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "pam_account_asset_id_name_key" ON "pam_account"("asset_id", "name");

-- AddForeignKey
ALTER TABLE "pam_account" ADD CONSTRAINT "pam_account_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "pam_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
