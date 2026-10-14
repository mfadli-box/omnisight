-- CreateTable
CREATE TABLE "obs_system" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "agent_id" TEXT,
    "hostname" TEXT NOT NULL,
    "os" TEXT,
    "ip" TEXT,
    "last_seen" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_system_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_check" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'HTTP',
    "target" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 60,
    "timeout" INTEGER NOT NULL DEFAULT 10,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_check_result" (
    "id" TEXT NOT NULL,
    "check_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UP',
    "duration_ms" INTEGER,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_check_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "obs_system_company_id_idx" ON "obs_system"("company_id");

-- CreateIndex
CREATE INDEX "obs_check_company_id_idx" ON "obs_check"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "obs_check_company_id_code_key" ON "obs_check"("company_id", "code");

-- CreateIndex
CREATE INDEX "obs_check_result_check_id_created_at_idx" ON "obs_check_result"("check_id", "created_at");

-- AddForeignKey
ALTER TABLE "obs_check_result" ADD CONSTRAINT "obs_check_result_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "obs_check"("id") ON DELETE CASCADE ON UPDATE CASCADE;
