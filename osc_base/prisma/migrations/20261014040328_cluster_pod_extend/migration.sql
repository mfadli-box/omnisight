-- CreateTable
CREATE TABLE "pod_engine" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DOCKER',
    "host" TEXT,
    "port" INTEGER,
    "api_version" TEXT,
    "tls_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ca_cert_enc" TEXT,
    "cert_enc" TEXT,
    "key_enc" TEXT,
    "context_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_engine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_stack" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repo_url" TEXT,
    "workdir" TEXT,
    "file" TEXT DEFAULT 'compose.yaml',
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "git_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_stack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_stack_revision" (
    "id" TEXT NOT NULL,
    "stack_id" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_stack_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_service" (
    "id" TEXT NOT NULL,
    "stack_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "scale" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_container" (
    "id" TEXT NOT NULL,
    "service_id" TEXT,
    "stack_id" TEXT,
    "name" TEXT NOT NULL,
    "container_id" TEXT,
    "image" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "ip" TEXT,
    "ports" JSONB,
    "started_at" TIMESTAMP(3),
    "stopped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_image" (
    "id" TEXT NOT NULL,
    "container_id" TEXT,
    "repo" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "digest" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_volume" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driver" TEXT NOT NULL DEFAULT 'local',
    "scope" TEXT NOT NULL DEFAULT 'LOCAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_volume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_network" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driver" TEXT NOT NULL DEFAULT 'bridge',
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_network_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_env_var" (
    "id" TEXT NOT NULL,
    "service_id" TEXT,
    "key" TEXT NOT NULL,
    "value_enc" TEXT,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_env_var_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pod_engine_company_id_idx" ON "pod_engine"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_engine_company_id_code_key" ON "pod_engine"("company_id", "code");

-- CreateIndex
CREATE INDEX "pod_stack_engine_id_idx" ON "pod_stack"("engine_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_stack_engine_id_code_key" ON "pod_stack"("engine_id", "code");

-- CreateIndex
CREATE INDEX "pod_stack_revision_stack_id_idx" ON "pod_stack_revision"("stack_id");

-- CreateIndex
CREATE INDEX "pod_service_stack_id_idx" ON "pod_service"("stack_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_service_stack_id_name_key" ON "pod_service"("stack_id", "name");

-- CreateIndex
CREATE INDEX "pod_container_service_id_idx" ON "pod_container"("service_id");

-- CreateIndex
CREATE INDEX "pod_image_container_id_idx" ON "pod_image"("container_id");

-- CreateIndex
CREATE INDEX "pod_volume_engine_id_idx" ON "pod_volume"("engine_id");

-- CreateIndex
CREATE INDEX "pod_network_engine_id_idx" ON "pod_network"("engine_id");

-- CreateIndex
CREATE INDEX "pod_env_var_service_id_idx" ON "pod_env_var"("service_id");

-- AddForeignKey
ALTER TABLE "pod_stack" ADD CONSTRAINT "pod_stack_engine_id_fkey" FOREIGN KEY ("engine_id") REFERENCES "pod_engine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_stack_revision" ADD CONSTRAINT "pod_stack_revision_stack_id_fkey" FOREIGN KEY ("stack_id") REFERENCES "pod_stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_service" ADD CONSTRAINT "pod_service_stack_id_fkey" FOREIGN KEY ("stack_id") REFERENCES "pod_stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_container" ADD CONSTRAINT "pod_container_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "pod_service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_image" ADD CONSTRAINT "pod_image_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "pod_container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_env_var" ADD CONSTRAINT "pod_env_var_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "pod_service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
