-- CreateTable
CREATE TABLE "sec_incident" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignee" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sec_incident_company_id_idx" ON "sec_incident"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sec_incident_company_id_code_key" ON "sec_incident"("company_id", "code");
