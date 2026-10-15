-- CreateTable
CREATE TABLE "amm_asset_type" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_asset_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_asset" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "area_id" TEXT,
    "type_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ip_address" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "rent_status" INTEGER NOT NULL DEFAULT 0,
    "phone_type" TEXT,
    "phone_number" TEXT,
    "phone_imei" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_asset_tag" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_asset_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_asset_device" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CASHIER1',
    "pos_model" TEXT,
    "ram" TEXT,
    "printer_model" TEXT,
    "year" INTEGER,
    "serial" TEXT,
    "detail" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_asset_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_digital_signage" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "device_type" TEXT NOT NULL DEFAULT 'TV',
    "position" INTEGER,
    "brand" TEXT,
    "serial" TEXT,
    "detail" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_digital_signage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_store_account" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "external_id" TEXT,
    "account_type" TEXT NOT NULL,
    "username" TEXT,
    "password_enc" TEXT,
    "phone" TEXT,
    "sid" TEXT,
    "mid" TEXT,
    "external_uuid" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_store_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_store_edc" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "edc_type" TEXT NOT NULL,
    "connect_with" TEXT,
    "connect_to" TEXT,
    "mid" TEXT,
    "tid" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_store_edc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_agent" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "ip_address" TEXT,
    "os" TEXT,
    "version" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "last_seen" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_heartbeat" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "cpu_pct" DOUBLE PRECISION,
    "mem_pct" DOUBLE PRECISION,
    "disk_pct" DOUBLE PRECISION,
    "load_avg" DOUBLE PRECISION,
    "uptime_s" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_heartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_task" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "result" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_document" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "owner_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_version" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "file_path" TEXT,
    "mime_type" TEXT,
    "size_bytes" BIGINT,
    "checksum" TEXT,
    "change_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_sign" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id" TEXT,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "signed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_sign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dso_pipeline" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GITHUB',
    "repo_url" TEXT,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dso_pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dso_build" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "commit_sha" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "artifact_url" TEXT,
    "logs_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dso_build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dso_deploy" (
    "id" TEXT NOT NULL,
    "build_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'staging',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" TEXT,
    "released_by" TEXT,
    "deployed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dso_deploy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jms_job" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "job_type" TEXT NOT NULL DEFAULT 'SHELL',
    "command" TEXT,
    "endpoint" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jms_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jms_schedule" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jms_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jms_run" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "exit_code" INTEGER,
    "output" TEXT,
    "error" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jms_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_subnet" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "gateway" TEXT,
    "vlan" INTEGER,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_subnet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_device" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "subnet_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "ip_address" TEXT,
    "mac_address" TEXT,
    "device_type" TEXT NOT NULL DEFAULT 'SWITCH',
    "vendor" TEXT,
    "model" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "last_seen" TIMESTAMP(3),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_interface" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "if_index" INTEGER,
    "mac_address" TEXT,
    "ip_address" TEXT,
    "speed_mbps" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_interface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_metric" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "labels" JSONB,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_log" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "context" JSONB,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_alert" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "source" TEXT,
    "condition" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'FIRING',
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acked_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_cluster" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'K8S',
    "api_endpoint" TEXT,
    "version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_cluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_node" (
    "id" TEXT NOT NULL,
    "cluster_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'WORKER',
    "ip_address" TEXT,
    "cpu_capacity" TEXT,
    "mem_capacity_mb" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "last_seen" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_workload" (
    "id" TEXT NOT NULL,
    "cluster_id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DEPLOYMENT',
    "image" TEXT,
    "replicas" INTEGER,
    "ready_replicas" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_workload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_waf_rule" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL DEFAULT 'CUSTOM',
    "pattern" TEXT,
    "action" TEXT NOT NULL DEFAULT 'BLOCK',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_waf_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_waf_event" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "rule_id" TEXT,
    "source_ip" TEXT NOT NULL,
    "method" TEXT,
    "path" TEXT,
    "action" TEXT NOT NULL DEFAULT 'BLOCK',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_waf_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_host" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "ip_address" TEXT,
    "hypervisor" TEXT NOT NULL DEFAULT 'VMWARE',
    "version" TEXT,
    "cpu_cores" INTEGER,
    "ram_mb" INTEGER,
    "storage_gb" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_host_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_guest" (
    "id" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "guest_os" TEXT,
    "cpu_cores" INTEGER,
    "ram_mb" INTEGER,
    "disk_gb" INTEGER,
    "power_state" TEXT NOT NULL DEFAULT 'OFF',
    "ip_address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_finding" (
    "id" TEXT NOT NULL,
    "host_id" TEXT,
    "guest_id" TEXT,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "cve" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_vhost" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "server_name" TEXT NOT NULL,
    "listen_port" INTEGER NOT NULL DEFAULT 443,
    "ssl" BOOLEAN NOT NULL DEFAULT true,
    "root" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_vhost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_certificate" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "common_name" TEXT NOT NULL,
    "issuer" TEXT,
    "serial" TEXT,
    "not_before" TIMESTAMP(3),
    "not_after" TIMESTAMP(3),
    "fingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_upstream" (
    "id" TEXT NOT NULL,
    "vhost_id" TEXT,
    "name" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "health_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_upstream_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "amm_asset_type_company_id_idx" ON "amm_asset_type"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "amm_asset_type_company_id_code_key" ON "amm_asset_type"("company_id", "code");

-- CreateIndex
CREATE INDEX "amm_asset_company_id_idx" ON "amm_asset"("company_id");

-- CreateIndex
CREATE INDEX "amm_asset_area_id_idx" ON "amm_asset"("area_id");

-- CreateIndex
CREATE INDEX "amm_asset_type_id_idx" ON "amm_asset"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "amm_asset_company_id_code_key" ON "amm_asset"("company_id", "code");

-- CreateIndex
CREATE INDEX "amm_asset_tag_asset_id_idx" ON "amm_asset_tag"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "amm_asset_tag_asset_id_tag_key" ON "amm_asset_tag"("asset_id", "tag");

-- CreateIndex
CREATE INDEX "amm_asset_device_asset_id_idx" ON "amm_asset_device"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "amm_asset_device_asset_id_role_key" ON "amm_asset_device"("asset_id", "role");

-- CreateIndex
CREATE INDEX "amm_digital_signage_asset_id_idx" ON "amm_digital_signage"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "amm_digital_signage_asset_id_device_type_position_key" ON "amm_digital_signage"("asset_id", "device_type", "position");

-- CreateIndex
CREATE INDEX "amm_store_account_asset_id_idx" ON "amm_store_account"("asset_id");

-- CreateIndex
CREATE INDEX "amm_store_account_account_type_idx" ON "amm_store_account"("account_type");

-- CreateIndex
CREATE INDEX "amm_store_edc_asset_id_idx" ON "amm_store_edc"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "bot_agent_token_key" ON "bot_agent"("token");

-- CreateIndex
CREATE INDEX "bot_agent_company_id_idx" ON "bot_agent"("company_id");

-- CreateIndex
CREATE INDEX "bot_agent_status_idx" ON "bot_agent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bot_agent_company_id_code_key" ON "bot_agent"("company_id", "code");

-- CreateIndex
CREATE INDEX "bot_heartbeat_agent_id_idx" ON "bot_heartbeat"("agent_id");

-- CreateIndex
CREATE INDEX "bot_heartbeat_created_at_idx" ON "bot_heartbeat"("created_at");

-- CreateIndex
CREATE INDEX "bot_task_agent_id_idx" ON "bot_task"("agent_id");

-- CreateIndex
CREATE INDEX "bot_task_status_idx" ON "bot_task"("status");

-- CreateIndex
CREATE INDEX "doc_document_company_id_idx" ON "doc_document"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_document_company_id_code_key" ON "doc_document"("company_id", "code");

-- CreateIndex
CREATE INDEX "doc_version_document_id_idx" ON "doc_version"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_version_document_id_version_key" ON "doc_version"("document_id", "version");

-- CreateIndex
CREATE INDEX "doc_sign_document_id_idx" ON "doc_sign"("document_id");

-- CreateIndex
CREATE INDEX "doc_sign_version_id_idx" ON "doc_sign"("version_id");

-- CreateIndex
CREATE INDEX "doc_sign_user_id_idx" ON "doc_sign"("user_id");

-- CreateIndex
CREATE INDEX "dso_pipeline_company_id_idx" ON "dso_pipeline"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "dso_pipeline_company_id_code_key" ON "dso_pipeline"("company_id", "code");

-- CreateIndex
CREATE INDEX "dso_build_pipeline_id_idx" ON "dso_build"("pipeline_id");

-- CreateIndex
CREATE INDEX "dso_build_status_idx" ON "dso_build"("status");

-- CreateIndex
CREATE UNIQUE INDEX "dso_build_pipeline_id_number_key" ON "dso_build"("pipeline_id", "number");

-- CreateIndex
CREATE INDEX "dso_deploy_build_id_idx" ON "dso_deploy"("build_id");

-- CreateIndex
CREATE INDEX "dso_deploy_environment_idx" ON "dso_deploy"("environment");

-- CreateIndex
CREATE INDEX "jms_job_company_id_idx" ON "jms_job"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "jms_job_company_id_code_key" ON "jms_job"("company_id", "code");

-- CreateIndex
CREATE INDEX "jms_schedule_job_id_idx" ON "jms_schedule"("job_id");

-- CreateIndex
CREATE INDEX "jms_run_job_id_idx" ON "jms_run"("job_id");

-- CreateIndex
CREATE INDEX "jms_run_started_at_idx" ON "jms_run"("started_at");

-- CreateIndex
CREATE INDEX "jms_run_status_idx" ON "jms_run"("status");

-- CreateIndex
CREATE INDEX "net_subnet_company_id_idx" ON "net_subnet"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "net_subnet_company_id_code_key" ON "net_subnet"("company_id", "code");

-- CreateIndex
CREATE INDEX "net_device_company_id_idx" ON "net_device"("company_id");

-- CreateIndex
CREATE INDEX "net_device_subnet_id_idx" ON "net_device"("subnet_id");

-- CreateIndex
CREATE INDEX "net_device_status_idx" ON "net_device"("status");

-- CreateIndex
CREATE UNIQUE INDEX "net_device_company_id_code_key" ON "net_device"("company_id", "code");

-- CreateIndex
CREATE INDEX "net_interface_device_id_idx" ON "net_interface"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "net_interface_device_id_name_key" ON "net_interface"("device_id", "name");

-- CreateIndex
CREATE INDEX "obs_metric_company_id_idx" ON "obs_metric"("company_id");

-- CreateIndex
CREATE INDEX "obs_metric_source_name_recorded_at_idx" ON "obs_metric"("source", "name", "recorded_at");

-- CreateIndex
CREATE INDEX "obs_metric_recorded_at_idx" ON "obs_metric"("recorded_at");

-- CreateIndex
CREATE INDEX "obs_log_company_id_idx" ON "obs_log"("company_id");

-- CreateIndex
CREATE INDEX "obs_log_level_idx" ON "obs_log"("level");

-- CreateIndex
CREATE INDEX "obs_log_source_idx" ON "obs_log"("source");

-- CreateIndex
CREATE INDEX "obs_log_recorded_at_idx" ON "obs_log"("recorded_at");

-- CreateIndex
CREATE INDEX "obs_alert_company_id_idx" ON "obs_alert"("company_id");

-- CreateIndex
CREATE INDEX "obs_alert_status_idx" ON "obs_alert"("status");

-- CreateIndex
CREATE INDEX "obs_alert_severity_idx" ON "obs_alert"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "obs_alert_company_id_code_key" ON "obs_alert"("company_id", "code");

-- CreateIndex
CREATE INDEX "pod_cluster_company_id_idx" ON "pod_cluster"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_cluster_company_id_code_key" ON "pod_cluster"("company_id", "code");

-- CreateIndex
CREATE INDEX "pod_node_cluster_id_idx" ON "pod_node"("cluster_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_node_cluster_id_name_key" ON "pod_node"("cluster_id", "name");

-- CreateIndex
CREATE INDEX "pod_workload_cluster_id_idx" ON "pod_workload"("cluster_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_workload_cluster_id_namespace_name_kind_key" ON "pod_workload"("cluster_id", "namespace", "name", "kind");

-- CreateIndex
CREATE INDEX "sec_waf_rule_company_id_idx" ON "sec_waf_rule"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sec_waf_rule_company_id_code_key" ON "sec_waf_rule"("company_id", "code");

-- CreateIndex
CREATE INDEX "sec_waf_event_company_id_idx" ON "sec_waf_event"("company_id");

-- CreateIndex
CREATE INDEX "sec_waf_event_rule_id_idx" ON "sec_waf_event"("rule_id");

-- CreateIndex
CREATE INDEX "sec_waf_event_occurred_at_idx" ON "sec_waf_event"("occurred_at");

-- CreateIndex
CREATE INDEX "vms_host_company_id_idx" ON "vms_host"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "vms_host_company_id_code_key" ON "vms_host"("company_id", "code");

-- CreateIndex
CREATE INDEX "vms_guest_host_id_idx" ON "vms_guest"("host_id");

-- CreateIndex
CREATE UNIQUE INDEX "vms_guest_host_id_code_key" ON "vms_guest"("host_id", "code");

-- CreateIndex
CREATE INDEX "vms_finding_host_id_idx" ON "vms_finding"("host_id");

-- CreateIndex
CREATE INDEX "vms_finding_guest_id_idx" ON "vms_finding"("guest_id");

-- CreateIndex
CREATE INDEX "vms_finding_status_idx" ON "vms_finding"("status");

-- CreateIndex
CREATE INDEX "vms_finding_severity_idx" ON "vms_finding"("severity");

-- CreateIndex
CREATE INDEX "web_vhost_company_id_idx" ON "web_vhost"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "web_vhost_company_id_server_name_key" ON "web_vhost"("company_id", "server_name");

-- CreateIndex
CREATE INDEX "web_certificate_company_id_idx" ON "web_certificate"("company_id");

-- CreateIndex
CREATE INDEX "web_certificate_status_idx" ON "web_certificate"("status");

-- CreateIndex
CREATE INDEX "web_certificate_not_after_idx" ON "web_certificate"("not_after");

-- CreateIndex
CREATE INDEX "web_upstream_vhost_id_idx" ON "web_upstream"("vhost_id");

-- AddForeignKey
ALTER TABLE "amm_asset" ADD CONSTRAINT "amm_asset_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "amm_asset_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amm_asset_tag" ADD CONSTRAINT "amm_asset_tag_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "amm_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amm_asset_device" ADD CONSTRAINT "amm_asset_device_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "amm_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amm_digital_signage" ADD CONSTRAINT "amm_digital_signage_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "amm_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amm_store_account" ADD CONSTRAINT "amm_store_account_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "amm_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amm_store_edc" ADD CONSTRAINT "amm_store_edc_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "amm_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_heartbeat" ADD CONSTRAINT "bot_heartbeat_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "bot_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_task" ADD CONSTRAINT "bot_task_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "bot_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_version" ADD CONSTRAINT "doc_version_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "doc_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_sign" ADD CONSTRAINT "doc_sign_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "doc_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_sign" ADD CONSTRAINT "doc_sign_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "doc_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dso_build" ADD CONSTRAINT "dso_build_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "dso_pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dso_deploy" ADD CONSTRAINT "dso_deploy_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "dso_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jms_schedule" ADD CONSTRAINT "jms_schedule_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jms_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jms_run" ADD CONSTRAINT "jms_run_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jms_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "net_device" ADD CONSTRAINT "net_device_subnet_id_fkey" FOREIGN KEY ("subnet_id") REFERENCES "net_subnet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "net_interface" ADD CONSTRAINT "net_interface_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "net_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_node" ADD CONSTRAINT "pod_node_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "pod_cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_workload" ADD CONSTRAINT "pod_workload_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "pod_cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sec_waf_event" ADD CONSTRAINT "sec_waf_event_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "sec_waf_rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vms_guest" ADD CONSTRAINT "vms_guest_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "vms_host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vms_finding" ADD CONSTRAINT "vms_finding_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "vms_host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vms_finding" ADD CONSTRAINT "vms_finding_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "vms_guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_upstream" ADD CONSTRAINT "web_upstream_vhost_id_fkey" FOREIGN KEY ("vhost_id") REFERENCES "web_vhost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
