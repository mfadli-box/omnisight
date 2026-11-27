-- ==============================================================================
-- OmniSight (OSC) — Master Data Schema Complete (dat_* tables)
-- Database Target : PostgreSQL 18+ (osc_base)
-- Naming Rules    : dat_* (Master Data)
-- File Location   : osc_base/init/01_dat.sql
-- Description     : Unified DDL Schema for all 42 Data Master & Configuration tables
-- ==============================================================================

-- 1. Inisialisasi Ekstensi Wajib & Timezone
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SET timezone = 'UTC';

-- ==============================================================================
-- GROUP CM: CORE ENGINE, IDENTITY & GOVERNANCE
-- ==============================================================================

-- 1. Master Company (dat_company)
CREATE TABLE IF NOT EXISTS dat_company (
    company_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_code        VARCHAR(20) NOT NULL UNIQUE,
    company_name        VARCHAR(100) NOT NULL,
    has_hris_link       BOOLEAN NOT NULL DEFAULT FALSE,
    hris_login_url      TEXT NULL,
    is_mfa_active       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_hris_url CHECK (
        (has_hris_link = FALSE) OR (has_hris_link = TRUE AND hris_login_url IS NOT NULL AND hris_login_url <> '')
    )
);

CREATE INDEX IF NOT EXISTS idx_dat_company_code ON dat_company(company_code);
CREATE INDEX IF NOT EXISTS idx_dat_company_active ON dat_company(is_active);

-- 2. Master Area (dat_area)
CREATE TABLE IF NOT EXISTS dat_area (
    area_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE RESTRICT,
    area_code           VARCHAR(20) NOT NULL,
    area_name           VARCHAR(100) NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dat_area_company_code UNIQUE (company_id, area_code)
);

CREATE INDEX IF NOT EXISTS idx_dat_area_company ON dat_area(company_id);
CREATE INDEX IF NOT EXISTS idx_dat_area_code ON dat_area(area_code);

-- 3. Master Store / Cabang (dat_store)
CREATE TABLE IF NOT EXISTS dat_store (
    store_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE RESTRICT,
    area_id             UUID NOT NULL REFERENCES dat_area(area_id) ON DELETE RESTRICT,
    store_code          VARCHAR(20) NOT NULL,
    store_name          VARCHAR(100) NOT NULL,
    address             TEXT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dat_store_company_code UNIQUE (company_id, store_code)
);

CREATE INDEX IF NOT EXISTS idx_dat_store_company_area ON dat_store(company_id, area_id);

-- 4. Master User / Akun System (dat_user)
CREATE TABLE IF NOT EXISTS dat_user (
    user_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username             VARCHAR(50) NOT NULL UNIQUE,
    email                VARCHAR(100) NOT NULL UNIQUE,
    password_hash        VARCHAR(255) NULL,
    hris_backup_password VARCHAR(255) NULL,
    mfa_secret           TEXT NULL,
    is_mfa_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    is_superadmin        BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at        TIMESTAMPTZ NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dat_user_username ON dat_user(username);
CREATE INDEX IF NOT EXISTS idx_dat_user_email ON dat_user(email);

-- 5. User MFA Recovery Backup Keys (dat_user_mfa_recovery)
CREATE TABLE IF NOT EXISTS dat_user_mfa_recovery (
    recovery_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE CASCADE,
    recovery_code_hash  VARCHAR(255) NOT NULL,
    is_used             BOOLEAN NOT NULL DEFAULT FALSE,
    used_at             TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dat_mfa_user ON dat_user_mfa_recovery(user_id);

-- 6. Data Kepegawaian & Home Assignment (dat_employee)
CREATE TABLE IF NOT EXISTS dat_employee (
    employee_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES dat_user(user_id) ON DELETE CASCADE,
    employee_nik        VARCHAR(30) NOT NULL,
    full_name           VARCHAR(150) NOT NULL,
    home_company_id     UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE RESTRICT,
    home_area_id        UUID NOT NULL REFERENCES dat_area(area_id) ON DELETE RESTRICT,
    home_store_id       UUID NULL REFERENCES dat_store(store_id) ON DELETE SET NULL,
    position_title      VARCHAR(100) NOT NULL DEFAULT 'SRE Engineer',
    department          VARCHAR(100) NOT NULL DEFAULT 'IT Infrastructure & SecOps',
    phone_number        VARCHAR(20) NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dat_employee_company_nik UNIQUE (home_company_id, employee_nik)
);

CREATE INDEX IF NOT EXISTS idx_dat_employee_user ON dat_employee(user_id);

-- 7. Master Role System (dat_role)
CREATE TABLE IF NOT EXISTS dat_role (
    role_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_code           VARCHAR(30) NOT NULL UNIQUE,
    role_name           VARCHAR(100) NOT NULL,
    description         TEXT NULL,
    is_system_role      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dat_role_code ON dat_role(role_code);

-- 8. Master Menu & Sub-Modul (dat_menu)
CREATE TABLE IF NOT EXISTS dat_menu (
    menu_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_code          VARCHAR(5) NOT NULL,
    sub_module_code     VARCHAR(10) NOT NULL UNIQUE,
    menu_name           VARCHAR(100) NOT NULL,
    description         TEXT NULL,
    route_path          VARCHAR(150) NOT NULL,
    icon_name           VARCHAR(50) NULL,
    sort_order          INT NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dat_menu_group ON dat_menu(group_code);

-- 9. Master Granular Role Permissions (dat_permission)
CREATE TABLE IF NOT EXISTS dat_permission (
    permission_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id             UUID NOT NULL REFERENCES dat_role(role_id) ON DELETE CASCADE,
    menu_id             UUID NOT NULL REFERENCES dat_menu(menu_id) ON DELETE CASCADE,
    can_create          BOOLEAN NOT NULL DEFAULT FALSE,
    can_read            BOOLEAN NOT NULL DEFAULT TRUE,
    can_update          BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete          BOOLEAN NOT NULL DEFAULT FALSE,
    can_execute         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dat_permission_role_menu UNIQUE (role_id, menu_id)
);

CREATE INDEX IF NOT EXISTS idx_dat_permission_role ON dat_permission(role_id);

-- 10. Global System Settings (dat_global_setting)
CREATE TABLE IF NOT EXISTS dat_global_setting (
    setting_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    setting_key         VARCHAR(100) NOT NULL,
    setting_value       TEXT NOT NULL,
    value_type          VARCHAR(20) NOT NULL DEFAULT 'STRING',
    category            VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    description         TEXT NULL,
    is_editable         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_global_setting_company_key UNIQUE (company_id, setting_key),
    CONSTRAINT chk_setting_value_type CHECK (value_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'JSON'))
);

CREATE INDEX IF NOT EXISTS idx_dat_global_setting_key ON dat_global_setting(setting_key);

-- 11. Kebijakan Rotasi Log (dat_log_rotation_policy)
CREATE TABLE IF NOT EXISTS dat_log_rotation_policy (
    policy_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_table_name   VARCHAR(64) NOT NULL UNIQUE,
    retention_days      INT NOT NULL DEFAULT 90,
    expire_action       VARCHAR(30) NOT NULL DEFAULT 'DROP_PARTITION',
    archive_bucket      VARCHAR(100) NULL DEFAULT 'omnisight-log-archive',
    is_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    last_rotated_at     TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_expire_action CHECK (expire_action IN ('DROP_PARTITION', 'ARCHIVE_TO_RUSTFS', 'TRUNCATE'))
);

-- ==============================================================================
-- GROUP CT: CONTAINER ENGINE & ORCHESTRATION
-- ==============================================================================

-- 12. Master Docker Daemon Host Node (dat_docker_host)
CREATE TABLE IF NOT EXISTS dat_docker_host (
    host_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    host_name           VARCHAR(100) NOT NULL,
    docker_socket_path  VARCHAR(255) NOT NULL DEFAULT '/var/run/docker.sock',
    docker_version      VARCHAR(30) NULL,
    container_count     INT NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'ONLINE',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dat_docker_host_company ON dat_docker_host(company_id);

-- ==============================================================================
-- GROUP MN: MONITORING, TELEMETRY & ALERTING
-- ==============================================================================

-- 13. Master Server Node (dat_server)
CREATE TABLE IF NOT EXISTS dat_server (
    server_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE RESTRICT,
    area_id             UUID NOT NULL REFERENCES dat_area(area_id) ON DELETE RESTRICT,
    server_hostname     VARCHAR(100) NOT NULL,
    ip_address          INET NOT NULL,
    os_type             VARCHAR(30) NOT NULL DEFAULT 'Ubuntu',
    agent_node_id       VARCHAR(64) NULL UNIQUE,
    environment         VARCHAR(20) NOT NULL DEFAULT 'production',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dat_server_ip UNIQUE (company_id, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_dat_server_ip ON dat_server(ip_address);

-- 14. Master Agent Configuration (dat_agent_config)
CREATE TABLE IF NOT EXISTS dat_agent_config (
    config_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id            UUID NOT NULL REFERENCES dat_server(server_id) ON DELETE CASCADE,
    metrics_interval_s   INT NOT NULL DEFAULT 10,
    heartbeat_interval_s INT NOT NULL DEFAULT 30,
    allow_remote_exec    BOOLEAN NOT NULL DEFAULT FALSE,
    telemetry_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    config_version       INT NOT NULL DEFAULT 1,
    hmac_secret_enc      TEXT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dat_agent_config_server UNIQUE (server_id)
);

-- 15. Master Synthetic Uptime Target (dat_uptime_target)
CREATE TABLE IF NOT EXISTS dat_uptime_target (
    target_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    target_name         VARCHAR(100) NOT NULL,
    target_type         VARCHAR(20) NOT NULL DEFAULT 'HTTP',
    endpoint_url        TEXT NOT NULL,
    check_interval_s    INT NOT NULL DEFAULT 60,
    expected_code       INT NOT NULL DEFAULT 200,
    ssl_warn_days       INT NOT NULL DEFAULT 30,
    ssl_crit_days       INT NOT NULL DEFAULT 7,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_uptime_target_type CHECK (target_type IN ('HTTP', 'HTTPS', 'TCP', 'ICMP_PING', 'DNS'))
);

CREATE INDEX IF NOT EXISTS idx_dat_uptime_company ON dat_uptime_target(company_id);

-- 16. SNMP OID Template Registry (dat_snmp_oid_template)
CREATE TABLE IF NOT EXISTS dat_snmp_oid_template (
    template_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_name         VARCHAR(50) NOT NULL,
    device_model        VARCHAR(50) NOT NULL,
    oid_key             VARCHAR(100) NOT NULL,
    oid_number          VARCHAR(150) NOT NULL,
    data_type           VARCHAR(20) NOT NULL DEFAULT 'COUNTER64',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_snmp_oid_template UNIQUE (vendor_name, device_model, oid_key)
);

-- 17. Master Device SNMP Registry (dat_snmp_device)
CREATE TABLE IF NOT EXISTS dat_snmp_device (
    device_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    device_name         VARCHAR(100) NOT NULL,
    ip_address          INET NOT NULL,
    snmp_version        VARCHAR(10) NOT NULL DEFAULT 'v2c',
    community_enc       TEXT NULL,
    snmp_v3_user        VARCHAR(50) NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dat_snmp_ip ON dat_snmp_device(ip_address);

-- 18. Master Alert Rules (dat_alert_rule)
CREATE TABLE IF NOT EXISTS dat_alert_rule (
    rule_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    rule_name           VARCHAR(100) NOT NULL,
    metric_name         VARCHAR(50) NOT NULL,
    operator            VARCHAR(10) NOT NULL DEFAULT '>',
    threshold_value     DOUBLE PRECISION NOT NULL,
    severity            VARCHAR(20) NOT NULL DEFAULT 'WARNING',
    evaluation_window_s INT NOT NULL DEFAULT 300,
    is_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_alert_severity CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL', 'FATAL'))
);

-- 19. Alert Escalation Policy Rules (dat_alert_escalation)
CREATE TABLE IF NOT EXISTS dat_alert_escalation (
    escalation_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    rule_id             UUID NOT NULL REFERENCES dat_alert_rule(rule_id) ON DELETE CASCADE,
    channel_type        VARCHAR(30) NOT NULL DEFAULT 'TELEGRAM',
    recipient_target    TEXT NOT NULL,
    bot_token_enc       TEXT NULL,
    delay_minutes       INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- GROUP SE: SECOPS & ACCESS GUARD
-- ==============================================================================

-- 20. PAM Credential Vault (dat_pam_credential)
CREATE TABLE IF NOT EXISTS dat_pam_credential (
    credential_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    title               VARCHAR(100) NOT NULL,
    protocol            VARCHAR(10) NOT NULL DEFAULT 'SSH',
    host_ip             INET NOT NULL,
    port                INT NOT NULL DEFAULT 22,
    username            VARCHAR(50) NOT NULL,
    private_key_enc     TEXT NULL,
    password_enc        TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_pam_protocol CHECK (protocol IN ('SSH', 'RDP', 'TELNET', 'VNC'))
);

CREATE INDEX IF NOT EXISTS idx_dat_pam_company ON dat_pam_credential(company_id);

-- 21. SIEM & Threat Security Rules (dat_security_rule)
CREATE TABLE IF NOT EXISTS dat_security_rule (
    rule_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code           VARCHAR(30) NOT NULL UNIQUE,
    rule_name           VARCHAR(100) NOT NULL,
    attack_type         VARCHAR(30) NOT NULL,
    regex_pattern       TEXT NOT NULL,
    action_type         VARCHAR(20) NOT NULL DEFAULT 'BLOCK',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 22. Active IP Blacklist Registry (dat_ip_blacklist)
CREATE TABLE IF NOT EXISTS dat_ip_blacklist (
    blacklist_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address          INET NOT NULL UNIQUE,
    reason              TEXT NOT NULL,
    blocked_by          VARCHAR(50) NOT NULL DEFAULT 'WAF_GUARD',
    expires_at          TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dat_ip_blacklist_ip ON dat_ip_blacklist(ip_address);

-- ==============================================================================
-- GROUP NP: NETWORK & REVERSE PROXY
-- ==============================================================================

-- 23. Nginx Virtual Host Master (dat_nginx_vhost)
CREATE TABLE IF NOT EXISTS dat_nginx_vhost (
    vhost_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    domain_name         VARCHAR(255) NOT NULL UNIQUE,
    forward_scheme      VARCHAR(10) NOT NULL DEFAULT 'http',
    forward_host        VARCHAR(100) NOT NULL,
    forward_port        INT NOT NULL DEFAULT 8080,
    ssl_forced          BOOLEAN NOT NULL DEFAULT TRUE,
    hsts_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    websocket_support   BOOLEAN NOT NULL DEFAULT TRUE,
    block_exploits      BOOLEAN NOT NULL DEFAULT TRUE,
    custom_nginx_config TEXT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dat_vhost_domain ON dat_nginx_vhost(domain_name);

-- 24. SSL/TLS Certificate Vault (dat_ssl_certificate)
CREATE TABLE IF NOT EXISTS dat_ssl_certificate (
    certificate_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    domain_name         VARCHAR(255) NOT NULL,
    provider            VARCHAR(30) NOT NULL DEFAULT 'LETS_ENCRYPT',
    cert_path           TEXT NOT NULL,
    key_encrypted       TEXT NOT NULL,
    issuer              VARCHAR(150) NULL,
    valid_from          TIMESTAMPTZ NOT NULL,
    valid_to            TIMESTAMPTZ NOT NULL,
    auto_renew          BOOLEAN NOT NULL DEFAULT TRUE,
    status              VARCHAR(20) NOT NULL DEFAULT 'VALID',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dat_ssl_cert_domain ON dat_ssl_certificate(domain_name);

-- 25. VLAN Inventaris (dat_vlan)
CREATE TABLE IF NOT EXISTS dat_vlan (
    vlan_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    area_id             UUID NULL REFERENCES dat_area(area_id) ON DELETE SET NULL,
    vlan_tag            INT NOT NULL,
    vlan_name           VARCHAR(100) NOT NULL,
    description         TEXT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vlan_company_tag UNIQUE (company_id, vlan_tag)
);

-- 26. IP Subnet CIDR Master (dat_ip_subnet)
CREATE TABLE IF NOT EXISTS dat_ip_subnet (
    subnet_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    area_id             UUID NULL REFERENCES dat_area(area_id) ON DELETE SET NULL,
    vlan_id             UUID NULL REFERENCES dat_vlan(vlan_id) ON DELETE SET NULL,
    subnet_name         VARCHAR(100) NOT NULL,
    cidr_prefix         CIDR NOT NULL,
    gateway_ip          INET NOT NULL,
    dns_primary         INET NULL DEFAULT '1.1.1.1',
    dns_secondary       INET NULL DEFAULT '8.8.8.8',
    dhcp_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_subnet_company_cidr UNIQUE (company_id, cidr_prefix)
);

CREATE INDEX IF NOT EXISTS idx_dat_ip_subnet_cidr ON dat_ip_subnet USING gist (cidr_prefix inet_ops);

-- ==============================================================================
-- GROUP AM: ASSET MANAGEMENT & CMDB
-- ==============================================================================

-- 27. Asset Category Master (dat_asset_category)
CREATE TABLE IF NOT EXISTS dat_asset_category (
    category_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name       VARCHAR(100) NOT NULL UNIQUE,
    useful_life_years   INT NOT NULL DEFAULT 5,
    salvage_percent     NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 28. Vendor Directory Master (dat_vendor)
CREATE TABLE IF NOT EXISTS dat_vendor (
    vendor_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    vendor_name         VARCHAR(100) NOT NULL,
    contact_person      VARCHAR(100) NULL,
    email               VARCHAR(100) NULL,
    phone               VARCHAR(30) NULL,
    sla_response_hours  INT NOT NULL DEFAULT 4,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 29. Enterprise Physical Asset Inventory (dat_asset)
CREATE TABLE IF NOT EXISTS dat_asset (
    asset_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    category_id         UUID NOT NULL REFERENCES dat_asset_category(category_id) ON DELETE RESTRICT,
    vendor_id           UUID NULL REFERENCES dat_vendor(vendor_id) ON DELETE SET NULL,
    asset_tag           VARCHAR(50) NOT NULL UNIQUE,
    serial_number       VARCHAR(100) NOT NULL,
    asset_name          VARCHAR(150) NOT NULL,
    purchase_date       DATE NOT NULL,
    purchase_cost       NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    warranty_expiry     DATE NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'IN_USE',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_asset_status CHECK (status IN ('IN_USE', 'IN_STORAGE', 'IN_REPAIR', 'SCRAPPED', 'DISPOSED'))
);

CREATE INDEX IF NOT EXISTS idx_dat_asset_tag ON dat_asset(asset_tag);

-- 30. Data Center Facility Master (dat_datacenter)
CREATE TABLE IF NOT EXISTS dat_datacenter (
    datacenter_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    dc_code             VARCHAR(20) NOT NULL UNIQUE,
    dc_name             VARCHAR(100) NOT NULL,
    location_address    TEXT NULL,
    power_capacity_kw   NUMERIC(10,2) NOT NULL DEFAULT 100.00,
    cooling_capacity_btu NUMERIC(12,2) NOT NULL DEFAULT 350000.00,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 31. Server Rack Frame Master (dat_rack_frame)
CREATE TABLE IF NOT EXISTS dat_rack_frame (
    rack_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    datacenter_id       UUID NOT NULL REFERENCES dat_datacenter(datacenter_id) ON DELETE CASCADE,
    rack_code           VARCHAR(20) NOT NULL,
    rack_name           VARCHAR(100) NOT NULL,
    total_u_units       INT NOT NULL DEFAULT 42,
    max_power_watts     INT NOT NULL DEFAULT 5000,
    max_weight_kg       INT NOT NULL DEFAULT 800,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_rack_dc_code UNIQUE (datacenter_id, rack_code)
);

-- 32. Store Network & Telephony Assets (dat_store_telephony)
CREATE TABLE IF NOT EXISTS dat_store_telephony (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID NOT NULL REFERENCES dat_store(store_id) ON DELETE CASCADE,
    ip_address          INET NOT NULL,
    phone_type          VARCHAR(50) NOT NULL,
    phone_number        VARCHAR(30) NOT NULL,
    phone_imei          VARCHAR(35) NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_store_telephony UNIQUE (store_id)
);

-- 33. Store POS Hardware Inventory (dat_store_pos)
CREATE TABLE IF NOT EXISTS dat_store_pos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID NOT NULL REFERENCES dat_store(store_id) ON DELETE CASCADE,
    pos_slot            VARCHAR(20) NOT NULL,
    pc_model            VARCHAR(100) NOT NULL,
    ram_capacity        VARCHAR(20) NOT NULL,
    printer_model       VARCHAR(100) NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_store_pos_slot UNIQUE (store_id, pos_slot)
);

-- 34. Store Merchant & Digital Accounts (dat_store_account)
CREATE TABLE IF NOT EXISTS dat_store_account (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID NOT NULL REFERENCES dat_store(store_id) ON DELETE CASCADE,
    account_type        VARCHAR(50) NOT NULL,
    username            VARCHAR(100) NOT NULL,
    encrypted_password  TEXT NULL,
    phone_number        VARCHAR(30) NULL,
    sid                 VARCHAR(50) NULL,
    mid                 VARCHAR(50) NULL,
    account_uuid        VARCHAR(64) NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 35. EDC Payment Terminals (dat_store_edc)
CREATE TABLE IF NOT EXISTS dat_store_edc (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID NOT NULL REFERENCES dat_store(store_id) ON DELETE CASCADE,
    bank_name           VARCHAR(30) NOT NULL,
    edc_model           VARCHAR(50) NOT NULL,
    connection_type     VARCHAR(20) NOT NULL,
    connect_target      VARCHAR(50) NULL,
    mid_code            VARCHAR(50) NOT NULL,
    tid_code            VARCHAR(50) NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 36. Digital Signage Equipment (dat_store_digisign)
CREATE TABLE IF NOT EXISTS dat_store_digisign (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID NOT NULL REFERENCES dat_store(store_id) ON DELETE CASCADE,
    pc_brand            VARCHAR(50) NOT NULL,
    pc_serial_number    VARCHAR(100) NOT NULL,
    rental_status       VARCHAR(10) NOT NULL DEFAULT 'YA',
    tv_unit_count       INT NOT NULL DEFAULT 2,
    tv1_brand           VARCHAR(50) NULL,
    tv1_serial_number   VARCHAR(100) NULL,
    tv2_brand           VARCHAR(50) NULL,
    tv2_serial_number   VARCHAR(100) NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- GROUP SD: SERVICEDESK & INCIDENT MANAGEMENT
-- ==============================================================================

-- 37. Helpdesk Ticket Category Master (dat_ticket_category)
CREATE TABLE IF NOT EXISTS dat_ticket_category (
    category_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_code       VARCHAR(30) NOT NULL UNIQUE,
    category_name       VARCHAR(100) NOT NULL,
    description         TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 38. SLA Policy Rules Matrix (dat_sla_policy)
CREATE TABLE IF NOT EXISTS dat_sla_policy (
    sla_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    priority_level      VARCHAR(20) NOT NULL,
    response_target_min INT NOT NULL DEFAULT 15,
    resolve_target_min  INT NOT NULL DEFAULT 240,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sla_company_priority UNIQUE (company_id, priority_level),
    CONSTRAINT chk_sla_priority CHECK (priority_level IN ('P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'))
);

-- ==============================================================================
-- GROUP AG: AI GATEWAY & AUTOMATION
-- ==============================================================================

-- 39. Authorized AI Agent Registry (dat_mcp_client)
CREATE TABLE IF NOT EXISTS dat_mcp_client (
    client_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    client_name         VARCHAR(100) NOT NULL,
    api_key_hash        VARCHAR(255) NOT NULL UNIQUE,
    allowed_tools       TEXT[] NOT NULL,
    rate_limit_rpm      INT NOT NULL DEFAULT 60,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 40. MCP Tool Catalog (dat_mcp_tool)
CREATE TABLE IF NOT EXISTS dat_mcp_tool (
    tool_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name           VARCHAR(100) NOT NULL UNIQUE,
    description         TEXT NOT NULL,
    input_schema_json   JSONB NOT NULL,
    is_destructive      BOOLEAN NOT NULL DEFAULT FALSE,
    required_permission VARCHAR(100) NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 41. Internal AI Agent Profile Master (dat_ai_agent_profile)
CREATE TABLE IF NOT EXISTS dat_ai_agent_profile (
    agent_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_code          VARCHAR(30) NOT NULL UNIQUE,
    agent_name          VARCHAR(100) NOT NULL,
    role_description    TEXT NOT NULL,
    system_prompt       TEXT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 42. Directus CMS Integration Settings (dat_directus_config)
CREATE TABLE IF NOT EXISTS dat_directus_config (
    config_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    directus_url        TEXT NOT NULL,
    static_token_enc    TEXT NOT NULL,
    collection_name     VARCHAR(100) NOT NULL DEFAULT 'osc_work_logs',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- AUTO-TRIGGER UPDATED_AT TIMESTAMP FUNCTION & BINDINGS
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_set_dat_updated_at()
RETURNS TRIGGER AS 10
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
10 LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_dat_company BEFORE UPDATE ON dat_company FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_area BEFORE UPDATE ON dat_area FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_store BEFORE UPDATE ON dat_store FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_user BEFORE UPDATE ON dat_user FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_employee BEFORE UPDATE ON dat_employee FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_role BEFORE UPDATE ON dat_role FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_menu BEFORE UPDATE ON dat_menu FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_permission BEFORE UPDATE ON dat_permission FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_global_setting BEFORE UPDATE ON dat_global_setting FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_log_rotation_policy BEFORE UPDATE ON dat_log_rotation_policy FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_docker_host BEFORE UPDATE ON dat_docker_host FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_server BEFORE UPDATE ON dat_server FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_agent_config BEFORE UPDATE ON dat_agent_config FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_uptime_target BEFORE UPDATE ON dat_uptime_target FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_snmp_device BEFORE UPDATE ON dat_snmp_device FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_alert_rule BEFORE UPDATE ON dat_alert_rule FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_alert_escalation BEFORE UPDATE ON dat_alert_escalation FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_pam_credential BEFORE UPDATE ON dat_pam_credential FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_security_rule BEFORE UPDATE ON dat_security_rule FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_nginx_vhost BEFORE UPDATE ON dat_nginx_vhost FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_ssl_certificate BEFORE UPDATE ON dat_ssl_certificate FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_vlan BEFORE UPDATE ON dat_vlan FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_ip_subnet BEFORE UPDATE ON dat_ip_subnet FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_asset BEFORE UPDATE ON dat_asset FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_store_telephony BEFORE UPDATE ON dat_store_telephony FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_store_pos BEFORE UPDATE ON dat_store_pos FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_store_account BEFORE UPDATE ON dat_store_account FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_store_edc BEFORE UPDATE ON dat_store_edc FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
CREATE TRIGGER set_updated_at_dat_store_digisign BEFORE UPDATE ON dat_store_digisign FOR EACH ROW EXECUTE FUNCTION trg_set_dat_updated_at();
