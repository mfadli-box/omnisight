-- AlterTable
ALTER TABLE "amm_asset" ADD COLUMN     "acquired_at" TIMESTAMP(3),
ADD COLUMN     "asset_model_id" TEXT,
ADD COLUMN     "department_id" TEXT,
ADD COLUMN     "is_requestable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manufacturer_id" TEXT,
ADD COLUMN     "purchase_cost" DECIMAL(18,2),
ADD COLUMN     "qr_token" TEXT,
ADD COLUMN     "status_label_id" TEXT,
ADD COLUMN     "supplier_id" TEXT,
ADD COLUMN     "warranty_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "amm_asset_request" ADD COLUMN     "accessory_id" TEXT,
ADD COLUMN     "approver_id" TEXT,
ADD COLUMN     "asset_id" TEXT,
ADD COLUMN     "audit_trail" JSONB,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "decided_at" TIMESTAMP(3),
ADD COLUMN     "expected_date" TIMESTAMP(3),
ADD COLUMN     "fulfilled_at" TIMESTAMP(3),
ADD COLUMN     "is_user_facing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kit_id" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "request_date" TIMESTAMP(3),
ADD COLUMN     "requested_by" TEXT,
ADD COLUMN     "target_area_id" TEXT,
ADD COLUMN     "target_department_id" TEXT,
ADD COLUMN     "target_user_id" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "net_device" ADD COLUMN     "agent_id" TEXT,
ADD COLUMN     "api_endpoint" TEXT,
ADD COLUMN     "api_mode" TEXT DEFAULT 'API',
ADD COLUMN     "api_port" INTEGER,
ADD COLUMN     "api_tls" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "board_name" TEXT,
ADD COLUMN     "cpu_load_pct" DOUBLE PRECISION,
ADD COLUMN     "identity" TEXT,
ADD COLUMN     "managed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mem_free_mb" INTEGER,
ADD COLUMN     "ros_version" TEXT,
ADD COLUMN     "secret_enc" TEXT,
ADD COLUMN     "serial" TEXT,
ADD COLUMN     "snmp_community_enc" TEXT,
ADD COLUMN     "snmp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "snmp_port" INTEGER DEFAULT 161,
ADD COLUMN     "snmp_v3_auth_enc" TEXT,
ADD COLUMN     "snmp_v3_priv_enc" TEXT,
ADD COLUMN     "snmp_v3_user" TEXT,
ADD COLUMN     "snmp_version" TEXT DEFAULT 'NONE',
ADD COLUMN     "tags" JSONB,
ADD COLUMN     "uptime_sec" BIGINT,
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "net_interface" ADD COLUMN     "admin_status" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "duplex" TEXT,
ADD COLUMN     "if_alias" TEXT,
ADD COLUMN     "mtu" INTEGER,
ADD COLUMN     "th_low_pct" DOUBLE PRECISION,
ADD COLUMN     "th_warn_pct" DOUBLE PRECISION,
ADD COLUMN     "vlan_id" INTEGER;

-- AlterTable
ALTER TABLE "obs_check" ADD COLUMN     "assertion" TEXT,
ADD COLUMN     "db_dsn_enc" TEXT,
ADD COLUMN     "expected" TEXT,
ADD COLUMN     "follow_redirects" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "http_auth" JSONB,
ADD COLUMN     "http_body" TEXT,
ADD COLUMN     "http_headers" JSONB,
ADD COLUMN     "http_method" TEXT,
ADD COLUMN     "http_options" JSONB,
ADD COLUMN     "json_path" TEXT,
ADD COLUMN     "keyword" TEXT,
ADD COLUMN     "proxy" TEXT,
ADD COLUMN     "push_token" TEXT,
ADD COLUMN     "record_type" TEXT,
ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status_range" TEXT,
ADD COLUMN     "tags" JSONB,
ADD COLUMN     "tls_verify" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "obs_disk" ADD COLUMN     "emmc_life_time" DOUBLE PRECISION,
ADD COLUMN     "emmc_pre_eol" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mdraid_level" TEXT,
ADD COLUMN     "mdraid_state" TEXT,
ADD COLUMN     "scrub_state" TEXT;

-- AlterTable
ALTER TABLE "obs_metric" ADD COLUMN     "metric" TEXT,
ADD COLUMN     "subkey" TEXT,
ADD COLUMN     "system_id" TEXT;

-- AlterTable
ALTER TABLE "pod_backup" ADD COLUMN     "s3_config" JSONB,
ADD COLUMN     "safety_backup_id" TEXT,
ADD COLUMN     "schedule_id" TEXT,
ADD COLUMN     "selective" JSONB;

-- AlterTable
ALTER TABLE "pod_container" ADD COLUMN     "auto_heal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latest_version" TEXT,
ADD COLUMN     "patch_available" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "patched_tag" TEXT,
ADD COLUMN     "tag_pattern" TEXT,
ADD COLUMN     "update_strategy" TEXT DEFAULT 'MANUAL',
ADD COLUMN     "version_constraint" TEXT;

-- AlterTable
ALTER TABLE "pod_git_credential" ADD COLUMN     "commit_email" TEXT,
ADD COLUMN     "commit_name" TEXT,
ADD COLUMN     "gpg_key_enc" TEXT,
ADD COLUMN     "gpg_sign" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "host_key_mode" TEXT;

-- AlterTable
ALTER TABLE "pod_git_sync" ADD COLUMN     "env_git_policy" TEXT DEFAULT 'IGNORE',
ADD COLUMN     "gpg_sign" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pre_deploy" TEXT;

-- AlterTable
ALTER TABLE "pod_image" ADD COLUMN     "latest_version" TEXT,
ADD COLUMN     "patch_available" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "patched_tag" TEXT,
ADD COLUMN     "tag_pattern" TEXT,
ADD COLUMN     "update_strategy" TEXT DEFAULT 'MANUAL',
ADD COLUMN     "version_constraint" TEXT;

-- AlterTable
ALTER TABLE "pod_scan" ADD COLUMN     "epss_max" DOUBLE PRECISION,
ADD COLUMN     "kev_count" INTEGER,
ADD COLUMN     "risk_score" DOUBLE PRECISION,
ADD COLUMN     "trivy_server" TEXT;

-- AlterTable
ALTER TABLE "pod_scan_finding" ADD COLUMN     "epss" DOUBLE PRECISION,
ADD COLUMN     "in_kev" BOOLEAN,
ADD COLUMN     "trend" TEXT;

-- AlterTable
ALTER TABLE "sec_decoder" ADD COLUMN     "dynamic_fields" JSONB,
ADD COLUMN     "is_json" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offset" INTEGER,
ADD COLUMN     "parent_id" TEXT,
ADD COLUMN     "program_name" TEXT;

-- AlterTable
ALTER TABLE "sec_rule" ADD COLUMN     "category" TEXT,
ADD COLUMN     "compliance_gdpr" JSONB,
ADD COLUMN     "compliance_hipaa" JSONB,
ADD COLUMN     "compliance_nist_800_53" JSONB,
ADD COLUMN     "compliance_pci_dss" JSONB,
ADD COLUMN     "compliance_tsc" JSONB,
ADD COLUMN     "decoder" TEXT,
ADD COLUMN     "different_field" TEXT,
ADD COLUMN     "different_id" TEXT,
ADD COLUMN     "frequency" INTEGER,
ADD COLUMN     "if_group" TEXT,
ADD COLUMN     "if_sid" TEXT,
ADD COLUMN     "is_json" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "level" INTEGER,
ADD COLUMN     "list_ref" TEXT,
ADD COLUMN     "match" TEXT,
ADD COLUMN     "mitre_subtechnique" TEXT,
ADD COLUMN     "mitre_tactic" TEXT,
ADD COLUMN     "mitre_technique" TEXT,
ADD COLUMN     "negate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offset" INTEGER,
ADD COLUMN     "parent_id" TEXT,
ADD COLUMN     "regex" TEXT,
ADD COLUMN     "rule_group" TEXT,
ADD COLUMN     "same_field" TEXT,
ADD COLUMN     "same_id" TEXT,
ADD COLUMN     "same_source_ip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "timeframe" INTEGER;

-- AlterTable
ALTER TABLE "vms_backup" ADD COLUMN     "compression" TEXT,
ADD COLUMN     "encrypted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mode" TEXT DEFAULT 'SNAPSHOT',
ADD COLUMN     "retention" INTEGER,
ADD COLUMN     "storage" TEXT,
ADD COLUMN     "verified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vms_guest" ADD COLUMN     "agent_status" TEXT,
ADD COLUMN     "agent_version" TEXT,
ADD COLUMN     "autostart" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "boot_order" JSONB,
ADD COLUMN     "cloud_init" TEXT,
ADD COLUMN     "cloud_init_meta" TEXT,
ADD COLUMN     "cloud_init_network" TEXT,
ADD COLUMN     "cpu_pct" DOUBLE PRECISION,
ADD COLUMN     "disk_used_gb" DOUBLE PRECISION,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "guest_type" TEXT DEFAULT 'VM',
ADD COLUMN     "host_ref" TEXT,
ADD COLUMN     "hotplug" JSONB,
ADD COLUMN     "mem_used_mb" INTEGER,
ADD COLUMN     "node" TEXT,
ADD COLUMN     "shutdown_timeout_sec" INTEGER,
ADD COLUMN     "startup_delay_sec" INTEGER,
ADD COLUMN     "startup_order" INTEGER,
ADD COLUMN     "template" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vcpu" INTEGER;

-- AlterTable
ALTER TABLE "vms_host" ADD COLUMN     "agent_id" TEXT,
ADD COLUMN     "api_endpoint" TEXT,
ADD COLUMN     "api_mode" TEXT DEFAULT 'AGENT',
ADD COLUMN     "cluster_id" TEXT,
ADD COLUMN     "cpu_used" DOUBLE PRECISION,
ADD COLUMN     "managed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pool_id" TEXT,
ADD COLUMN     "ram_used_mb" INTEGER,
ADD COLUMN     "secret_enc" TEXT,
ADD COLUMN     "storage_used_gb" DOUBLE PRECISION,
ADD COLUMN     "uptime_sec" BIGINT,
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "vms_snapshot" ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_live" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parent_id" TEXT,
ADD COLUMN     "with_ram" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "web_access_list" ADD COLUMN     "pass_auth" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "satisfy" TEXT DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "web_certificate" ADD COLUMN     "ari_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "auto_renew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cert_path" TEXT,
ADD COLUMN     "challenge" TEXT,
ADD COLUMN     "dns_provider_id" TEXT,
ADD COLUMN     "key_path" TEXT,
ADD COLUMN     "key_type" TEXT DEFAULT 'RSA',
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "ocsp_must_staple" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "renew_at" TIMESTAMP(3),
ADD COLUMN     "sans" JSONB,
ADD COLUMN     "server_id" TEXT,
ADD COLUMN     "source" TEXT DEFAULT 'MANUAL',
ADD COLUMN     "wildcard" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "web_upstream" ADD COLUMN     "check_interval" INTEGER,
ADD COLUMN     "check_path" TEXT,
ADD COLUMN     "server_id" TEXT,
ADD COLUMN     "strategy" TEXT DEFAULT 'ROUND_ROBIN',
ADD COLUMN     "targets" JSONB;

-- AlterTable
ALTER TABLE "web_vhost" ADD COLUMN     "access_list_id" TEXT,
ADD COLUMN     "advanced" TEXT,
ADD COLUMN     "cert_id" TEXT,
ADD COLUMN     "default_site" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "force_ssl" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hsts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proxy_headers" JSONB,
ADD COLUMN     "redirect_to" TEXT,
ADD COLUMN     "revision_id" TEXT,
ADD COLUMN     "stream_id" TEXT,
ADD COLUMN     "type" TEXT DEFAULT 'PROXY',
ADD COLUMN     "upstream_id" TEXT,
ADD COLUMN     "websocket" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "obs_notify_channel" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'WEBHOOK',
    "config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_notify_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_os" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "os_name" TEXT,
    "os_version" TEXT,
    "architecture" TEXT,
    "kernel" TEXT,
    "hostname" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_os_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_package" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "architecture" TEXT,
    "vendor" TEXT,
    "source" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_iface" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "name" TEXT NOT NULL,
    "mac" TEXT,
    "ipv4" TEXT,
    "ipv6" TEXT,
    "netmask" TEXT,
    "mtu" INTEGER,
    "state" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_iface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_port" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "protocol" TEXT,
    "local_ip" TEXT,
    "local_port" INTEGER,
    "remote_ip" TEXT,
    "remote_port" INTEGER,
    "state" TEXT,
    "process" TEXT,
    "pid" INTEGER,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_port_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_process" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "pid" INTEGER,
    "name" TEXT NOT NULL,
    "command" TEXT,
    "user" TEXT,
    "cpu_pct" DOUBLE PRECISION,
    "mem_pct" DOUBLE PRECISION,
    "state" TEXT,
    "start_time" TIMESTAMP(3),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_user" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "username" TEXT NOT NULL,
    "uid" TEXT,
    "gid" TEXT,
    "home" TEXT,
    "shell" TEXT,
    "groups" JSONB,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_group" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "name" TEXT NOT NULL,
    "gid" TEXT,
    "members" JSONB,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_service" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "state" TEXT,
    "start_type" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_hotfix" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "hotfix_id" TEXT NOT NULL,
    "description" TEXT,
    "installed_at" TIMESTAMP(3),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_hotfix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_browser_ext" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "browser" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "profile" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_browser_ext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "obs_notify_channel_company_id_idx" ON "obs_notify_channel"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "obs_notify_channel_company_id_name_key" ON "obs_notify_channel"("company_id", "name");

-- CreateIndex
CREATE INDEX "sec_syscollector_os_agent_id_idx" ON "sec_syscollector_os"("agent_id");

-- CreateIndex
CREATE INDEX "sec_syscollector_package_agent_id_idx" ON "sec_syscollector_package"("agent_id");

-- CreateIndex
CREATE INDEX "sec_syscollector_package_name_idx" ON "sec_syscollector_package"("name");

-- CreateIndex
CREATE INDEX "sec_syscollector_iface_agent_id_idx" ON "sec_syscollector_iface"("agent_id");

-- CreateIndex
CREATE INDEX "sec_syscollector_port_agent_id_idx" ON "sec_syscollector_port"("agent_id");

-- CreateIndex
CREATE INDEX "sec_syscollector_process_agent_id_idx" ON "sec_syscollector_process"("agent_id");

-- CreateIndex
CREATE INDEX "sec_syscollector_user_agent_id_idx" ON "sec_syscollector_user"("agent_id");

-- CreateIndex
CREATE INDEX "sec_syscollector_group_agent_id_idx" ON "sec_syscollector_group"("agent_id");

-- CreateIndex
CREATE INDEX "sec_syscollector_service_agent_id_idx" ON "sec_syscollector_service"("agent_id");

-- CreateIndex
CREATE INDEX "sec_syscollector_hotfix_agent_id_idx" ON "sec_syscollector_hotfix"("agent_id");

-- CreateIndex
CREATE INDEX "sec_syscollector_browser_ext_agent_id_idx" ON "sec_syscollector_browser_ext"("agent_id");

-- CreateIndex
CREATE INDEX "amm_asset_request_requested_by_status_idx" ON "amm_asset_request"("requested_by", "status");

-- CreateIndex
CREATE UNIQUE INDEX "amm_asset_request_company_id_code_key" ON "amm_asset_request"("company_id", "code");
