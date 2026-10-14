-- CreateTable
CREATE TABLE "net_syslog_event" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT,
    "source_ip" TEXT,
    "facility" TEXT,
    "severity" TEXT,
    "program" TEXT,
    "message" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SYSLOG',
    "dedup_key" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_syslog_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_firewall_rule" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT,
    "chain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "src_addr" TEXT,
    "dst_addr" TEXT,
    "protocol" TEXT,
    "dst_port" TEXT,
    "comment" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_firewall_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_alert_rule" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'DEVICE',
    "metric" TEXT NOT NULL,
    "comparator" TEXT NOT NULL DEFAULT 'GT',
    "threshold" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_alert_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "net_syslog_event_company_id_recorded_at_idx" ON "net_syslog_event"("company_id", "recorded_at");

-- CreateIndex
CREATE INDEX "net_syslog_event_company_id_dedup_key_idx" ON "net_syslog_event"("company_id", "dedup_key");

-- CreateIndex
CREATE INDEX "net_firewall_rule_company_id_idx" ON "net_firewall_rule"("company_id");

-- CreateIndex
CREATE INDEX "net_alert_rule_company_id_idx" ON "net_alert_rule"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "net_alert_rule_company_id_code_key" ON "net_alert_rule"("company_id", "code");

-- AddForeignKey
ALTER TABLE "net_syslog_event" ADD CONSTRAINT "net_syslog_event_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "net_device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "net_firewall_rule" ADD CONSTRAINT "net_firewall_rule_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "net_device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
