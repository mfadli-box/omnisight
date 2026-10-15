-- CreateTable
CREATE TABLE "pam_policy" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "protocols" JSONB,
    "require_approval" BOOLEAN NOT NULL DEFAULT false,
    "require_mfa" BOOLEAN NOT NULL DEFAULT false,
    "max_session_min" INTEGER NOT NULL DEFAULT 480,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_session" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "user_id" TEXT,
    "asset_id" TEXT,
    "account_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "src_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pam_policy_company_id_idx" ON "pam_policy"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pam_policy_company_id_code_key" ON "pam_policy"("company_id", "code");

-- CreateIndex
CREATE INDEX "pam_session_company_id_started_at_idx" ON "pam_session"("company_id", "started_at");
