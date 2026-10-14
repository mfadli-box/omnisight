-- CreateTable
CREATE TABLE "sec_agent" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "version" TEXT,
    "last_seen" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_rule" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "content" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_event" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '',
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sec_agent_company_id_idx" ON "sec_agent"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sec_agent_company_id_code_key" ON "sec_agent"("company_id", "code");

-- CreateIndex
CREATE INDEX "sec_rule_company_id_idx" ON "sec_rule"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sec_rule_company_id_code_key" ON "sec_rule"("company_id", "code");

-- CreateIndex
CREATE INDEX "sec_event_company_id_created_at_idx" ON "sec_event"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "sec_event_agent_id_idx" ON "sec_event"("agent_id");

-- AddForeignKey
ALTER TABLE "sec_event" ADD CONSTRAINT "sec_event_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "sec_agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
