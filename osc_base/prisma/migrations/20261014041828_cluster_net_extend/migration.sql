-- CreateTable
CREATE TABLE "net_device_group" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rules" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_device_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_config_backup" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EXPORT',
    "name" TEXT NOT NULL,
    "content" TEXT,
    "content_hash" TEXT,
    "ros_version" TEXT,
    "size_bytes" INTEGER,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_config_backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_change" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL DEFAULT 'UPDATE',
    "target_type" TEXT NOT NULL,
    "target_ref" TEXT,
    "before" JSONB,
    "after" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "net_device_group_company_id_idx" ON "net_device_group"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "net_device_group_company_id_code_key" ON "net_device_group"("company_id", "code");

-- CreateIndex
CREATE INDEX "net_config_backup_device_id_created_at_idx" ON "net_config_backup"("device_id", "created_at");

-- CreateIndex
CREATE INDEX "net_change_company_id_created_at_idx" ON "net_change"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "net_change_device_id_created_at_idx" ON "net_change"("device_id", "created_at");

-- AddForeignKey
ALTER TABLE "net_config_backup" ADD CONSTRAINT "net_config_backup_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "net_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "net_change" ADD CONSTRAINT "net_change_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "net_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
