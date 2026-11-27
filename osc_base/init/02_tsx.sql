-- ==============================================================================
-- OmniSight (OSC) — Master Transactional & Access Schema (trx_*)
-- Database Target : PostgreSQL 18+ (osc_base)
-- Naming Rules    : trx_* (Transactional Entities & Real-Time Tracking)
-- File Location   : osc_base/init/02_trx.sql
-- Description     : Unified DDL schema for all transactional tables across 19 sub-modules
-- ==============================================================================

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SET timezone = 'UTC';

-- ==============================================================================
-- 1. GROUP CM: CORE ENGINE, IDENTITY & ACCESS MAPPING
-- ==============================================================================

-- CM01: Active User Authentication Sessions (trx_auth_session)
CREATE TABLE IF NOT EXISTS trx_auth_session (
    session_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE CASCADE,
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    jwt_token_hash      VARCHAR(64) NOT NULL UNIQUE,
    ip_address          INET NOT NULL,
    user_agent          TEXT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trx_auth_session_user ON trx_auth_session(user_id);
CREATE INDEX IF NOT EXISTS idx_trx_auth_session_hash ON trx_auth_session(jwt_token_hash);

-- CM02: Multi-Company Access Mapping (trx_user_company)
CREATE TABLE IF NOT EXISTS trx_user_company (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE CASCADE,
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    role_id             UUID NOT NULL REFERENCES dat_role(role_id) ON DELETE RESTRICT,
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    granted_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    granted_by          UUID REFERENCES dat_user(user_id) ON DELETE SET NULL,
    CONSTRAINT uq_user_company UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_trx_user_company_user ON trx_user_company(user_id);
CREATE INDEX IF NOT EXISTS idx_trx_user_company_company ON trx_user_company(company_id);

-- CM02: Multi-Area Access Mapping (trx_user_area)
CREATE TABLE IF NOT EXISTS trx_user_area (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE CASCADE,
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    area_id             UUID NOT NULL REFERENCES dat_area(area_id) ON DELETE CASCADE,
    granted_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_company_area UNIQUE (user_id, company_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_trx_user_area_user ON trx_user_area(user_id);
CREATE INDEX IF NOT EXISTS idx_trx_user_area_area ON trx_user_area(area_id);

-- CM03: System Audit Trail Log (trx_audit_trail)
CREATE TABLE IF NOT EXISTS trx_audit_trail (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES dat_user(user_id) ON DELETE SET NULL,
    company_id          UUID REFERENCES dat_company(company_id) ON DELETE SET NULL,
    menu_code           VARCHAR(10) REFERENCES dat_menu(sub_module_code) ON DELETE SET NULL,
    action              VARCHAR(20) NOT NULL, -- CREATE, READ, UPDATE, DELETE, EXECUTE, LOGIN, LOGOUT
    resource_name       VARCHAR(100) NOT NULL,
    resource_id         VARCHAR(100) NULL,
    old_values          JSONB NULL,
    new_values          JSONB NULL,
    ip_address          INET NULL,
    user_agent          TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trx_audit_user ON trx_audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_trx_audit_created ON trx_audit_trail(created_at DESC);

-- CM03: Agent Background Job Execution Tracking (trx_job_execution)
CREATE TABLE IF NOT EXISTS trx_job_execution (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id           UUID NOT NULL REFERENCES dat_server(server_id) ON DELETE CASCADE,
    agent_id            UUID REFERENCES dat_agent_config(config_id) ON DELETE CASCADE,
    job_name            VARCHAR(100) NOT NULL,
    command_executed    TEXT NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, RUNNING, SUCCESS, FAILED, TIMEOUT
    exit_code           INT NULL,
    stdout_output       TEXT NULL,
    stderr_output       TEXT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at        TIMESTAMPTZ NULL,
    duration_ms         BIGINT NULL
);

CREATE INDEX IF NOT EXISTS idx_trx_job_server ON trx_job_execution(server_id);
CREATE INDEX IF NOT EXISTS idx_trx_job_status ON trx_job_execution(status);

-- ==============================================================================
-- 2. GROUP CT: CONTAINER ENGINE & TERMINAL
-- ==============================================================================

-- CT01: Docker Compose Stack Deployments (trx_container_stack)
CREATE TABLE IF NOT EXISTS trx_container_stack (
    stack_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    host_id             UUID NOT NULL REFERENCES dat_docker_host(host_id) ON DELETE CASCADE,
    stack_name          VARCHAR(100) NOT NULL,
    compose_content     TEXT NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'RUNNING', -- RUNNING, STOPPED, DEGRADED, FAILED
    deployed_by         UUID REFERENCES dat_user(user_id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_stack_host_name UNIQUE (host_id, stack_name)
);

CREATE INDEX IF NOT EXISTS idx_trx_stack_host ON trx_container_stack(host_id);

-- CT01: Container Services in Stack (trx_container_service)
CREATE TABLE IF NOT EXISTS trx_container_service (
    service_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stack_id            UUID NOT NULL REFERENCES trx_container_stack(stack_id) ON DELETE CASCADE,
    container_id        VARCHAR(64) NULL,
    service_name        VARCHAR(100) NOT NULL,
    image_name          VARCHAR(255) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'HEALTHY',
    restart_count       INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trx_service_stack ON trx_container_service(stack_id);

-- CT01: Persistent Container Volumes (trx_container_volume)
CREATE TABLE IF NOT EXISTS trx_container_volume (
    volume_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id             UUID NOT NULL REFERENCES dat_docker_host(host_id) ON DELETE CASCADE,
    volume_name         VARCHAR(100) NOT NULL,
    driver              VARCHAR(50) NOT NULL DEFAULT 'local',
    mount_path          TEXT NOT NULL,
    size_bytes          BIGINT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CT02: Web TTY Exec Sessions (trx_container_exec_session)
CREATE TABLE IF NOT EXISTS trx_container_exec_session (
    exec_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id          UUID NOT NULL REFERENCES trx_container_service(service_id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE RESTRICT,
    tty_cols            INT NOT NULL DEFAULT 80,
    tty_rows            INT NOT NULL DEFAULT 24,
    shell_command       VARCHAR(100) NOT NULL DEFAULT '/bin/sh',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at            TIMESTAMPTZ NULL
);

-- CT02: Active Container Log Streams (trx_container_log_stream)
CREATE TABLE IF NOT EXISTS trx_container_log_stream (
    stream_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id          UUID NOT NULL REFERENCES trx_container_service(service_id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE CASCADE,
    tail_lines          INT NOT NULL DEFAULT 100,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CT02: Local Docker Image Cache (trx_docker_image)
CREATE TABLE IF NOT EXISTS trx_docker_image (
    image_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id             UUID NOT NULL REFERENCES dat_docker_host(host_id) ON DELETE CASCADE,
    image_digest        VARCHAR(255) NOT NULL,
    repository          VARCHAR(150) NOT NULL,
    tag                 VARCHAR(50) NOT NULL DEFAULT 'latest',
    size_bytes          BIGINT NOT NULL DEFAULT 0,
    is_dangling         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CT02: Disk Pruning Job Tracking (trx_docker_prune_job)
CREATE TABLE IF NOT EXISTS trx_docker_prune_job (
    job_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id             UUID NOT NULL REFERENCES dat_docker_host(host_id) ON DELETE CASCADE,
    initiated_by        UUID REFERENCES dat_user(user_id) ON DELETE SET NULL,
    reclaimed_bytes     BIGINT NOT NULL DEFAULT 0,
    pruned_containers   INT NOT NULL DEFAULT 0,
    pruned_images       INT NOT NULL DEFAULT 0,
    executed_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 3. GROUP MN: MONITORING, TELEMETRY & ALERTING
-- ==============================================================================

-- MN01: Agent Telemetry Heartbeat Status (trx_agent_heartbeat)
CREATE TABLE IF NOT EXISTS trx_agent_heartbeat (
    heartbeat_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id           UUID NOT NULL REFERENCES dat_server(server_id) ON DELETE CASCADE,
    agent_version       VARCHAR(20) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'ONLINE', -- ONLINE, DEGRADED, UNREACHABLE
    last_ping_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_agent_heartbeat_server UNIQUE (server_id)
);

-- MN02: Uptime Target Real-Time Status (trx_uptime_status)
CREATE TABLE IF NOT EXISTS trx_uptime_status (
    status_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id           UUID NOT NULL REFERENCES dat_uptime_target(target_id) ON DELETE CASCADE,
    is_up               BOOLEAN NOT NULL DEFAULT TRUE,
    latency_ms          INT NOT NULL DEFAULT 0,
    http_status_code    INT NULL,
    ssl_days_remaining  INT NULL,
    last_check_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_uptime_status_target UNIQUE (target_id)
);

-- MN02: Uptime Synthetic Probe History Log (trx_uptime_history)
CREATE TABLE IF NOT EXISTS trx_uptime_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id           UUID NOT NULL REFERENCES dat_uptime_target(target_id) ON DELETE CASCADE,
    is_up               BOOLEAN NOT NULL,
    latency_ms          INT NOT NULL,
    response_summary    TEXT NULL,
    checked_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trx_uptime_hist_target ON trx_uptime_history(target_id, checked_at DESC);

-- MN02: Daily Target Availability Summary (trx_uptime_summary_daily)
CREATE TABLE IF NOT EXISTS trx_uptime_summary_daily (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_date        DATE NOT NULL,
    target_id           UUID NOT NULL REFERENCES dat_uptime_target(target_id) ON DELETE CASCADE,
    availability_pct    NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    avg_latency_ms      INT NOT NULL DEFAULT 0,
    total_downtime_s    INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_uptime_daily UNIQUE (summary_date, target_id)
);

-- MN03: SNMP Device Reachability & Status (trx_snmp_device_status)
CREATE TABLE IF NOT EXISTS trx_snmp_device_status (
    status_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id           UUID NOT NULL REFERENCES dat_snmp_device(device_id) ON DELETE CASCADE,
    is_reachable        BOOLEAN NOT NULL DEFAULT TRUE,
    sys_uptime_ticks    BIGINT NOT NULL DEFAULT 0,
    cpu_utilization_pct NUMERIC(5,2) NULL,
    mem_utilization_pct NUMERIC(5,2) NULL,
    last_polled_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_snmp_device_status UNIQUE (device_id)
);

-- MN03: SNMP Interface Dynamic Metrics (trx_snmp_interface)
CREATE TABLE IF NOT EXISTS trx_snmp_interface (
    interface_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id           UUID NOT NULL REFERENCES dat_snmp_device(device_id) ON DELETE CASCADE,
    if_index            INT NOT NULL,
    if_name             VARCHAR(50) NOT NULL,
    if_oper_status      VARCHAR(10) NOT NULL DEFAULT 'UP', -- UP, DOWN, TESTING
    if_speed_bps        BIGINT NOT NULL DEFAULT 1000000000,
    in_octets           BIGINT NOT NULL DEFAULT 0,
    out_octets          BIGINT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_snmp_interface_index UNIQUE (device_id, if_index)
);

-- MN04: SRE Alert Trigger History (trx_alert_history)
CREATE TABLE IF NOT EXISTS trx_alert_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID REFERENCES dat_company(company_id) ON DELETE SET NULL,
    area_id             UUID REFERENCES dat_area(area_id) ON DELETE SET NULL,
    server_id           UUID REFERENCES dat_server(server_id) ON DELETE SET NULL,
    rule_id             UUID REFERENCES dat_alert_rule(rule_id) ON DELETE SET NULL,
    alert_rule_name     VARCHAR(100) NOT NULL,
    severity            VARCHAR(20) NOT NULL DEFAULT 'WARNING', -- INFO, WARNING, CRITICAL, FATAL
    metric_name         VARCHAR(50) NOT NULL,
    threshold_value     NUMERIC(10,2) NULL,
    actual_value        NUMERIC(10,2) NULL,
    description         TEXT NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'FIRING', -- FIRING, ACKNOWLEDGED, RESOLVED
    triggered_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at     TIMESTAMPTZ NULL,
    acknowledged_by     UUID REFERENCES dat_user(user_id) ON DELETE SET NULL,
    resolved_at         TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_trx_alert_server ON trx_alert_history(server_id);
CREATE INDEX IF NOT EXISTS idx_trx_alert_status ON trx_alert_history(status);

-- MN04: Correlated Incident Cases (trx_alert_incident)
CREATE TABLE IF NOT EXISTS trx_alert_incident (
    incident_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    incident_code       VARCHAR(30) NOT NULL UNIQUE,
    title               VARCHAR(200) NOT NULL,
    root_cause_summary  TEXT NULL,
    severity            VARCHAR(20) NOT NULL DEFAULT 'CRITICAL',
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, INVESTIGATING, MITIGATED, CLOSED
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at           TIMESTAMPTZ NULL
);

-- ==============================================================================
-- 4. GROUP SE: SECOPS & PAM
-- ==============================================================================

-- SE01: PAM Active Bastion Session Tracking (trx_pam_session)
CREATE TABLE IF NOT EXISTS trx_pam_session (
    session_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_id       UUID NOT NULL REFERENCES dat_pam_credential(credential_id) ON DELETE RESTRICT,
    user_id             UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE RESTRICT,
    protocol            VARCHAR(10) NOT NULL DEFAULT 'SSH', -- SSH, RDP, VNC
    client_ip           INET NOT NULL,
    recording_file_path TEXT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at            TIMESTAMPTZ NULL
);

-- SE02: CVE Vulnerability Match & Scan Results (trx_cve_vulnerability)
CREATE TABLE IF NOT EXISTS trx_cve_vulnerability (
    vuln_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id           UUID NOT NULL REFERENCES dat_server(server_id) ON DELETE CASCADE,
    cve_id              VARCHAR(30) NOT NULL, -- e.g. 'CVE-2026-1234'
    package_name        VARCHAR(100) NOT NULL,
    installed_version   VARCHAR(50) NOT NULL,
    fixed_version       VARCHAR(50) NULL,
    severity            VARCHAR(20) NOT NULL DEFAULT 'HIGH', -- LOW, MEDIUM, HIGH, CRITICAL
    remediation_status  VARCHAR(20) NOT NULL DEFAULT 'UNPATCHED', -- UNPATCHED, IN_PROGRESS, PATCHED, IGNORED
    discovered_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 5. GROUP NP: NETWORK & IPAM
-- ==============================================================================

-- NP02: IP Address Real-Time Allocation (trx_ip_allocation)
CREATE TABLE IF NOT EXISTS trx_ip_allocation (
    allocation_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subnet_id           UUID NOT NULL REFERENCES dat_ip_subnet(subnet_id) ON DELETE CASCADE,
    ip_address          INET NOT NULL,
    mac_address         MACADDR NULL,
    device_hostname     VARCHAR(150) NULL,
    server_id           UUID NULL REFERENCES dat_server(server_id) ON DELETE SET NULL,
    store_id            UUID NULL REFERENCES dat_store(store_id) ON DELETE SET NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'ALLOCATED', -- FREE, ALLOCATED, RESERVED, DHCP_DYNAMIC, STALE
    discovered_by       VARCHAR(30) NOT NULL DEFAULT 'MANUAL_SRE', -- AGENT_OSC_AUTO, SNMP_MN03, MANUAL_SRE
    last_ping_at        TIMESTAMPTZ NULL,
    notes               TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ip_allocation_subnet_ip UNIQUE (subnet_id, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_trx_ip_alloc_subnet ON trx_ip_allocation(subnet_id);
CREATE INDEX IF NOT EXISTS idx_trx_ip_alloc_ip ON trx_ip_allocation(ip_address);

-- ==============================================================================
-- 6. GROUP AM: ASSET MANAGEMENT & DCIM
-- ==============================================================================

-- AM01: Physical Asset Custody & Location Assignment (trx_asset_assignment)
CREATE TABLE IF NOT EXISTS trx_asset_assignment (
    assignment_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id            UUID NOT NULL REFERENCES dat_asset(asset_id) ON DELETE CASCADE,
    assigned_to_user    UUID NULL REFERENCES dat_user(user_id) ON DELETE SET NULL,
    assigned_to_store   UUID NULL REFERENCES dat_store(store_id) ON DELETE SET NULL,
    assigned_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    returned_date       DATE NULL,
    notes               TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AM01: Hardware Maintenance & Repair History (trx_asset_maintenance)
CREATE TABLE IF NOT EXISTS trx_asset_maintenance (
    maintenance_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id            UUID NOT NULL REFERENCES dat_asset(asset_id) ON DELETE CASCADE,
    vendor_id           UUID REFERENCES dat_vendor(vendor_id) ON DELETE SET NULL,
    maintenance_type    VARCHAR(30) NOT NULL DEFAULT 'REPAIR', -- PREVENTIVE, REPAIR, UPGRADE
    cost_amount         NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    performed_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    description         TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AM01: Asset Purchase Orders (trx_asset_po)
CREATE TABLE IF NOT EXISTS trx_asset_po (
    po_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id           UUID NOT NULL REFERENCES dat_vendor(vendor_id) ON DELETE RESTRICT,
    po_number           VARCHAR(50) NOT NULL UNIQUE,
    total_amount        NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    status              VARCHAR(20) NOT NULL DEFAULT 'ISSUED', -- DRAFT, ISSUED, RECEIVED, CANCELLED
    po_date             DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AM02: 42U Rack Unit Assignment (trx_rack_unit_assignment)
CREATE TABLE IF NOT EXISTS trx_rack_unit_assignment (
    assignment_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rack_id             UUID NOT NULL REFERENCES dat_rack_frame(rack_id) ON DELETE CASCADE,
    asset_id            UUID NOT NULL REFERENCES dat_asset(asset_id) ON DELETE CASCADE,
    start_u_position    INT NOT NULL CHECK (start_u_position BETWEEN 1 AND 42),
    u_height            INT NOT NULL DEFAULT 1 CHECK (u_height BETWEEN 1 AND 42),
    front_or_rear       VARCHAR(10) NOT NULL DEFAULT 'FRONT', -- FRONT, REAR, BOTH
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_rack_asset UNIQUE (rack_id, asset_id)
);

-- AM02: PDU Power Port Assignments (trx_rack_pdu_port)
CREATE TABLE IF NOT EXISTS trx_rack_pdu_port (
    port_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rack_id             UUID NOT NULL REFERENCES dat_rack_frame(rack_id) ON DELETE CASCADE,
    asset_id            UUID NOT NULL REFERENCES dat_asset(asset_id) ON DELETE CASCADE,
    pdu_name            VARCHAR(30) NOT NULL DEFAULT 'PDU-A',
    port_number         INT NOT NULL,
    voltage_v           INT NOT NULL DEFAULT 220,
    current_amp         NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 7. GROUP SD: SERVICE DESK & INCIDENTS
-- ==============================================================================

-- SD01: Incident Ticketing (trx_ticket_issue)
CREATE TABLE IF NOT EXISTS trx_ticket_issue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number       VARCHAR(30) NOT NULL UNIQUE,
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    area_id             UUID NULL REFERENCES dat_area(area_id) ON DELETE SET NULL,
    store_id            UUID NULL REFERENCES dat_store(store_id) ON DELETE SET NULL,
    reporter_id         UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE RESTRICT,
    assignee_id         UUID NULL REFERENCES dat_user(user_id) ON DELETE SET NULL,
    category_id         UUID NULL REFERENCES dat_ticket_category(category_id) ON DELETE SET NULL,
    title               VARCHAR(200) NOT NULL,
    description         TEXT NOT NULL,
    priority            VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, URGENT
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, PENDING_VENDOR, RESOLVED, CLOSED
    sla_due_at          TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at         TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_trx_ticket_number ON trx_ticket_issue(ticket_number);
CREATE INDEX IF NOT EXISTS idx_trx_ticket_company ON trx_ticket_issue(company_id);
CREATE INDEX IF NOT EXISTS idx_trx_ticket_status ON trx_ticket_issue(status);

-- SD01: Ticket Discussion Comments (trx_ticket_comment)
CREATE TABLE IF NOT EXISTS trx_ticket_comment (
    comment_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL REFERENCES trx_ticket_issue(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE RESTRICT,
    comment_text        TEXT NOT NULL,
    is_internal_note    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trx_comment_ticket ON trx_ticket_comment(ticket_id);

-- SD01: Ticket File Attachments (trx_ticket_attachment)
CREATE TABLE IF NOT EXISTS trx_ticket_attachment (
    attachment_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL REFERENCES trx_ticket_issue(id) ON DELETE CASCADE,
    file_name           VARCHAR(255) NOT NULL,
    file_path           TEXT NOT NULL,
    file_size_bytes     BIGINT NOT NULL,
    uploaded_by         UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SD02: Ticket SLA Timers & Tracker (trx_ticket_sla_tracker)
CREATE TABLE IF NOT EXISTS trx_ticket_sla_tracker (
    tracker_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL REFERENCES trx_ticket_issue(id) ON DELETE CASCADE,
    policy_id           UUID NOT NULL REFERENCES dat_sla_policy(sla_id) ON DELETE RESTRICT,
    response_due_at     TIMESTAMPTZ NOT NULL,
    resolution_due_at   TIMESTAMPTZ NOT NULL,
    is_response_breached BOOLEAN NOT NULL DEFAULT FALSE,
    is_resolution_breached BOOLEAN NOT NULL DEFAULT FALSE,
    escalation_level    INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ticket_sla UNIQUE (ticket_id)
);

-- SD02: Ticket Change Audit History (trx_ticket_history)
CREATE TABLE IF NOT EXISTS trx_ticket_history (
    history_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL REFERENCES trx_ticket_issue(id) ON DELETE CASCADE,
    changed_by          UUID NOT NULL REFERENCES dat_user(user_id) ON DELETE RESTRICT,
    field_changed       VARCHAR(50) NOT NULL,
    old_value           TEXT NULL,
    new_value           TEXT NULL,
    changed_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 8. GROUP AG: AI GATEWAY & AUTOMATION
-- ==============================================================================

-- AG01: Active AI Agent MCP Sessions (trx_mcp_session)
CREATE TABLE IF NOT EXISTS trx_mcp_session (
    session_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL REFERENCES dat_mcp_client(client_id) ON DELETE CASCADE,
    connection_type     VARCHAR(10) NOT NULL DEFAULT 'WEBSOCKET', -- WEBSOCKET, SSE
    session_status      VARCHAR(20) NOT NULL DEFAULT 'CONNECTED',
    connected_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disconnected_at     TIMESTAMPTZ NULL
);

-- AG02: AI Work Log Registry (trx_ai_work_log)
CREATE TABLE IF NOT EXISTS trx_ai_work_log (
    log_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            UUID NOT NULL REFERENCES dat_ai_agent_profile(agent_id) ON DELETE CASCADE,
    company_id          UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    micro_prompt_code   VARCHAR(50) NOT NULL, -- e.g. 'MP-20261125-CM01-01'
    doc_path            TEXT NOT NULL,        -- e.g. 'osc_note/20261125-CM01-01.md'
    task_title          VARCHAR(200) NOT NULL,
    deliverable_files   TEXT[] NULL,
    directus_item_id    VARCHAR(64) NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AG02: Directus CMS Queue Manager (trx_directus_sync_queue)
CREATE TABLE IF NOT EXISTS trx_directus_sync_queue (
    queue_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_id              UUID NOT NULL REFERENCES trx_ai_work_log(log_id) ON DELETE CASCADE,
    sync_status         VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, SYNCED, FAILED
    retry_count         INT NOT NULL DEFAULT 0,
    last_error_msg      TEXT NULL,
    next_retry_at       TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    synced_at           TIMESTAMPTZ NULL
);

-- ==============================================================================
-- 9. ANALYTICS & EXECUTIVE SUMMARY AGGREGATIONS
-- ==============================================================================

-- Daily Aggregation Summary (trx_summary_daily)
CREATE TABLE IF NOT EXISTS trx_summary_daily (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_date          DATE NOT NULL,
    company_id            UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    area_id               UUID NULL REFERENCES dat_area(area_id) ON DELETE CASCADE,
    server_id             UUID NULL REFERENCES dat_server(server_id) ON DELETE CASCADE,
    total_logins          INT NOT NULL DEFAULT 0,
    hris_recovery_logins  INT NOT NULL DEFAULT 0,
    total_alerts_critical INT NOT NULL DEFAULT 0,
    total_alerts_warning  INT NOT NULL DEFAULT 0,
    avg_cpu_usage         NUMERIC(5,2) DEFAULT 0.00,
    avg_memory_usage      NUMERIC(5,2) DEFAULT 0.00,
    uptime_percentage     NUMERIC(5,2) DEFAULT 100.00,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_summary_daily UNIQUE (summary_date, company_id, area_id, server_id)
);

CREATE INDEX IF NOT EXISTS idx_trx_summary_daily_date ON trx_summary_daily(summary_date DESC);

-- Monthly Executive Aggregation Summary (trx_summary_monthly)
CREATE TABLE IF NOT EXISTS trx_summary_monthly (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_year                INT NOT NULL,
    summary_month               INT NOT NULL CHECK (summary_month BETWEEN 1 AND 12),
    company_id                  UUID NOT NULL REFERENCES dat_company(company_id) ON DELETE CASCADE,
    area_id                     UUID NULL REFERENCES dat_area(area_id) ON DELETE CASCADE,
    total_tickets_created       INT NOT NULL DEFAULT 0,
    total_tickets_resolved      INT NOT NULL DEFAULT 0,
    sla_compliance_pct          NUMERIC(5,2) DEFAULT 100.00,
    system_availability_pct     NUMERIC(5,2) DEFAULT 100.00,
    total_hris_downtime_minutes INT NOT NULL DEFAULT 0,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_summary_monthly UNIQUE (summary_year, summary_month, company_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_trx_summary_monthly_period ON trx_summary_monthly(summary_year DESC, summary_month DESC);

-- Automatic Updated At Trigger Function
CREATE OR REPLACE FUNCTION trg_set_trx_updated_at()
RETURNS TRIGGER AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- Apply Triggers for Updated At
CREATE TRIGGER set_updated_at_trx_container_stack BEFORE UPDATE ON trx_container_stack FOR EACH ROW EXECUTE FUNCTION trg_set_trx_updated_at();
CREATE TRIGGER set_updated_at_trx_container_service BEFORE UPDATE ON trx_container_service FOR EACH ROW EXECUTE FUNCTION trg_set_trx_updated_at();
CREATE TRIGGER set_updated_at_trx_ip_allocation BEFORE UPDATE ON trx_ip_allocation FOR EACH ROW EXECUTE FUNCTION trg_set_trx_updated_at();
CREATE TRIGGER set_updated_at_trx_ticket_issue BEFORE UPDATE ON trx_ticket_issue FOR EACH ROW EXECUTE FUNCTION trg_set_trx_updated_at();
