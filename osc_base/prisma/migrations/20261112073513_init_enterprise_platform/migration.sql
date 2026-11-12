-- CreateEnum
CREATE TYPE "permission_action" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "notification_channel_type" AS ENUM ('SMTP_EMAIL', 'TELEGRAM', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "node_type" AS ENUM ('HOST', 'NETWORK', 'VIRTUAL', 'CONTAINER', 'RACK_MOUNTED', 'SERVICE');

-- CreateEnum
CREATE TYPE "category_type" AS ENUM ('ASSET', 'ACCESSORY', 'COMPONENT', 'CONSUMABLE', 'LICENSE', 'TICKET');

-- CreateEnum
CREATE TYPE "status_label_type" AS ENUM ('DEPLOYABLE', 'PENDING', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('ACTIVE', 'PLANNED', 'STAGED', 'OFFLINE', 'FAILED', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "checkout_action" AS ENUM ('CHECKOUT', 'CHECKIN');

-- CreateEnum
CREATE TYPE "license_type" AS ENUM ('PERPETUAL', 'SUBSCRIPTION', 'OEM', 'VOLUME');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('NEW', 'ASSIGNED', 'PLANNED', 'PENDING', 'SOLVED', 'CLOSED', 'ACCEPTED', 'UNDER_APPROVAL');

-- CreateEnum
CREATE TYPE "ticket_priority" AS ENUM ('VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "ticket_type" AS ENUM ('INCIDENT', 'REQUEST');

-- CreateEnum
CREATE TYPE "rack_face" AS ENUM ('FRONT', 'REAR');

-- CreateEnum
CREATE TYPE "cable_status" AS ENUM ('CONNECTED', 'PLANNED', 'DECOMMISSIONING');

-- CreateEnum
CREATE TYPE "vlan_status" AS ENUM ('ACTIVE', 'RESERVED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "prefix_status" AS ENUM ('ACTIVE', 'RESERVED', 'CONTAINER', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "ip_address_status" AS ENUM ('ACTIVE', 'RESERVED', 'DEPRECATED', 'DHCP', 'SLAAC');

-- CreateEnum
CREATE TYPE "snmp_version" AS ENUM ('V1', 'V2C', 'V3');

-- CreateEnum
CREATE TYPE "uptime_monitor_type" AS ENUM ('HTTP', 'HTTPS', 'TCP', 'ICMP', 'DNS', 'KEYWORD', 'PUSH');

-- CreateEnum
CREATE TYPE "heartbeat_status" AS ENUM ('UP', 'DOWN', 'PENDING', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "nginx_vhost_status" AS ENUM ('DRAFT', 'TESTING', 'APPLIED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "node_online_status" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "drift_status" AS ENUM ('IN_SYNC', 'DRIFTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "alert_operator" AS ENUM ('GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ');

-- CreateEnum
CREATE TYPE "alert_severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "alert_state" AS ENUM ('FIRING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "fim_event_type" AS ENUM ('CREATED', 'MODIFIED', 'DELETED', 'ATTRIBUTE_CHANGED');

-- CreateEnum
CREATE TYPE "fim_detection_source" AS ENUM ('REALTIME', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "security_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "vulnerability_status" AS ENUM ('OPEN', 'FIXED', 'ACCEPTED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "compliance_status" AS ENUM ('PASS', 'FAIL', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "pam_account_type" AS ENUM ('SSH_PASSWORD', 'SSH_KEY', 'DATABASE', 'HTTP_ENDPOINT');

-- CreateEnum
CREATE TYPE "pam_session_status" AS ENUM ('REQUESTED', 'AUTHORIZED', 'ACTIVE', 'CLOSED', 'DENIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "file_asset_category" AS ENUM ('PAM_RECORDING', 'CONFIG_BACKUP', 'EXCEL_EXPORT', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "metric_tier" AS ENUM ('TIER_1M', 'TIER_10M');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "hris_login_url" VARCHAR(500),
    "hris_cache_ttl_hours" INTEGER NOT NULL DEFAULT 72,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "display_name" VARCHAR(100),
    "last_hris_sync_at" TIMESTAMPTZ(3),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret_encrypted" BYTEA,
    "mfa_last_verified_step" BIGINT,
    "mfa_backup_codes_hash" VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "active_company_id" UUID,
    "token_hash" VARCHAR(255) NOT NULL,
    "ip_address" INET,
    "user_agent" VARCHAR(500),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,

    CONSTRAINT "role_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_id" UUID NOT NULL,
    "collection" VARCHAR(100) NOT NULL,
    "action" "permission_action" NOT NULL,
    "fields_allowed" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "row_filter" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_company_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_company_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "route_path" VARCHAR(300),
    "icon" VARCHAR(100),
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_menu_privileges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_update" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_menu_privileges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_meta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(100),
    "note" VARCHAR(500),
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "collection_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_meta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_id" UUID NOT NULL,
    "field" VARCHAR(100) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "special" VARCHAR(255),
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "field_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relation_meta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_id" UUID NOT NULL,
    "field" VARCHAR(100) NOT NULL,
    "related_collection_id" UUID,
    "relation_type" VARCHAR(20) NOT NULL,
    "on_delete_action" VARCHAR(20),
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "relation_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100),
    "entity_id" UUID,
    "ip_address" INET,
    "user_agent" VARCHAR(500),
    "detail" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_flows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "trigger_event" VARCHAR(100) NOT NULL,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "type" "notification_channel_type" NOT NULL,
    "config" JSONB NOT NULL,
    "event_filter" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_enrollment_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "node_type" "node_type",
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_enrollment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "notes" VARCHAR(500),
    "manager_user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "address" VARCHAR(300),
    "city" VARCHAR(100),
    "parent_id" UUID,
    "notes" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" "category_type" NOT NULL,
    "notes" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "support_email" VARCHAR(255),
    "support_phone" VARCHAR(50),
    "support_url" VARCHAR(500),
    "notes" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_name" VARCHAR(150),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(50),
    "address" VARCHAR(300),
    "website_url" VARCHAR(500),
    "notes" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_labels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" "status_label_type" NOT NULL,
    "color" VARCHAR(20),
    "notes" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "status_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "model_number" VARCHAR(150),
    "category_id" UUID NOT NULL,
    "manufacturer_id" UUID NOT NULL,
    "eol_months" INTEGER,
    "notes" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "asset_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "asset_tag" VARCHAR(100) NOT NULL,
    "node_type" "node_type" NOT NULL DEFAULT 'HOST',
    "status" "asset_status" NOT NULL DEFAULT 'ACTIVE',
    "hostname" VARCHAR(255),
    "fqdn" VARCHAR(255),
    "mgmt_ip" INET,
    "serial_number" VARCHAR(255),
    "asset_model_id" UUID NOT NULL,
    "status_label_id" UUID NOT NULL,
    "site_id" UUID,
    "department_id" UUID,
    "location_id" UUID,
    "supplier_id" UUID,
    "assigned_to_user_id" UUID,
    "location_path" VARCHAR(500),
    "purchase_date" DATE,
    "purchase_cost" DECIMAL(12,2),
    "warranty_months" INTEGER,
    "last_seen_at" TIMESTAMPTZ(3),
    "is_dynamic" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(100),
    "notes" TEXT,
    "metadata" JSONB,
    "custom_fields" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_checkout_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "action" "checkout_action" NOT NULL,
    "actor_user_id" UUID,
    "target_user_id" UUID,
    "target_location_id" UUID,
    "expected_checkin_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_checkout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "software_licenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "license_key" VARCHAR(500),
    "type" "license_type" NOT NULL DEFAULT 'PERPETUAL',
    "seats_total" INTEGER NOT NULL DEFAULT 1,
    "manufacturer_id" UUID,
    "supplier_id" UUID,
    "purchase_date" DATE,
    "expiry_date" DATE,
    "purchase_cost" DECIMAL(12,2),
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "software_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_seats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "license_id" UUID NOT NULL,
    "seat_number" INTEGER NOT NULL,
    "assigned_user_id" UUID,
    "assigned_asset_id" UUID,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "license_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hardware_inventory_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "collected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpu_model" VARCHAR(200),
    "cpu_cores" INTEGER,
    "memory_total_bytes" BIGINT,
    "storage_total_bytes" BIGINT,
    "os_name" VARCHAR(150),
    "os_version" VARCHAR(100),
    "payload" JSONB NOT NULL,

    CONSTRAINT "hardware_inventory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "type" "ticket_type" NOT NULL DEFAULT 'INCIDENT',
    "status" "ticket_status" NOT NULL DEFAULT 'NEW',
    "priority" "ticket_priority" NOT NULL DEFAULT 'MEDIUM',
    "category_id" UUID,
    "asset_id" UUID,
    "requester_user_id" UUID,
    "requester_email" VARCHAR(255),
    "assignee_user_id" UUID,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "departmentId" UUID,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_followups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_user_id" UUID,
    "body" TEXT NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_followups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(50),
    "address" VARCHAR(300),
    "city" VARCHAR(100),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "notes" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "racks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "u_height" INTEGER NOT NULL DEFAULT 42,
    "model" VARCHAR(150),
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "racks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rack_unit_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "rack_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "unit_number" INTEGER NOT NULL,
    "face" "rack_face" NOT NULL DEFAULT 'FRONT',
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rack_unit_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_interfaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL DEFAULT 'ethernet',
    "mac_address" VARCHAR(50),
    "mtu" INTEGER,
    "speed_mbps" INTEGER,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_interfaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cable_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "label" VARCHAR(150),
    "type" VARCHAR(50),
    "status" "cable_status" NOT NULL DEFAULT 'PLANNED',
    "port_a_id" UUID NOT NULL,
    "port_b_id" UUID NOT NULL,
    "length_m" DECIMAL(8,2),
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cable_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vlans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "vid" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "status" "vlan_status" NOT NULL DEFAULT 'ACTIVE',
    "site_id" UUID,
    "description" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vlans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_prefixes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "prefix" VARCHAR(64) NOT NULL,
    "status" "prefix_status" NOT NULL DEFAULT 'ACTIVE',
    "site_id" UUID,
    "vlan_id" UUID,
    "is_pool" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ip_prefixes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "address" INET NOT NULL,
    "status" "ip_address_status" NOT NULL DEFAULT 'ACTIVE',
    "prefix_id" UUID,
    "interface_id" UUID,
    "is_gateway" BOOLEAN NOT NULL DEFAULT false,
    "dns_name" VARCHAR(255),
    "description" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "assetId" UUID,

    CONSTRAINT "ip_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snmp_device_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "version" "snmp_version" NOT NULL DEFAULT 'V2C',
    "port" INTEGER NOT NULL DEFAULT 161,
    "community_encrypted" BYTEA,
    "v3_username" VARCHAR(100),
    "v3_auth_protocol" VARCHAR(20),
    "v3_auth_pass_encrypted" BYTEA,
    "v3_priv_protocol" VARCHAR(20),
    "v3_priv_pass_encrypted" BYTEA,
    "poll_interval_seconds" INTEGER NOT NULL DEFAULT 300,
    "last_polled_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "snmp_device_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interface_metric_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "interface_id" UUID NOT NULL,
    "collected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inOctets" BIGINT NOT NULL,
    "outOctets" BIGINT NOT NULL,
    "in_unicast_packets" BIGINT,
    "out_unicast_packets" BIGINT,
    "in_errors" BIGINT,
    "out_errors" BIGINT,
    "in_discards" BIGINT,
    "out_discards" BIGINT,
    "in_rate_bps" BIGINT,
    "out_rate_bps" BIGINT,

    CONSTRAINT "interface_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uptime_monitors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "type" "uptime_monitor_type" NOT NULL DEFAULT 'HTTP',
    "target" VARCHAR(500) NOT NULL,
    "config" JSONB,
    "interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "retries" INTEGER NOT NULL DEFAULT 1,
    "push_token_hash" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "uptime_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uptime_heartbeats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "monitor_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "heartbeat_status" NOT NULL DEFAULT 'PENDING',
    "ping_ms" INTEGER,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "msg" VARCHAR(500),

    CONSTRAINT "uptime_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "status_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_page_monitors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "status_page_id" UUID NOT NULL,
    "monitor_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_page_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nginx_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "endpoint" VARCHAR(255) NOT NULL,
    "config_dir" VARCHAR(500),
    "status" "node_online_status" NOT NULL DEFAULT 'UNKNOWN',
    "nginx_version" VARCHAR(50),
    "last_seen_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "nginx_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nginx_virtual_hosts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "nginx_node_id" UUID NOT NULL,
    "server_name" VARCHAR(255) NOT NULL,
    "listen_port" INTEGER NOT NULL DEFAULT 80,
    "status" "nginx_vhost_status" NOT NULL DEFAULT 'DRAFT',
    "config_content" TEXT NOT NULL,
    "ssl_cert_path" VARCHAR(500),
    "ssl_key_path" VARCHAR(500),
    "backup_object_key" VARCHAR(500),
    "last_error" VARCHAR(500),
    "validated_at" TIMESTAMPTZ(3),
    "applied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "nginx_virtual_hosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docker_hosts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "endpoint" VARCHAR(255) NOT NULL,
    "docker_version" VARCHAR(50),
    "status" "node_online_status" NOT NULL DEFAULT 'UNKNOWN',
    "container_count" INTEGER,
    "last_seen_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "docker_hosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compose_stacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "docker_host_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "working_dir" VARCHAR(500) NOT NULL,
    "compose_content" TEXT NOT NULL,
    "env_encrypted" BYTEA,
    "drift_status" "drift_status" NOT NULL DEFAULT 'UNKNOWN',
    "backup_object_key" VARCHAR(500),
    "last_deployed_at" TIMESTAMPTZ(3),
    "last_synced_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "compose_stacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_metric_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tier" "metric_tier" NOT NULL DEFAULT 'TIER_1M',
    "cpu_usage_pct" DECIMAL(5,2),
    "load1" DECIMAL(6,2),
    "load5" DECIMAL(6,2),
    "load15" DECIMAL(6,2),
    "mem_used_bytes" BIGINT,
    "mem_total_bytes" BIGINT,
    "disk_used_bytes" BIGINT,
    "disk_total_bytes" BIGINT,
    "net_in_bps" BIGINT,
    "net_out_bps" BIGINT,
    "uptime_seconds" BIGINT,
    "agent_id" UUID,

    CONSTRAINT "system_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_metric_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "container_ref" VARCHAR(100) NOT NULL,
    "container_name" VARCHAR(150),
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpu_usage_pct" DECIMAL(5,2),
    "mem_used_bytes" BIGINT,
    "mem_limit_bytes" BIGINT,
    "net_in_bps" BIGINT,
    "net_out_bps" BIGINT,
    "block_read_bps" BIGINT,
    "block_write_bps" BIGINT,
    "pids" INTEGER,
    "is_running" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "container_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "metric" VARCHAR(100) NOT NULL,
    "operator" "alert_operator" NOT NULL DEFAULT 'GT',
    "threshold" DECIMAL(12,2) NOT NULL,
    "duration_seconds" INTEGER NOT NULL DEFAULT 60,
    "severity" "alert_severity" NOT NULL DEFAULT 'WARNING',
    "target_filter" JSONB,
    "notification_channel_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "alert_rule_id" UUID NOT NULL,
    "state" "alert_state" NOT NULL DEFAULT 'FIRING',
    "severity" "alert_severity" NOT NULL DEFAULT 'WARNING',
    "target_ref" VARCHAR(150),
    "value" DECIMAL(12,2),
    "message" VARCHAR(500),
    "fired_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "alert_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fim_baseline_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "path" VARCHAR(1000) NOT NULL,
    "event_type" "fim_event_type" NOT NULL,
    "detection_source" "fim_detection_source" NOT NULL DEFAULT 'SCHEDULED',
    "baseline_version" INTEGER NOT NULL DEFAULT 1,
    "old_checksum" VARCHAR(64),
    "new_checksum" VARCHAR(64),
    "old_attrs" JSONB,
    "new_attrs" JSONB,
    "size_bytes" BIGINT,
    "detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "fim_baseline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_alert_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID,
    "rule_name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100),
    "severity" "security_severity" NOT NULL DEFAULT 'MEDIUM',
    "mitre_tactic" VARCHAR(100),
    "mitre_technique" VARCHAR(100),
    "source_ip" INET,
    "payload" JSONB,
    "detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged_by_user_id" UUID,
    "acknowledged_at" TIMESTAMPTZ(3),

    CONSTRAINT "security_alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "cve_id" VARCHAR(20) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "severity" "security_severity" NOT NULL DEFAULT 'MEDIUM',
    "cvss_score" DECIMAL(3,1),
    "version_installed" VARCHAR(150),
    "version_fixed" VARCHAR(150),
    "status" "vulnerability_status" NOT NULL DEFAULT 'OPEN',
    "source_feed" VARCHAR(100),
    "first_detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "vulnerability_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_check_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "benchmark" VARCHAR(100) NOT NULL,
    "check_id" VARCHAR(50) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "status" "compliance_status" NOT NULL DEFAULT 'FAIL',
    "severity" "security_severity" NOT NULL DEFAULT 'MEDIUM',
    "evidence" JSONB,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_check_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_access_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "mfa_required" BOOLEAN NOT NULL DEFAULT true,
    "step_up_window_minutes" INTEGER NOT NULL DEFAULT 15,
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "ticket_required" BOOLEAN NOT NULL DEFAULT false,
    "command_filter" JSONB,
    "allowed_source_cidrs" INET[] DEFAULT ARRAY[]::INET[],
    "max_session_minutes" INTEGER NOT NULL DEFAULT 120,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pam_access_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_vault_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "policy_id" UUID,
    "label" VARCHAR(150) NOT NULL,
    "account_type" "pam_account_type" NOT NULL DEFAULT 'SSH_PASSWORD',
    "username" VARCHAR(150) NOT NULL,
    "secret_encrypted" BYTEA NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pam_vault_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_session_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "policy_id" UUID,
    "requested_by_user_id" UUID,
    "status" "pam_session_status" NOT NULL DEFAULT 'REQUESTED',
    "source_ip" INET,
    "ws_ticket_hash" VARCHAR(255),
    "command_count" INTEGER NOT NULL DEFAULT 0,
    "recording_object_key" VARCHAR(500),
    "denied_reason" VARCHAR(300),
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "category" "file_asset_category" NOT NULL DEFAULT 'ATTACHMENT',
    "bucket" VARCHAR(100) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(150),
    "size_bytes" BIGINT NOT NULL,
    "sha256" VARCHAR(64),
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE INDEX "companies_is_active_idx" ON "companies"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_last_hris_sync_at_idx" ON "users"("last_hris_sync_at");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_active_company_id_idx" ON "user_sessions"("active_company_id");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "policies_name_key" ON "policies"("name");

-- CreateIndex
CREATE INDEX "role_policies_policy_id_idx" ON "role_policies"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_policies_role_id_policy_id_key" ON "role_policies"("role_id", "policy_id");

-- CreateIndex
CREATE INDEX "permissions_collection_action_idx" ON "permissions"("collection", "action");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_policy_id_collection_action_key" ON "permissions"("policy_id", "collection", "action");

-- CreateIndex
CREATE INDEX "user_company_access_company_id_idx" ON "user_company_access"("company_id");

-- CreateIndex
CREATE INDEX "user_company_access_role_id_idx" ON "user_company_access"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_company_access_user_id_company_id_role_id_key" ON "user_company_access"("user_id", "company_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_modules_code_key" ON "menu_modules"("code");

-- CreateIndex
CREATE INDEX "menu_modules_parent_id_idx" ON "menu_modules"("parent_id");

-- CreateIndex
CREATE INDEX "menu_modules_is_active_sort_order_idx" ON "menu_modules"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "company_menu_privileges_role_id_idx" ON "company_menu_privileges"("role_id");

-- CreateIndex
CREATE INDEX "company_menu_privileges_menu_id_idx" ON "company_menu_privileges"("menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_menu_privileges_company_id_role_id_menu_id_key" ON "company_menu_privileges"("company_id", "role_id", "menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_meta_collection_key" ON "collection_meta"("collection");

-- CreateIndex
CREATE INDEX "collection_meta_is_hidden_idx" ON "collection_meta"("is_hidden");

-- CreateIndex
CREATE UNIQUE INDEX "field_meta_collection_id_field_key" ON "field_meta"("collection_id", "field");

-- CreateIndex
CREATE INDEX "relation_meta_related_collection_id_idx" ON "relation_meta"("related_collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "relation_meta_collection_id_field_key" ON "relation_meta"("collection_id", "field");

-- CreateIndex
CREATE INDEX "activity_logs_company_id_created_at_idx" ON "activity_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_entity_type_entity_id_idx" ON "activity_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");

-- CreateIndex
CREATE INDEX "webhook_flows_company_id_is_active_idx" ON "webhook_flows"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "webhook_flows_trigger_event_idx" ON "webhook_flows"("trigger_event");

-- CreateIndex
CREATE INDEX "notification_channels_company_id_is_active_idx" ON "notification_channels"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channels_company_id_type_key" ON "notification_channels"("company_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "agent_enrollment_tokens_token_hash_key" ON "agent_enrollment_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "agent_enrollment_tokens_company_id_idx" ON "agent_enrollment_tokens"("company_id");

-- CreateIndex
CREATE INDEX "agent_enrollment_tokens_expires_at_idx" ON "agent_enrollment_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "departments_company_id_is_active_idx" ON "departments"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "departments_company_id_name_key" ON "departments"("company_id", "name");

-- CreateIndex
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");

-- CreateIndex
CREATE INDEX "locations_company_id_is_active_idx" ON "locations"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "locations_company_id_name_key" ON "locations"("company_id", "name");

-- CreateIndex
CREATE INDEX "categories_company_id_type_idx" ON "categories"("company_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "categories_company_id_type_name_key" ON "categories"("company_id", "type", "name");

-- CreateIndex
CREATE INDEX "manufacturers_company_id_is_active_idx" ON "manufacturers"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_company_id_name_key" ON "manufacturers"("company_id", "name");

-- CreateIndex
CREATE INDEX "suppliers_company_id_is_active_idx" ON "suppliers"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_name_key" ON "suppliers"("company_id", "name");

-- CreateIndex
CREATE INDEX "status_labels_company_id_type_idx" ON "status_labels"("company_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "status_labels_company_id_name_key" ON "status_labels"("company_id", "name");

-- CreateIndex
CREATE INDEX "asset_models_category_id_idx" ON "asset_models"("category_id");

-- CreateIndex
CREATE INDEX "asset_models_manufacturer_id_idx" ON "asset_models"("manufacturer_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_models_company_id_name_key" ON "asset_models"("company_id", "name");

-- CreateIndex
CREATE INDEX "assets_company_id_node_type_idx" ON "assets"("company_id", "node_type");

-- CreateIndex
CREATE INDEX "assets_company_id_status_idx" ON "assets"("company_id", "status");

-- CreateIndex
CREATE INDEX "assets_asset_model_id_idx" ON "assets"("asset_model_id");

-- CreateIndex
CREATE INDEX "assets_status_label_id_idx" ON "assets"("status_label_id");

-- CreateIndex
CREATE INDEX "assets_site_id_idx" ON "assets"("site_id");

-- CreateIndex
CREATE INDEX "assets_department_id_idx" ON "assets"("department_id");

-- CreateIndex
CREATE INDEX "assets_location_id_idx" ON "assets"("location_id");

-- CreateIndex
CREATE INDEX "assets_assigned_to_user_id_idx" ON "assets"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "assets_last_seen_at_idx" ON "assets"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "assets_company_id_asset_tag_key" ON "assets"("company_id", "asset_tag");

-- CreateIndex
CREATE INDEX "asset_checkout_logs_asset_id_created_at_idx" ON "asset_checkout_logs"("asset_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "asset_checkout_logs_company_id_created_at_idx" ON "asset_checkout_logs"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "asset_checkout_logs_target_user_id_idx" ON "asset_checkout_logs"("target_user_id");

-- CreateIndex
CREATE INDEX "asset_checkout_logs_expected_checkin_at_idx" ON "asset_checkout_logs"("expected_checkin_at");

-- CreateIndex
CREATE INDEX "software_licenses_company_id_expiry_date_idx" ON "software_licenses"("company_id", "expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "software_licenses_company_id_name_key" ON "software_licenses"("company_id", "name");

-- CreateIndex
CREATE INDEX "license_seats_company_id_idx" ON "license_seats"("company_id");

-- CreateIndex
CREATE INDEX "license_seats_assigned_user_id_idx" ON "license_seats"("assigned_user_id");

-- CreateIndex
CREATE INDEX "license_seats_assigned_asset_id_idx" ON "license_seats"("assigned_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "license_seats_license_id_seat_number_key" ON "license_seats"("license_id", "seat_number");

-- CreateIndex
CREATE INDEX "hardware_inventory_snapshots_asset_id_collected_at_idx" ON "hardware_inventory_snapshots"("asset_id", "collected_at" DESC);

-- CreateIndex
CREATE INDEX "hardware_inventory_snapshots_company_id_collected_at_idx" ON "hardware_inventory_snapshots"("company_id", "collected_at" DESC);

-- CreateIndex
CREATE INDEX "tickets_company_id_status_idx" ON "tickets"("company_id", "status");

-- CreateIndex
CREATE INDEX "tickets_company_id_opened_at_idx" ON "tickets"("company_id", "opened_at" DESC);

-- CreateIndex
CREATE INDEX "tickets_assignee_user_id_idx" ON "tickets"("assignee_user_id");

-- CreateIndex
CREATE INDEX "tickets_asset_id_idx" ON "tickets"("asset_id");

-- CreateIndex
CREATE INDEX "tickets_due_at_idx" ON "tickets"("due_at");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_company_id_code_key" ON "tickets"("company_id", "code");

-- CreateIndex
CREATE INDEX "ticket_followups_ticket_id_created_at_idx" ON "ticket_followups"("ticket_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ticket_followups_company_id_created_at_idx" ON "ticket_followups"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sites_company_id_is_active_idx" ON "sites"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "sites_company_id_name_key" ON "sites"("company_id", "name");

-- CreateIndex
CREATE INDEX "racks_site_id_idx" ON "racks"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "racks_company_id_site_id_name_key" ON "racks"("company_id", "site_id", "name");

-- CreateIndex
CREATE INDEX "rack_unit_allocations_asset_id_idx" ON "rack_unit_allocations"("asset_id");

-- CreateIndex
CREATE INDEX "rack_unit_allocations_company_id_idx" ON "rack_unit_allocations"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "rack_unit_allocations_rack_id_unit_number_face_key" ON "rack_unit_allocations"("rack_id", "unit_number", "face");

-- CreateIndex
CREATE INDEX "device_interfaces_company_id_asset_id_idx" ON "device_interfaces"("company_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_interfaces_asset_id_name_key" ON "device_interfaces"("asset_id", "name");

-- CreateIndex
CREATE INDEX "cable_connections_company_id_status_idx" ON "cable_connections"("company_id", "status");

-- CreateIndex
CREATE INDEX "cable_connections_port_a_id_idx" ON "cable_connections"("port_a_id");

-- CreateIndex
CREATE INDEX "cable_connections_port_b_id_idx" ON "cable_connections"("port_b_id");

-- CreateIndex
CREATE INDEX "vlans_company_id_site_id_idx" ON "vlans"("company_id", "site_id");

-- CreateIndex
CREATE UNIQUE INDEX "vlans_company_id_vid_key" ON "vlans"("company_id", "vid");

-- CreateIndex
CREATE INDEX "ip_prefixes_site_id_idx" ON "ip_prefixes"("site_id");

-- CreateIndex
CREATE INDEX "ip_prefixes_vlan_id_idx" ON "ip_prefixes"("vlan_id");

-- CreateIndex
CREATE UNIQUE INDEX "ip_prefixes_company_id_prefix_key" ON "ip_prefixes"("company_id", "prefix");

-- CreateIndex
CREATE INDEX "ip_addresses_prefix_id_idx" ON "ip_addresses"("prefix_id");

-- CreateIndex
CREATE INDEX "ip_addresses_interface_id_idx" ON "ip_addresses"("interface_id");

-- CreateIndex
CREATE INDEX "ip_addresses_status_idx" ON "ip_addresses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ip_addresses_company_id_address_key" ON "ip_addresses"("company_id", "address");

-- CreateIndex
CREATE INDEX "snmp_device_profiles_company_id_is_active_idx" ON "snmp_device_profiles"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "snmp_device_profiles_last_polled_at_idx" ON "snmp_device_profiles"("last_polled_at");

-- CreateIndex
CREATE UNIQUE INDEX "snmp_device_profiles_asset_id_key" ON "snmp_device_profiles"("asset_id");

-- CreateIndex
CREATE INDEX "interface_metric_snapshots_interface_id_collected_at_idx" ON "interface_metric_snapshots"("interface_id", "collected_at" DESC);

-- CreateIndex
CREATE INDEX "interface_metric_snapshots_company_id_collected_at_idx" ON "interface_metric_snapshots"("company_id", "collected_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uptime_monitors_push_token_hash_key" ON "uptime_monitors"("push_token_hash");

-- CreateIndex
CREATE INDEX "uptime_monitors_company_id_is_active_idx" ON "uptime_monitors"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "uptime_monitors_asset_id_idx" ON "uptime_monitors"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "uptime_monitors_company_id_name_key" ON "uptime_monitors"("company_id", "name");

-- CreateIndex
CREATE INDEX "uptime_heartbeats_monitor_id_recorded_at_idx" ON "uptime_heartbeats"("monitor_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "uptime_heartbeats_company_id_recorded_at_idx" ON "uptime_heartbeats"("company_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "status_pages_is_published_idx" ON "status_pages"("is_published");

-- CreateIndex
CREATE UNIQUE INDEX "status_pages_company_id_slug_key" ON "status_pages"("company_id", "slug");

-- CreateIndex
CREATE INDEX "status_page_monitors_monitor_id_idx" ON "status_page_monitors"("monitor_id");

-- CreateIndex
CREATE INDEX "status_page_monitors_company_id_idx" ON "status_page_monitors"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "status_page_monitors_status_page_id_monitor_id_key" ON "status_page_monitors"("status_page_id", "monitor_id");

-- CreateIndex
CREATE INDEX "nginx_nodes_company_id_is_active_idx" ON "nginx_nodes"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "nginx_nodes_asset_id_idx" ON "nginx_nodes"("asset_id");

-- CreateIndex
CREATE INDEX "nginx_nodes_status_idx" ON "nginx_nodes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "nginx_nodes_company_id_name_key" ON "nginx_nodes"("company_id", "name");

-- CreateIndex
CREATE INDEX "nginx_virtual_hosts_company_id_status_idx" ON "nginx_virtual_hosts"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "nginx_virtual_hosts_nginx_node_id_server_name_listen_port_key" ON "nginx_virtual_hosts"("nginx_node_id", "server_name", "listen_port");

-- CreateIndex
CREATE INDEX "docker_hosts_company_id_is_active_idx" ON "docker_hosts"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "docker_hosts_asset_id_idx" ON "docker_hosts"("asset_id");

-- CreateIndex
CREATE INDEX "docker_hosts_status_idx" ON "docker_hosts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "docker_hosts_company_id_name_key" ON "docker_hosts"("company_id", "name");

-- CreateIndex
CREATE INDEX "compose_stacks_company_id_drift_status_idx" ON "compose_stacks"("company_id", "drift_status");

-- CreateIndex
CREATE UNIQUE INDEX "compose_stacks_docker_host_id_name_key" ON "compose_stacks"("docker_host_id", "name");

-- CreateIndex
CREATE INDEX "system_metric_snapshots_company_id_host_id_recorded_at_idx" ON "system_metric_snapshots"("company_id", "host_id", "recorded_at");

-- CreateIndex
CREATE INDEX "system_metric_snapshots_host_id_recorded_at_idx" ON "system_metric_snapshots"("host_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "system_metric_snapshots_recorded_at_idx" ON "system_metric_snapshots"("recorded_at");

-- CreateIndex
CREATE INDEX "container_metric_snapshots_company_id_host_id_recorded_at_idx" ON "container_metric_snapshots"("company_id", "host_id", "recorded_at");

-- CreateIndex
CREATE INDEX "container_metric_snapshots_host_id_recorded_at_idx" ON "container_metric_snapshots"("host_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "container_metric_snapshots_container_ref_recorded_at_idx" ON "container_metric_snapshots"("container_ref", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "container_metric_snapshots_recorded_at_idx" ON "container_metric_snapshots"("recorded_at");

-- CreateIndex
CREATE INDEX "alert_rules_company_id_is_active_idx" ON "alert_rules"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "alert_rules_notification_channel_id_idx" ON "alert_rules"("notification_channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rules_company_id_name_key" ON "alert_rules"("company_id", "name");

-- CreateIndex
CREATE INDEX "alert_histories_alert_rule_id_fired_at_idx" ON "alert_histories"("alert_rule_id", "fired_at" DESC);

-- CreateIndex
CREATE INDEX "alert_histories_company_id_fired_at_idx" ON "alert_histories"("company_id", "fired_at" DESC);

-- CreateIndex
CREATE INDEX "alert_histories_resolved_at_idx" ON "alert_histories"("resolved_at");

-- CreateIndex
CREATE INDEX "fim_baseline_events_company_id_asset_id_detected_at_idx" ON "fim_baseline_events"("company_id", "asset_id", "detected_at" DESC);

-- CreateIndex
CREATE INDEX "fim_baseline_events_asset_id_path_detected_at_idx" ON "fim_baseline_events"("asset_id", "path", "detected_at" DESC);

-- CreateIndex
CREATE INDEX "fim_baseline_events_is_resolved_idx" ON "fim_baseline_events"("is_resolved");

-- CreateIndex
CREATE INDEX "fim_baseline_events_detected_at_idx" ON "fim_baseline_events"("detected_at");

-- CreateIndex
CREATE INDEX "security_alert_events_company_id_detected_at_idx" ON "security_alert_events"("company_id", "detected_at" DESC);

-- CreateIndex
CREATE INDEX "security_alert_events_asset_id_detected_at_idx" ON "security_alert_events"("asset_id", "detected_at" DESC);

-- CreateIndex
CREATE INDEX "security_alert_events_severity_idx" ON "security_alert_events"("severity");

-- CreateIndex
CREATE INDEX "security_alert_events_is_acknowledged_idx" ON "security_alert_events"("is_acknowledged");

-- CreateIndex
CREATE INDEX "security_alert_events_detected_at_idx" ON "security_alert_events"("detected_at");

-- CreateIndex
CREATE INDEX "vulnerability_findings_company_id_status_idx" ON "vulnerability_findings"("company_id", "status");

-- CreateIndex
CREATE INDEX "vulnerability_findings_company_id_severity_idx" ON "vulnerability_findings"("company_id", "severity");

-- CreateIndex
CREATE INDEX "vulnerability_findings_last_detected_at_idx" ON "vulnerability_findings"("last_detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "vulnerability_findings_asset_id_cve_id_key" ON "vulnerability_findings"("asset_id", "cve_id");

-- CreateIndex
CREATE INDEX "compliance_check_results_company_id_asset_id_checked_at_idx" ON "compliance_check_results"("company_id", "asset_id", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "compliance_check_results_company_id_status_idx" ON "compliance_check_results"("company_id", "status");

-- CreateIndex
CREATE INDEX "compliance_check_results_checked_at_idx" ON "compliance_check_results"("checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_check_results_asset_id_benchmark_check_id_checke_key" ON "compliance_check_results"("asset_id", "benchmark", "check_id", "checked_at");

-- CreateIndex
CREATE INDEX "pam_access_policies_company_id_is_active_idx" ON "pam_access_policies"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "pam_access_policies_company_id_name_key" ON "pam_access_policies"("company_id", "name");

-- CreateIndex
CREATE INDEX "pam_vault_accounts_company_id_is_active_idx" ON "pam_vault_accounts"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "pam_vault_accounts_policy_id_idx" ON "pam_vault_accounts"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "pam_vault_accounts_asset_id_username_key" ON "pam_vault_accounts"("asset_id", "username");

-- CreateIndex
CREATE INDEX "pam_session_logs_company_id_created_at_idx" ON "pam_session_logs"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pam_session_logs_account_id_started_at_idx" ON "pam_session_logs"("account_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "pam_session_logs_requested_by_user_id_idx" ON "pam_session_logs"("requested_by_user_id");

-- CreateIndex
CREATE INDEX "pam_session_logs_status_idx" ON "pam_session_logs"("status");

-- CreateIndex
CREATE INDEX "file_assets_company_id_category_created_at_idx" ON "file_assets"("company_id", "category", "created_at" DESC);

-- CreateIndex
CREATE INDEX "file_assets_uploaded_by_user_id_idx" ON "file_assets"("uploaded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_bucket_object_key_key" ON "file_assets"("bucket", "object_key");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_active_company_id_fkey" FOREIGN KEY ("active_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_policies" ADD CONSTRAINT "role_policies_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_policies" ADD CONSTRAINT "role_policies_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_modules" ADD CONSTRAINT "menu_modules_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menu_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_menu_privileges" ADD CONSTRAINT "company_menu_privileges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_menu_privileges" ADD CONSTRAINT "company_menu_privileges_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_menu_privileges" ADD CONSTRAINT "company_menu_privileges_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menu_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_meta" ADD CONSTRAINT "field_meta_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collection_meta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relation_meta" ADD CONSTRAINT "relation_meta_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collection_meta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relation_meta" ADD CONSTRAINT "relation_meta_related_collection_id_fkey" FOREIGN KEY ("related_collection_id") REFERENCES "collection_meta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_flows" ADD CONSTRAINT "webhook_flows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_enrollment_tokens" ADD CONSTRAINT "agent_enrollment_tokens_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_labels" ADD CONSTRAINT "status_labels_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_model_id_fkey" FOREIGN KEY ("asset_model_id") REFERENCES "asset_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_status_label_id_fkey" FOREIGN KEY ("status_label_id") REFERENCES "status_labels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_checkout_logs" ADD CONSTRAINT "asset_checkout_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_checkout_logs" ADD CONSTRAINT "asset_checkout_logs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_checkout_logs" ADD CONSTRAINT "asset_checkout_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_checkout_logs" ADD CONSTRAINT "asset_checkout_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_checkout_logs" ADD CONSTRAINT "asset_checkout_logs_target_location_id_fkey" FOREIGN KEY ("target_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_licenses" ADD CONSTRAINT "software_licenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_licenses" ADD CONSTRAINT "software_licenses_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_licenses" ADD CONSTRAINT "software_licenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seats_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seats_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "software_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seats_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seats_assigned_asset_id_fkey" FOREIGN KEY ("assigned_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_inventory_snapshots" ADD CONSTRAINT "hardware_inventory_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_inventory_snapshots" ADD CONSTRAINT "hardware_inventory_snapshots_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_followups" ADD CONSTRAINT "ticket_followups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_followups" ADD CONSTRAINT "ticket_followups_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_followups" ADD CONSTRAINT "ticket_followups_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rack_unit_allocations" ADD CONSTRAINT "rack_unit_allocations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rack_unit_allocations" ADD CONSTRAINT "rack_unit_allocations_rack_id_fkey" FOREIGN KEY ("rack_id") REFERENCES "racks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rack_unit_allocations" ADD CONSTRAINT "rack_unit_allocations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_interfaces" ADD CONSTRAINT "device_interfaces_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_interfaces" ADD CONSTRAINT "device_interfaces_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_connections" ADD CONSTRAINT "cable_connections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_connections" ADD CONSTRAINT "cable_connections_port_a_id_fkey" FOREIGN KEY ("port_a_id") REFERENCES "device_interfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_connections" ADD CONSTRAINT "cable_connections_port_b_id_fkey" FOREIGN KEY ("port_b_id") REFERENCES "device_interfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_prefixes" ADD CONSTRAINT "ip_prefixes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_prefixes" ADD CONSTRAINT "ip_prefixes_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_prefixes" ADD CONSTRAINT "ip_prefixes_vlan_id_fkey" FOREIGN KEY ("vlan_id") REFERENCES "vlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_prefix_id_fkey" FOREIGN KEY ("prefix_id") REFERENCES "ip_prefixes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_interface_id_fkey" FOREIGN KEY ("interface_id") REFERENCES "device_interfaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snmp_device_profiles" ADD CONSTRAINT "snmp_device_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snmp_device_profiles" ADD CONSTRAINT "snmp_device_profiles_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interface_metric_snapshots" ADD CONSTRAINT "interface_metric_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interface_metric_snapshots" ADD CONSTRAINT "interface_metric_snapshots_interface_id_fkey" FOREIGN KEY ("interface_id") REFERENCES "device_interfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uptime_heartbeats" ADD CONSTRAINT "uptime_heartbeats_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uptime_heartbeats" ADD CONSTRAINT "uptime_heartbeats_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "uptime_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_pages" ADD CONSTRAINT "status_pages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_status_page_id_fkey" FOREIGN KEY ("status_page_id") REFERENCES "status_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "uptime_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nginx_nodes" ADD CONSTRAINT "nginx_nodes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nginx_nodes" ADD CONSTRAINT "nginx_nodes_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nginx_virtual_hosts" ADD CONSTRAINT "nginx_virtual_hosts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nginx_virtual_hosts" ADD CONSTRAINT "nginx_virtual_hosts_nginx_node_id_fkey" FOREIGN KEY ("nginx_node_id") REFERENCES "nginx_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docker_hosts" ADD CONSTRAINT "docker_hosts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docker_hosts" ADD CONSTRAINT "docker_hosts_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compose_stacks" ADD CONSTRAINT "compose_stacks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compose_stacks" ADD CONSTRAINT "compose_stacks_docker_host_id_fkey" FOREIGN KEY ("docker_host_id") REFERENCES "docker_hosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_metric_snapshots" ADD CONSTRAINT "system_metric_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_metric_snapshots" ADD CONSTRAINT "system_metric_snapshots_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_metric_snapshots" ADD CONSTRAINT "container_metric_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_metric_snapshots" ADD CONSTRAINT "container_metric_snapshots_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "docker_hosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_notification_channel_id_fkey" FOREIGN KEY ("notification_channel_id") REFERENCES "notification_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_histories" ADD CONSTRAINT "alert_histories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_histories" ADD CONSTRAINT "alert_histories_alert_rule_id_fkey" FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fim_baseline_events" ADD CONSTRAINT "fim_baseline_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fim_baseline_events" ADD CONSTRAINT "fim_baseline_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fim_baseline_events" ADD CONSTRAINT "fim_baseline_events_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_alert_events" ADD CONSTRAINT "security_alert_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_alert_events" ADD CONSTRAINT "security_alert_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_alert_events" ADD CONSTRAINT "security_alert_events_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerability_findings" ADD CONSTRAINT "vulnerability_findings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerability_findings" ADD CONSTRAINT "vulnerability_findings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_check_results" ADD CONSTRAINT "compliance_check_results_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_check_results" ADD CONSTRAINT "compliance_check_results_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam_access_policies" ADD CONSTRAINT "pam_access_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam_vault_accounts" ADD CONSTRAINT "pam_vault_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam_vault_accounts" ADD CONSTRAINT "pam_vault_accounts_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam_vault_accounts" ADD CONSTRAINT "pam_vault_accounts_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "pam_access_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam_session_logs" ADD CONSTRAINT "pam_session_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam_session_logs" ADD CONSTRAINT "pam_session_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "pam_vault_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam_session_logs" ADD CONSTRAINT "pam_session_logs_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "pam_access_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam_session_logs" ADD CONSTRAINT "pam_session_logs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
