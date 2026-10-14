-- CreateTable
CREATE TABLE "app_notify_channel" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'EMAIL',
    "config_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_notify_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_notify_template" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "channel_type" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'TEXT',
    "locale" TEXT NOT NULL DEFAULT 'id',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_notify_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_notify_rule" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "event" TEXT NOT NULL,
    "min_level" TEXT NOT NULL DEFAULT 'INFO',
    "channel_id" TEXT NOT NULL,
    "template_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_notify_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_notify_message" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "rule_id" TEXT,
    "channel_id" TEXT,
    "event" TEXT NOT NULL,
    "target" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_notify_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_api_key" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" JSONB,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_webhook" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret_enc" TEXT,
    "events" JSONB,
    "headers" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "retry_policy" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_webhook_delivery" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "response" TEXT,
    "status" INTEGER,
    "status_text" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "duration_ms" INTEGER,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_integration" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'HRIS',
    "config_enc" TEXT,
    "map_config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_integration_sync" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'IMPORT',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "stats" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_integration_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_preference" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "user_id" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_report" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT,
    "params" JSONB,
    "format" TEXT NOT NULL DEFAULT 'PDF',
    "schedule" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_backup" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "checksum" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_backup_item" (
    "id" TEXT NOT NULL,
    "backup_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_backup_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_notify_channel_company_id_idx" ON "app_notify_channel"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_notify_channel_company_id_name_key" ON "app_notify_channel"("company_id", "name");

-- CreateIndex
CREATE INDEX "app_notify_template_company_id_idx" ON "app_notify_template"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_notify_template_company_id_code_locale_key" ON "app_notify_template"("company_id", "code", "locale");

-- CreateIndex
CREATE INDEX "app_notify_rule_company_id_event_idx" ON "app_notify_rule"("company_id", "event");

-- CreateIndex
CREATE INDEX "app_notify_rule_channel_id_idx" ON "app_notify_rule"("channel_id");

-- CreateIndex
CREATE INDEX "app_notify_message_created_at_idx" ON "app_notify_message"("created_at");

-- CreateIndex
CREATE INDEX "app_notify_message_company_id_idx" ON "app_notify_message"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_api_key_key_hash_key" ON "app_api_key"("key_hash");

-- CreateIndex
CREATE INDEX "app_api_key_company_id_idx" ON "app_api_key"("company_id");

-- CreateIndex
CREATE INDEX "app_webhook_company_id_idx" ON "app_webhook"("company_id");

-- CreateIndex
CREATE INDEX "app_webhook_delivery_webhook_id_created_at_idx" ON "app_webhook_delivery"("webhook_id", "created_at");

-- CreateIndex
CREATE INDEX "app_integration_company_id_idx" ON "app_integration"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_integration_company_id_code_key" ON "app_integration"("company_id", "code");

-- CreateIndex
CREATE INDEX "app_integration_sync_integration_id_started_at_idx" ON "app_integration_sync"("integration_id", "started_at");

-- CreateIndex
CREATE INDEX "app_preference_company_id_user_id_key_idx" ON "app_preference"("company_id", "user_id", "key");

-- CreateIndex
CREATE INDEX "app_report_company_id_idx" ON "app_report"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_report_company_id_code_key" ON "app_report"("company_id", "code");

-- CreateIndex
CREATE INDEX "app_backup_company_id_idx" ON "app_backup"("company_id");

-- CreateIndex
CREATE INDEX "app_backup_item_backup_id_idx" ON "app_backup_item"("backup_id");

-- AddForeignKey
ALTER TABLE "app_notify_rule" ADD CONSTRAINT "app_notify_rule_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "app_notify_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_notify_rule" ADD CONSTRAINT "app_notify_rule_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "app_notify_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_notify_message" ADD CONSTRAINT "app_notify_message_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "app_notify_rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_notify_message" ADD CONSTRAINT "app_notify_message_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "app_notify_channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_webhook_delivery" ADD CONSTRAINT "app_webhook_delivery_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "app_webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_integration_sync" ADD CONSTRAINT "app_integration_sync_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "app_integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_backup_item" ADD CONSTRAINT "app_backup_item_backup_id_fkey" FOREIGN KEY ("backup_id") REFERENCES "app_backup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
