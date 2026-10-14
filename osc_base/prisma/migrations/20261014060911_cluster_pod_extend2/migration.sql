-- CreateTable
CREATE TABLE "pod_registry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "auth" TEXT DEFAULT 'NONE',
    "username" TEXT,
    "password_enc" TEXT,
    "token_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_build" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "repo_url" TEXT,
    "dockerfile" TEXT DEFAULT 'Dockerfile',
    "context" TEXT DEFAULT '.',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_backup" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'STACK',
    "target_id" TEXT,
    "path" TEXT,
    "size_bytes" INTEGER,
    "checksum" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_scan" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "report" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_scan_finding" (
    "id" TEXT NOT NULL,
    "scan_id" TEXT NOT NULL,
    "cve" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "package" TEXT,
    "version" TEXT,
    "fixed" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_scan_finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_template" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_git_credential" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "auth_type" TEXT NOT NULL DEFAULT 'HTTPS',
    "username" TEXT,
    "password_enc" TEXT,
    "key_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_git_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_git_sync" (
    "id" TEXT NOT NULL,
    "stack_id" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '',
    "repo_url" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "last_synced" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_git_sync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pod_registry_company_id_idx" ON "pod_registry"("company_id");

-- CreateIndex
CREATE INDEX "pod_build_company_id_idx" ON "pod_build"("company_id");

-- CreateIndex
CREATE INDEX "pod_backup_company_id_idx" ON "pod_backup"("company_id");

-- CreateIndex
CREATE INDEX "pod_scan_company_id_idx" ON "pod_scan"("company_id");

-- CreateIndex
CREATE INDEX "pod_scan_finding_scan_id_idx" ON "pod_scan_finding"("scan_id");

-- CreateIndex
CREATE INDEX "pod_template_company_id_idx" ON "pod_template"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_template_company_id_code_key" ON "pod_template"("company_id", "code");

-- CreateIndex
CREATE INDEX "pod_git_credential_company_id_idx" ON "pod_git_credential"("company_id");

-- CreateIndex
CREATE INDEX "pod_git_sync_company_id_idx" ON "pod_git_sync"("company_id");

-- AddForeignKey
ALTER TABLE "pod_scan_finding" ADD CONSTRAINT "pod_scan_finding_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "pod_scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
