-- CreateTable
CREATE TABLE "amm_department" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_status_type" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_status_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_status_label" (
    "id" TEXT NOT NULL,
    "type_id" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_status_label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_supplier" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_contract" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "supplier_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "value" DECIMAL(18,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_contract_asset" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_contract_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_license" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "software_id" TEXT,
    "name" TEXT NOT NULL,
    "license_key_enc" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_license_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_license_seat" (
    "id" TEXT NOT NULL,
    "license_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "user_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_license_seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_software" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "version" TEXT,
    "publisher" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_software_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_maintenance" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "asset_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PREVENTIVE',
    "title" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "cost" DECIMAL(18,2),
    "vendor" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_asset_assignment" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "asset_id" TEXT NOT NULL,
    "user_id" TEXT,
    "area_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_asset_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_asset_relation" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "related_id" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'CONNECT_TO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_asset_relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_custom_field" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "entity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL DEFAULT 'TEXT',
    "options" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_custom_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_custom_value" (
    "id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_custom_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_fieldset" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_fieldset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_fieldset_field" (
    "id" TEXT NOT NULL,
    "fieldset_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL DEFAULT 'TEXT',
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_fieldset_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_fieldset_binding" (
    "id" TEXT NOT NULL,
    "fieldset_id" TEXT NOT NULL,
    "asset_type_id" TEXT,
    "asset_model_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_fieldset_binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_asset_audit" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_asset_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_audit_item" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "expected_location" TEXT,
    "found_location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_audit_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_depreciation" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "asset_id" TEXT,
    "method" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "purchase_cost" DECIMAL(18,2),
    "salvage_value" DECIMAL(18,2),
    "useful_life_months" INTEGER,
    "start_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_depreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_consumable" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "min_qty" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_consumable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_consumable_txn" (
    "id" TEXT NOT NULL,
    "consumable_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OUT',
    "qty" INTEGER NOT NULL,
    "user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_consumable_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_accessory" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "min_qty" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_accessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_accessory_assignment" (
    "id" TEXT NOT NULL,
    "accessory_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "user_id" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_accessory_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_accessory_txn" (
    "id" TEXT NOT NULL,
    "accessory_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OUT',
    "qty" INTEGER NOT NULL,
    "user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_accessory_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_component" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "min_qty" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_component_assignment" (
    "id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_component_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_kit" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_kit_item" (
    "id" TEXT NOT NULL,
    "kit_id" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_kit_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_kit_checkout" (
    "id" TEXT NOT NULL,
    "kit_id" TEXT NOT NULL,
    "user_id" TEXT,
    "checked_out_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_kit_checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_reservation" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "asset_id" TEXT NOT NULL,
    "user_id" TEXT,
    "reserved_from" TIMESTAMP(3) NOT NULL,
    "reserved_until" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_asset_request" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "requester_id" TEXT,
    "asset_type_id" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_asset_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_eula" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_eula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_eula_acceptance" (
    "id" TEXT NOT NULL,
    "eula_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_eula_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_api_token" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" JSONB,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_api_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_api_log" (
    "id" TEXT NOT NULL,
    "token_id" TEXT,
    "method" TEXT,
    "path" TEXT,
    "status" INTEGER,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_api_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_company_setting" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_company_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_employee" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "user_id" TEXT,
    "reg_no" TEXT,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "position" TEXT,
    "area_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_vlan" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT,
    "vlan_id" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_vlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_ip_address" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT,
    "interface" TEXT,
    "ip_address" TEXT NOT NULL,
    "prefix" INTEGER,
    "vlan_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_ip_address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_interface_stat" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "if_index" INTEGER,
    "name" TEXT,
    "in_octets" BIGINT,
    "out_octets" BIGINT,
    "in_errors" BIGINT,
    "out_errors" BIGINT,
    "speed_mbps" INTEGER,
    "admin_status" TEXT,
    "oper_status" TEXT,
    "in_ucast_pkts" BIGINT,
    "out_ucast_pkts" BIGINT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_interface_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_interface_stat_rollup" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "if_index" INTEGER,
    "bucket" TIMESTAMP(3) NOT NULL,
    "in_octets" BIGINT,
    "out_octets" BIGINT,
    "in_errors" BIGINT,
    "out_errors" BIGINT,
    "in_peak_bps" BIGINT,
    "out_peak_bps" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_interface_stat_rollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_sensor" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEMPERATURE',
    "oid" TEXT,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "warn_high" DOUBLE PRECISION,
    "warn_low" DOUBLE PRECISION,
    "low_warn" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_sensor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_sensor_stat_rollup" (
    "id" TEXT NOT NULL,
    "sensor_id" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "min_value" DOUBLE PRECISION,
    "max_value" DOUBLE PRECISION,
    "avg_value" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_sensor_stat_rollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_custom_oid" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT,
    "name" TEXT NOT NULL,
    "oid" TEXT NOT NULL,
    "kind" TEXT,
    "unit" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_custom_oid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_topology_link" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_a_id" TEXT NOT NULL,
    "device_b_id" TEXT,
    "local_if" TEXT,
    "remote_if" TEXT,
    "protocol" TEXT NOT NULL DEFAULT 'LLDP',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_topology_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_availability" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UP',
    "down_reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_ping_result" (
    "id" TEXT NOT NULL,
    "device_id" TEXT,
    "target" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "rtt_ms" DOUBLE PRECISION,
    "packet_loss" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_ping_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_alert_rule_binding" (
    "id" TEXT NOT NULL,
    "alert_rule_id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_alert_rule_binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_alert" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "rule_id" TEXT,
    "device_id" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "acked_by" TEXT,
    "acked_at" TIMESTAMP(3),
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_maintenance_window" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "scope" JSONB,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_maintenance_window_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_billing" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT,
    "interface" TEXT,
    "period" TEXT NOT NULL,
    "in_95pct_bps" BIGINT,
    "out_95pct_bps" BIGINT,
    "total_gb" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_entity_physical" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "ent_index" INTEGER,
    "name" TEXT,
    "class" TEXT,
    "descr" TEXT,
    "vendor" TEXT,
    "model" TEXT,
    "serial" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_entity_physical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_config_revision" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "backup_id" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "content_hash" TEXT,
    "message" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_config_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_firewall_event" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT,
    "action" TEXT,
    "src_addr" TEXT,
    "dst_addr" TEXT,
    "protocol" TEXT,
    "dst_port" TEXT,
    "rule_ref" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_firewall_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_discovery" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "subnet_id" TEXT,
    "method" TEXT NOT NULL DEFAULT 'SNMP',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "found" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_discovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_api_token" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" JSONB,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_api_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_blocklist" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_blocklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_block_entry" (
    "id" TEXT NOT NULL,
    "blocklist_id" TEXT NOT NULL,
    "ip" TEXT,
    "mac" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_block_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_script" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "content" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_address_list_entry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT,
    "list_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_address_list_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_metric_rollup" (
    "id" TEXT NOT NULL,
    "system_id" TEXT,
    "metric" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "min_value" DOUBLE PRECISION,
    "max_value" DOUBLE PRECISION,
    "avg_value" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_metric_rollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_disk" (
    "id" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "mount" TEXT,
    "device" TEXT,
    "fs_type" TEXT,
    "total_gb" DOUBLE PRECISION,
    "used_gb" DOUBLE PRECISION,
    "health" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_disk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_container_stat" (
    "id" TEXT NOT NULL,
    "system_id" TEXT,
    "container_id" TEXT,
    "name" TEXT,
    "cpu_pct" DOUBLE PRECISION,
    "mem_mb" DOUBLE PRECISION,
    "net_rx" BIGINT,
    "net_tx" BIGINT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_container_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_vmhost" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "hypervisor" TEXT,
    "endpoint" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_vmhost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_vm" (
    "id" TEXT NOT NULL,
    "host_id" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_vm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_vm_stat" (
    "id" TEXT NOT NULL,
    "vm_id" TEXT NOT NULL,
    "cpu_pct" DOUBLE PRECISION,
    "mem_mb" DOUBLE PRECISION,
    "disk_gb" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_vm_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_service" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SYSTEMD',
    "target" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_check_group" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_check_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_alert_rule" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "comparator" TEXT NOT NULL DEFAULT 'GT',
    "threshold" DOUBLE PRECISION NOT NULL,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_alert_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_notification" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "channel_id" TEXT,
    "event" TEXT,
    "target" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_silence" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "rule_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_silence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_dashboard" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "layout" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_report" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "params" JSONB,
    "schedule" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_maintenance" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "scope" JSONB,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_status_page" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "custom_domain" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_status_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_status_page_item" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "check_id" TEXT,
    "group" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_status_page_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_status_page_incident" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INVESTIGATING',
    "impact" TEXT NOT NULL DEFAULT 'NONE',
    "is_announcement" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolves_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_status_page_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obs_import_job" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'UPTIME_KUMA',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stats" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obs_import_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_account_template" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "username" TEXT,
    "auth_type" TEXT NOT NULL DEFAULT 'PASSWORD',
    "secret_enc" TEXT,
    "key_enc" TEXT,
    "passphrase_enc" TEXT,
    "privileged" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_account_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_grant" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "user_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "account_id" TEXT,
    "policy_id" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_command_filter" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'BLACKLIST',
    "patterns" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_command_filter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_command_filter_binding" (
    "id" TEXT NOT NULL,
    "filter_id" TEXT NOT NULL,
    "policy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_command_filter_binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_command" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "output" TEXT,
    "exit_code" INTEGER,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_command_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_approval_flow" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_approvers" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_approval_flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_approval_step" (
    "id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL DEFAULT 1,
    "approver_role_id" TEXT,
    "approver_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_approval_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_access_request" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "user_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "account_id" TEXT,
    "policy_id" TEXT,
    "reason" TEXT,
    "desired_from" TIMESTAMP(3),
    "desired_until" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_access_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_access_request_approval" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "approver_id" TEXT,
    "step_id" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_access_request_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_gateway" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "listen_host" TEXT,
    "listen_port" INTEGER,
    "relay_agent_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_gateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_login_acl" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "ip_cidr" TEXT,
    "allowed_networks" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_login_acl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_lockout" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "user_id" TEXT,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "last_fail_at" TIMESTAMP(3),
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_lockout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_health_check" (
    "id" TEXT NOT NULL,
    "gateway_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "last_check_at" TIMESTAMP(3),
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_health_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_discovery_job" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "found" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_discovery_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_apikey" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" JSONB,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_apikey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam_ticket_provider" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'JIRA',
    "config_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pam_ticket_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_pod" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namespace" TEXT NOT NULL DEFAULT 'default',
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_pod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_action" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "user_id" TEXT,
    "message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_exec_session" (
    "id" TEXT NOT NULL,
    "container_id" TEXT,
    "user_id" TEXT,
    "command" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_exec_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_secret" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "value_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_disk_usage" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT,
    "target" TEXT NOT NULL,
    "total_gb" DOUBLE PRECISION,
    "used_gb" DOUBLE PRECISION,
    "free_gb" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_disk_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_update_check" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT,
    "image" TEXT NOT NULL,
    "current_digest" TEXT,
    "latest_digest" TEXT,
    "update_available" BOOLEAN NOT NULL DEFAULT false,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_update_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_heal_policy" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "target_id" TEXT,
    "condition" JSONB,
    "action" TEXT NOT NULL DEFAULT 'RESTART',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_heal_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_backup_schedule" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "target_id" TEXT,
    "cron" TEXT,
    "retention_days" INTEGER NOT NULL DEFAULT 7,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_backup_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_system_backup" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "engine_id" TEXT,
    "path" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_system_backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_patch" (
    "id" TEXT NOT NULL,
    "image_id" TEXT,
    "scan_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "patched_tag" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_patch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_scan_schedule" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "target" TEXT,
    "cron" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_scan_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_threat_intel" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "cve" TEXT NOT NULL,
    "in_kev" BOOLEAN NOT NULL DEFAULT false,
    "epss" DOUBLE PRECISION,
    "source" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_threat_intel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_registry_repository" (
    "id" TEXT NOT NULL,
    "registry_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_registry_repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_registry_tag" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "digest" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_registry_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_port_binding" (
    "id" TEXT NOT NULL,
    "container_id" TEXT,
    "host_ip" TEXT,
    "host_port" INTEGER NOT NULL,
    "container_port" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'tcp',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_port_binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_gpu" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT,
    "vendor" TEXT,
    "model" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_gpu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_notification_channel" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'WEBHOOK',
    "config_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_notification_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_notification_template" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT,
    "code" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "format" TEXT NOT NULL DEFAULT 'TEXT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_log_setting" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "retention_days" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_log_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_api_key" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" JSONB,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_webhook" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret_enc" TEXT,
    "events" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_template_registry" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_template_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_agent_group" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "agent_conf" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_agent_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_decoder" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_decoder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_event_alert" (
    "id" TEXT NOT NULL,
    "event_id" TEXT,
    "rule_id" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_event_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_incident_event" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_incident_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_fim_event" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "path" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'MODIFIED',
    "checksum" TEXT,
    "user_name" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_fim_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_sca_policy" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_sca_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_sca_result" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT,
    "agent_id" TEXT,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "version" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_sca_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_vuln" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "agent_id" TEXT,
    "cve" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "package" TEXT,
    "installed_version" TEXT,
    "fixed_version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "sec_vuln_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_vuln_feed" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_vuln_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_intel_feed" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'IOC',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_intel_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_intel_ioc" (
    "id" TEXT NOT NULL,
    "feed_id" TEXT,
    "ioc_type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "severity" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_intel_ioc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_rule_feed" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_rule_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_compliance_report" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "standard" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "details" JSONB,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_compliance_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_container_event" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "container_id" TEXT,
    "event_type" TEXT NOT NULL,
    "process_name" TEXT,
    "image" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_container_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_malware_event" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "path" TEXT,
    "signature" TEXT,
    "action" TEXT NOT NULL DEFAULT 'DETECTED',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_malware_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_cdb_list" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_cdb_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_cdb_entry" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_cdb_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_cloud_account" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_cloud_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_cloud_finding" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "resource" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_cloud_finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_forwarder" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SYSLOG',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_forwarder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_log_source" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'AGENT',
    "target" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_log_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_rbac_grant" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "user_id" TEXT,
    "role" TEXT NOT NULL,
    "scopes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_rbac_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_response_action" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "params" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_response_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_response_script" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "content" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_response_script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_live_query" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "query" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_live_query_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_osquery_query" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "schedule" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_osquery_query_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sec_syscollector_hardware" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT,
    "board" TEXT,
    "cpu" TEXT,
    "memory_mb" INTEGER,
    "disks" JSONB,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_syscollector_hardware_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_node" (
    "id" TEXT NOT NULL,
    "cluster_id" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'WORKER',
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_cluster" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quorum_status" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_cluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_storage" (
    "id" TEXT NOT NULL,
    "host_id" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LOCAL',
    "total_gb" DOUBLE PRECISION,
    "used_gb" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_storage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_pool" (
    "id" TEXT NOT NULL,
    "host_id" TEXT,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_nic" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mac" TEXT,
    "ip_address" TEXT,
    "vlan_id" INTEGER,
    "bridge" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_nic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_backup" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "path" TEXT,
    "size_bytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_task" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "target" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_ha" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "node_name" TEXT,
    "state" TEXT NOT NULL DEFAULT 'STOPPED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_ha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_replication" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "target_host_id" TEXT,
    "interval_sec" INTEGER NOT NULL DEFAULT 300,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_replication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_sdn" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'VXLAN',
    "vxlan_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_sdn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_iso" (
    "id" TEXT NOT NULL,
    "host_id" TEXT,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_iso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_template" (
    "id" TEXT NOT NULL,
    "host_id" TEXT,
    "name" TEXT NOT NULL,
    "os_hint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_passthrough" (
    "id" TEXT NOT NULL,
    "host_id" TEXT,
    "guest_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'GPU',
    "device" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_passthrough_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_fw_rule" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "guest_id" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'IN',
    "action" TEXT NOT NULL DEFAULT 'ACCEPT',
    "protocol" TEXT,
    "src" TEXT,
    "dst" TEXT,
    "port" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_fw_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms_security_group" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "rules" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_security_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_access_list" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "rules" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_access_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_access_entry" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "ip_cidr" TEXT,
    "username" TEXT,
    "action" TEXT NOT NULL DEFAULT 'ALLOW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_access_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_access_log" (
    "id" TEXT NOT NULL,
    "vhost_id" TEXT,
    "method" TEXT,
    "path" TEXT,
    "status" INTEGER,
    "bytes" INTEGER,
    "ip" TEXT,
    "user_agent" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_access_stat" (
    "id" TEXT NOT NULL,
    "vhost_id" TEXT,
    "bucket" TIMESTAMP(3) NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "status_2xx" INTEGER NOT NULL DEFAULT 0,
    "status_4xx" INTEGER NOT NULL DEFAULT 0,
    "status_5xx" INTEGER NOT NULL DEFAULT 0,
    "bytes" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_access_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_acme_account" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "ca_url" TEXT DEFAULT 'https://acme-v02.api.letsencrypt.org/directory',
    "key_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_acme_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_dns_provider" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CLOUDFLARE',
    "credentials_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_dns_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_dns_record" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT,
    "domain_id" TEXT,
    "record_type" TEXT NOT NULL DEFAULT 'A',
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "ttl" INTEGER NOT NULL DEFAULT 300,
    "proxied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_dns_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_location" (
    "id" TEXT NOT NULL,
    "vhost_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PROXY',
    "target" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_stream" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "listen_port" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'TCP',
    "target" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_snippet" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "content" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_snippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_template" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_config_revision" (
    "id" TEXT NOT NULL,
    "server_id" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT,
    "content_hash" TEXT,
    "message" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_config_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_change" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "server_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_ref" TEXT,
    "before" JSONB,
    "after" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_deploy" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "server_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_deploy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_backup" (
    "id" TEXT NOT NULL,
    "server_id" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "path" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_server_metric" (
    "id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "cpu_pct" DOUBLE PRECISION,
    "mem_pct" DOUBLE PRECISION,
    "active_conn" INTEGER NOT NULL DEFAULT 0,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_server_metric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "amm_department_company_id_idx" ON "amm_department"("company_id");

-- CreateIndex
CREATE INDEX "amm_status_type_company_id_idx" ON "amm_status_type"("company_id");

-- CreateIndex
CREATE INDEX "amm_status_label_type_id_idx" ON "amm_status_label"("type_id");

-- CreateIndex
CREATE INDEX "amm_supplier_company_id_idx" ON "amm_supplier"("company_id");

-- CreateIndex
CREATE INDEX "amm_contract_company_id_idx" ON "amm_contract"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "amm_contract_company_id_code_key" ON "amm_contract"("company_id", "code");

-- CreateIndex
CREATE INDEX "amm_contract_asset_contract_id_idx" ON "amm_contract_asset"("contract_id");

-- CreateIndex
CREATE INDEX "amm_contract_asset_asset_id_idx" ON "amm_contract_asset"("asset_id");

-- CreateIndex
CREATE INDEX "amm_license_company_id_idx" ON "amm_license"("company_id");

-- CreateIndex
CREATE INDEX "amm_license_seat_license_id_idx" ON "amm_license_seat"("license_id");

-- CreateIndex
CREATE INDEX "amm_software_company_id_idx" ON "amm_software"("company_id");

-- CreateIndex
CREATE INDEX "amm_maintenance_company_id_idx" ON "amm_maintenance"("company_id");

-- CreateIndex
CREATE INDEX "amm_maintenance_asset_id_idx" ON "amm_maintenance"("asset_id");

-- CreateIndex
CREATE INDEX "amm_asset_assignment_company_id_idx" ON "amm_asset_assignment"("company_id");

-- CreateIndex
CREATE INDEX "amm_asset_assignment_asset_id_idx" ON "amm_asset_assignment"("asset_id");

-- CreateIndex
CREATE INDEX "amm_asset_relation_asset_id_idx" ON "amm_asset_relation"("asset_id");

-- CreateIndex
CREATE INDEX "amm_custom_field_company_id_idx" ON "amm_custom_field"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "amm_custom_field_company_id_entity_code_key" ON "amm_custom_field"("company_id", "entity", "code");

-- CreateIndex
CREATE INDEX "amm_custom_value_field_id_idx" ON "amm_custom_value"("field_id");

-- CreateIndex
CREATE INDEX "amm_custom_value_entity_entity_id_idx" ON "amm_custom_value"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "amm_fieldset_company_id_idx" ON "amm_fieldset"("company_id");

-- CreateIndex
CREATE INDEX "amm_fieldset_field_fieldset_id_idx" ON "amm_fieldset_field"("fieldset_id");

-- CreateIndex
CREATE INDEX "amm_fieldset_binding_fieldset_id_idx" ON "amm_fieldset_binding"("fieldset_id");

-- CreateIndex
CREATE INDEX "amm_asset_audit_company_id_idx" ON "amm_asset_audit"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "amm_asset_audit_company_id_code_key" ON "amm_asset_audit"("company_id", "code");

-- CreateIndex
CREATE INDEX "amm_audit_item_audit_id_idx" ON "amm_audit_item"("audit_id");

-- CreateIndex
CREATE INDEX "amm_depreciation_company_id_idx" ON "amm_depreciation"("company_id");

-- CreateIndex
CREATE INDEX "amm_consumable_company_id_idx" ON "amm_consumable"("company_id");

-- CreateIndex
CREATE INDEX "amm_consumable_txn_consumable_id_idx" ON "amm_consumable_txn"("consumable_id");

-- CreateIndex
CREATE INDEX "amm_accessory_company_id_idx" ON "amm_accessory"("company_id");

-- CreateIndex
CREATE INDEX "amm_accessory_assignment_accessory_id_idx" ON "amm_accessory_assignment"("accessory_id");

-- CreateIndex
CREATE INDEX "amm_accessory_txn_accessory_id_idx" ON "amm_accessory_txn"("accessory_id");

-- CreateIndex
CREATE INDEX "amm_component_company_id_idx" ON "amm_component"("company_id");

-- CreateIndex
CREATE INDEX "amm_component_assignment_component_id_idx" ON "amm_component_assignment"("component_id");

-- CreateIndex
CREATE INDEX "amm_kit_company_id_idx" ON "amm_kit"("company_id");

-- CreateIndex
CREATE INDEX "amm_kit_item_kit_id_idx" ON "amm_kit_item"("kit_id");

-- CreateIndex
CREATE INDEX "amm_kit_checkout_kit_id_idx" ON "amm_kit_checkout"("kit_id");

-- CreateIndex
CREATE INDEX "amm_reservation_company_id_idx" ON "amm_reservation"("company_id");

-- CreateIndex
CREATE INDEX "amm_asset_request_company_id_idx" ON "amm_asset_request"("company_id");

-- CreateIndex
CREATE INDEX "amm_eula_company_id_idx" ON "amm_eula"("company_id");

-- CreateIndex
CREATE INDEX "amm_eula_acceptance_eula_id_idx" ON "amm_eula_acceptance"("eula_id");

-- CreateIndex
CREATE UNIQUE INDEX "amm_api_token_token_hash_key" ON "amm_api_token"("token_hash");

-- CreateIndex
CREATE INDEX "amm_api_token_company_id_idx" ON "amm_api_token"("company_id");

-- CreateIndex
CREATE INDEX "amm_api_log_created_at_idx" ON "amm_api_log"("created_at");

-- CreateIndex
CREATE INDEX "app_company_setting_company_id_idx" ON "app_company_setting"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_company_setting_company_id_key_key" ON "app_company_setting"("company_id", "key");

-- CreateIndex
CREATE INDEX "app_employee_company_id_idx" ON "app_employee"("company_id");

-- CreateIndex
CREATE INDEX "app_employee_user_id_idx" ON "app_employee"("user_id");

-- CreateIndex
CREATE INDEX "net_vlan_company_id_idx" ON "net_vlan"("company_id");

-- CreateIndex
CREATE INDEX "net_vlan_device_id_idx" ON "net_vlan"("device_id");

-- CreateIndex
CREATE INDEX "net_ip_address_company_id_idx" ON "net_ip_address"("company_id");

-- CreateIndex
CREATE INDEX "net_ip_address_device_id_idx" ON "net_ip_address"("device_id");

-- CreateIndex
CREATE INDEX "net_interface_stat_device_id_recorded_at_idx" ON "net_interface_stat"("device_id", "recorded_at");

-- CreateIndex
CREATE INDEX "net_interface_stat_rollup_device_id_bucket_idx" ON "net_interface_stat_rollup"("device_id", "bucket");

-- CreateIndex
CREATE INDEX "net_sensor_company_id_idx" ON "net_sensor"("company_id");

-- CreateIndex
CREATE INDEX "net_sensor_device_id_idx" ON "net_sensor"("device_id");

-- CreateIndex
CREATE INDEX "net_sensor_stat_rollup_sensor_id_bucket_idx" ON "net_sensor_stat_rollup"("sensor_id", "bucket");

-- CreateIndex
CREATE INDEX "net_custom_oid_company_id_idx" ON "net_custom_oid"("company_id");

-- CreateIndex
CREATE INDEX "net_topology_link_company_id_idx" ON "net_topology_link"("company_id");

-- CreateIndex
CREATE INDEX "net_availability_company_id_idx" ON "net_availability"("company_id");

-- CreateIndex
CREATE INDEX "net_availability_device_id_idx" ON "net_availability"("device_id");

-- CreateIndex
CREATE INDEX "net_ping_result_device_id_recorded_at_idx" ON "net_ping_result"("device_id", "recorded_at");

-- CreateIndex
CREATE INDEX "net_alert_rule_binding_alert_rule_id_idx" ON "net_alert_rule_binding"("alert_rule_id");

-- CreateIndex
CREATE INDEX "net_alert_company_id_triggered_at_idx" ON "net_alert"("company_id", "triggered_at");

-- CreateIndex
CREATE INDEX "net_maintenance_window_company_id_idx" ON "net_maintenance_window"("company_id");

-- CreateIndex
CREATE INDEX "net_billing_company_id_idx" ON "net_billing"("company_id");

-- CreateIndex
CREATE INDEX "net_entity_physical_device_id_idx" ON "net_entity_physical"("device_id");

-- CreateIndex
CREATE INDEX "net_config_revision_device_id_created_at_idx" ON "net_config_revision"("device_id", "created_at");

-- CreateIndex
CREATE INDEX "net_firewall_event_company_id_logged_at_idx" ON "net_firewall_event"("company_id", "logged_at");

-- CreateIndex
CREATE INDEX "net_discovery_company_id_idx" ON "net_discovery"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "net_api_token_token_hash_key" ON "net_api_token"("token_hash");

-- CreateIndex
CREATE INDEX "net_api_token_company_id_idx" ON "net_api_token"("company_id");

-- CreateIndex
CREATE INDEX "net_blocklist_company_id_idx" ON "net_blocklist"("company_id");

-- CreateIndex
CREATE INDEX "net_block_entry_blocklist_id_idx" ON "net_block_entry"("blocklist_id");

-- CreateIndex
CREATE INDEX "net_script_company_id_idx" ON "net_script"("company_id");

-- CreateIndex
CREATE INDEX "net_address_list_entry_company_id_idx" ON "net_address_list_entry"("company_id");

-- CreateIndex
CREATE INDEX "net_address_list_entry_device_id_idx" ON "net_address_list_entry"("device_id");

-- CreateIndex
CREATE INDEX "obs_metric_rollup_system_id_metric_bucket_idx" ON "obs_metric_rollup"("system_id", "metric", "bucket");

-- CreateIndex
CREATE INDEX "obs_disk_system_id_idx" ON "obs_disk"("system_id");

-- CreateIndex
CREATE INDEX "obs_container_stat_system_id_recorded_at_idx" ON "obs_container_stat"("system_id", "recorded_at");

-- CreateIndex
CREATE INDEX "obs_vmhost_company_id_idx" ON "obs_vmhost"("company_id");

-- CreateIndex
CREATE INDEX "obs_vm_company_id_idx" ON "obs_vm"("company_id");

-- CreateIndex
CREATE INDEX "obs_vm_stat_vm_id_recorded_at_idx" ON "obs_vm_stat"("vm_id", "recorded_at");

-- CreateIndex
CREATE INDEX "obs_service_company_id_idx" ON "obs_service"("company_id");

-- CreateIndex
CREATE INDEX "obs_check_group_company_id_idx" ON "obs_check_group"("company_id");

-- CreateIndex
CREATE INDEX "obs_alert_rule_company_id_idx" ON "obs_alert_rule"("company_id");

-- CreateIndex
CREATE INDEX "obs_notification_company_id_created_at_idx" ON "obs_notification"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "obs_silence_company_id_idx" ON "obs_silence"("company_id");

-- CreateIndex
CREATE INDEX "obs_dashboard_company_id_idx" ON "obs_dashboard"("company_id");

-- CreateIndex
CREATE INDEX "obs_report_company_id_idx" ON "obs_report"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "obs_report_company_id_code_key" ON "obs_report"("company_id", "code");

-- CreateIndex
CREATE INDEX "obs_maintenance_company_id_idx" ON "obs_maintenance"("company_id");

-- CreateIndex
CREATE INDEX "obs_status_page_company_id_idx" ON "obs_status_page"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "obs_status_page_company_id_code_key" ON "obs_status_page"("company_id", "code");

-- CreateIndex
CREATE INDEX "obs_status_page_item_page_id_idx" ON "obs_status_page_item"("page_id");

-- CreateIndex
CREATE INDEX "obs_status_page_incident_page_id_starts_at_idx" ON "obs_status_page_incident"("page_id", "starts_at");

-- CreateIndex
CREATE INDEX "obs_import_job_company_id_idx" ON "obs_import_job"("company_id");

-- CreateIndex
CREATE INDEX "pam_account_template_company_id_idx" ON "pam_account_template"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pam_account_template_company_id_code_key" ON "pam_account_template"("company_id", "code");

-- CreateIndex
CREATE INDEX "pam_grant_company_id_user_id_idx" ON "pam_grant"("company_id", "user_id");

-- CreateIndex
CREATE INDEX "pam_command_filter_company_id_idx" ON "pam_command_filter"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pam_command_filter_company_id_code_key" ON "pam_command_filter"("company_id", "code");

-- CreateIndex
CREATE INDEX "pam_command_filter_binding_filter_id_idx" ON "pam_command_filter_binding"("filter_id");

-- CreateIndex
CREATE INDEX "pam_command_session_id_idx" ON "pam_command"("session_id");

-- CreateIndex
CREATE INDEX "pam_approval_flow_company_id_idx" ON "pam_approval_flow"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pam_approval_flow_company_id_code_key" ON "pam_approval_flow"("company_id", "code");

-- CreateIndex
CREATE INDEX "pam_approval_step_flow_id_idx" ON "pam_approval_step"("flow_id");

-- CreateIndex
CREATE INDEX "pam_access_request_company_id_idx" ON "pam_access_request"("company_id");

-- CreateIndex
CREATE INDEX "pam_access_request_approval_request_id_idx" ON "pam_access_request_approval"("request_id");

-- CreateIndex
CREATE INDEX "pam_gateway_company_id_idx" ON "pam_gateway"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pam_gateway_company_id_code_key" ON "pam_gateway"("company_id", "code");

-- CreateIndex
CREATE INDEX "pam_login_acl_company_id_idx" ON "pam_login_acl"("company_id");

-- CreateIndex
CREATE INDEX "pam_lockout_company_id_idx" ON "pam_lockout"("company_id");

-- CreateIndex
CREATE INDEX "pam_health_check_gateway_id_idx" ON "pam_health_check"("gateway_id");

-- CreateIndex
CREATE INDEX "pam_discovery_job_company_id_idx" ON "pam_discovery_job"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "pam_apikey_key_hash_key" ON "pam_apikey"("key_hash");

-- CreateIndex
CREATE INDEX "pam_apikey_company_id_idx" ON "pam_apikey"("company_id");

-- CreateIndex
CREATE INDEX "pam_ticket_provider_company_id_idx" ON "pam_ticket_provider"("company_id");

-- CreateIndex
CREATE INDEX "pod_pod_engine_id_idx" ON "pod_pod"("engine_id");

-- CreateIndex
CREATE INDEX "pod_action_company_id_created_at_idx" ON "pod_action"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "pod_exec_session_container_id_idx" ON "pod_exec_session"("container_id");

-- CreateIndex
CREATE INDEX "pod_secret_company_id_idx" ON "pod_secret"("company_id");

-- CreateIndex
CREATE INDEX "pod_disk_usage_engine_id_recorded_at_idx" ON "pod_disk_usage"("engine_id", "recorded_at");

-- CreateIndex
CREATE INDEX "pod_update_check_engine_id_idx" ON "pod_update_check"("engine_id");

-- CreateIndex
CREATE INDEX "pod_heal_policy_company_id_idx" ON "pod_heal_policy"("company_id");

-- CreateIndex
CREATE INDEX "pod_backup_schedule_company_id_idx" ON "pod_backup_schedule"("company_id");

-- CreateIndex
CREATE INDEX "pod_system_backup_company_id_idx" ON "pod_system_backup"("company_id");

-- CreateIndex
CREATE INDEX "pod_patch_image_id_idx" ON "pod_patch"("image_id");

-- CreateIndex
CREATE INDEX "pod_scan_schedule_company_id_idx" ON "pod_scan_schedule"("company_id");

-- CreateIndex
CREATE INDEX "pod_threat_intel_company_id_cve_idx" ON "pod_threat_intel"("company_id", "cve");

-- CreateIndex
CREATE INDEX "pod_registry_repository_registry_id_idx" ON "pod_registry_repository"("registry_id");

-- CreateIndex
CREATE INDEX "pod_registry_tag_repository_id_idx" ON "pod_registry_tag"("repository_id");

-- CreateIndex
CREATE INDEX "pod_port_binding_container_id_idx" ON "pod_port_binding"("container_id");

-- CreateIndex
CREATE INDEX "pod_gpu_engine_id_idx" ON "pod_gpu"("engine_id");

-- CreateIndex
CREATE INDEX "pod_notification_channel_company_id_idx" ON "pod_notification_channel"("company_id");

-- CreateIndex
CREATE INDEX "pod_notification_template_channel_id_idx" ON "pod_notification_template"("channel_id");

-- CreateIndex
CREATE INDEX "pod_log_setting_engine_id_idx" ON "pod_log_setting"("engine_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_api_key_key_hash_key" ON "pod_api_key"("key_hash");

-- CreateIndex
CREATE INDEX "pod_api_key_company_id_idx" ON "pod_api_key"("company_id");

-- CreateIndex
CREATE INDEX "pod_webhook_company_id_idx" ON "pod_webhook"("company_id");

-- CreateIndex
CREATE INDEX "pod_template_registry_company_id_idx" ON "pod_template_registry"("company_id");

-- CreateIndex
CREATE INDEX "sec_agent_group_company_id_idx" ON "sec_agent_group"("company_id");

-- CreateIndex
CREATE INDEX "sec_decoder_company_id_idx" ON "sec_decoder"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sec_decoder_company_id_code_key" ON "sec_decoder"("company_id", "code");

-- CreateIndex
CREATE INDEX "sec_event_alert_event_id_idx" ON "sec_event_alert"("event_id");

-- CreateIndex
CREATE INDEX "sec_incident_event_incident_id_idx" ON "sec_incident_event"("incident_id");

-- CreateIndex
CREATE INDEX "sec_fim_event_agent_id_occurred_at_idx" ON "sec_fim_event"("agent_id", "occurred_at");

-- CreateIndex
CREATE INDEX "sec_sca_policy_company_id_idx" ON "sec_sca_policy"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sec_sca_policy_company_id_code_key" ON "sec_sca_policy"("company_id", "code");

-- CreateIndex
CREATE INDEX "sec_sca_result_agent_id_idx" ON "sec_sca_result"("agent_id");

-- CreateIndex
CREATE INDEX "sec_vuln_company_id_idx" ON "sec_vuln"("company_id");

-- CreateIndex
CREATE INDEX "sec_vuln_agent_id_idx" ON "sec_vuln"("agent_id");

-- CreateIndex
CREATE INDEX "sec_intel_ioc_feed_id_idx" ON "sec_intel_ioc"("feed_id");

-- CreateIndex
CREATE INDEX "sec_compliance_report_company_id_idx" ON "sec_compliance_report"("company_id");

-- CreateIndex
CREATE INDEX "sec_container_event_company_id_occurred_at_idx" ON "sec_container_event"("company_id", "occurred_at");

-- CreateIndex
CREATE INDEX "sec_malware_event_agent_id_idx" ON "sec_malware_event"("agent_id");

-- CreateIndex
CREATE INDEX "sec_cdb_list_company_id_idx" ON "sec_cdb_list"("company_id");

-- CreateIndex
CREATE INDEX "sec_cdb_entry_list_id_idx" ON "sec_cdb_entry"("list_id");

-- CreateIndex
CREATE INDEX "sec_cloud_account_company_id_idx" ON "sec_cloud_account"("company_id");

-- CreateIndex
CREATE INDEX "sec_cloud_finding_account_id_idx" ON "sec_cloud_finding"("account_id");

-- CreateIndex
CREATE INDEX "sec_forwarder_company_id_idx" ON "sec_forwarder"("company_id");

-- CreateIndex
CREATE INDEX "sec_log_source_company_id_idx" ON "sec_log_source"("company_id");

-- CreateIndex
CREATE INDEX "sec_rbac_grant_company_id_idx" ON "sec_rbac_grant"("company_id");

-- CreateIndex
CREATE INDEX "sec_response_action_company_id_idx" ON "sec_response_action"("company_id");

-- CreateIndex
CREATE INDEX "sec_response_script_company_id_idx" ON "sec_response_script"("company_id");

-- CreateIndex
CREATE INDEX "sec_live_query_agent_id_idx" ON "sec_live_query"("agent_id");

-- CreateIndex
CREATE INDEX "sec_osquery_query_company_id_idx" ON "sec_osquery_query"("company_id");

-- CreateIndex
CREATE INDEX "sec_syscollector_hardware_agent_id_idx" ON "sec_syscollector_hardware"("agent_id");

-- CreateIndex
CREATE INDEX "vms_node_cluster_id_idx" ON "vms_node"("cluster_id");

-- CreateIndex
CREATE INDEX "vms_cluster_company_id_idx" ON "vms_cluster"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "vms_cluster_company_id_code_key" ON "vms_cluster"("company_id", "code");

-- CreateIndex
CREATE INDEX "vms_storage_host_id_idx" ON "vms_storage"("host_id");

-- CreateIndex
CREATE INDEX "vms_pool_host_id_idx" ON "vms_pool"("host_id");

-- CreateIndex
CREATE INDEX "vms_nic_guest_id_idx" ON "vms_nic"("guest_id");

-- CreateIndex
CREATE INDEX "vms_backup_company_id_idx" ON "vms_backup"("company_id");

-- CreateIndex
CREATE INDEX "vms_task_company_id_idx" ON "vms_task"("company_id");

-- CreateIndex
CREATE INDEX "vms_ha_guest_id_idx" ON "vms_ha"("guest_id");

-- CreateIndex
CREATE INDEX "vms_replication_guest_id_idx" ON "vms_replication"("guest_id");

-- CreateIndex
CREATE INDEX "vms_sdn_company_id_idx" ON "vms_sdn"("company_id");

-- CreateIndex
CREATE INDEX "vms_iso_host_id_idx" ON "vms_iso"("host_id");

-- CreateIndex
CREATE INDEX "vms_template_host_id_idx" ON "vms_template"("host_id");

-- CreateIndex
CREATE INDEX "vms_passthrough_host_id_idx" ON "vms_passthrough"("host_id");

-- CreateIndex
CREATE INDEX "vms_fw_rule_company_id_idx" ON "vms_fw_rule"("company_id");

-- CreateIndex
CREATE INDEX "vms_fw_rule_guest_id_idx" ON "vms_fw_rule"("guest_id");

-- CreateIndex
CREATE INDEX "vms_security_group_company_id_idx" ON "vms_security_group"("company_id");

-- CreateIndex
CREATE INDEX "web_access_list_company_id_idx" ON "web_access_list"("company_id");

-- CreateIndex
CREATE INDEX "web_access_entry_list_id_idx" ON "web_access_entry"("list_id");

-- CreateIndex
CREATE INDEX "web_access_log_vhost_id_logged_at_idx" ON "web_access_log"("vhost_id", "logged_at");

-- CreateIndex
CREATE INDEX "web_access_stat_vhost_id_bucket_idx" ON "web_access_stat"("vhost_id", "bucket");

-- CreateIndex
CREATE INDEX "web_acme_account_company_id_idx" ON "web_acme_account"("company_id");

-- CreateIndex
CREATE INDEX "web_dns_provider_company_id_idx" ON "web_dns_provider"("company_id");

-- CreateIndex
CREATE INDEX "web_dns_record_provider_id_idx" ON "web_dns_record"("provider_id");

-- CreateIndex
CREATE INDEX "web_dns_record_domain_id_idx" ON "web_dns_record"("domain_id");

-- CreateIndex
CREATE INDEX "web_location_vhost_id_idx" ON "web_location"("vhost_id");

-- CreateIndex
CREATE INDEX "web_stream_company_id_idx" ON "web_stream"("company_id");

-- CreateIndex
CREATE INDEX "web_snippet_company_id_idx" ON "web_snippet"("company_id");

-- CreateIndex
CREATE INDEX "web_template_company_id_idx" ON "web_template"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "web_template_company_id_code_key" ON "web_template"("company_id", "code");

-- CreateIndex
CREATE INDEX "web_config_revision_server_id_created_at_idx" ON "web_config_revision"("server_id", "created_at");

-- CreateIndex
CREATE INDEX "web_change_company_id_created_at_idx" ON "web_change"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "web_deploy_company_id_idx" ON "web_deploy"("company_id");

-- CreateIndex
CREATE INDEX "web_backup_company_id_idx" ON "web_backup"("company_id");

-- CreateIndex
CREATE INDEX "web_server_metric_server_id_recorded_at_idx" ON "web_server_metric"("server_id", "recorded_at");
