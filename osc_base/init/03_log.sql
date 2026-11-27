-- ==============================================================================
-- OmniSight (OSC) — Master Log & Telemetry Schema (log_*)
-- Database Target : PostgreSQL 18+ (osc_base)
-- Naming Rules    : log_* (Partitioned Range Tables for Audit, Telemetry & Security)
-- File Location   : osc_base/init/03_log.sql
-- ==============================================================================

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SET timezone = 'UTC';

-- ==============================================================================
-- 1. GROUP CM: IDENTITY, AUTH & GOVERNANCE LOGS
-- ==============================================================================

-- A. HRIS Authentication & Fallback Audit Log (CM01)
CREATE TABLE IF NOT EXISTS log_hris_auth_sync (
    id                  UUID DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL,
    user_id             UUID,
    username            VARCHAR(100) NOT NULL,
    auth_source         VARCHAR(30) NOT NULL, -- HRIS_PRIMARY, FALLBACK_RECOVERY, LOCAL_PASS
    hris_status         VARCHAR(30) NOT NULL, -- SUCCESS, INVALID_PASS, TIMEOUT, HTTP_ERROR, PARSE_ERROR
    response_code       INT,
    latency_ms          INT,
    raw_response_xml    TEXT,
    ip_address          INET,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_hris_company ON log_hris_auth_sync(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_hris_source ON log_hris_auth_sync(auth_source);

-- B. System Auth Session Events (CM01 & CM02)
CREATE TABLE IF NOT EXISTS log_auth_event (
    id                  UUID DEFAULT gen_random_uuid(),
    user_id             UUID,
    username            VARCHAR(100) NOT NULL,
    company_id          UUID,
    event_type          VARCHAR(30) NOT NULL, -- LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, MFA_VERIFIED, RECOVERY_USED
    failure_reason      VARCHAR(100),
    ip_address          INET NOT NULL,
    user_agent          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_auth_user ON log_auth_event(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_auth_type ON log_auth_event(event_type);

-- ==============================================================================
-- 2. GROUP CT: CONTAINER ENGINE LOGS
-- ==============================================================================

-- A. Dangerous Command TTY Audit Log (CT02)
CREATE TABLE IF NOT EXISTS log_container_exec_audit (
    id                  UUID DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL,
    container_id        VARCHAR(64) NOT NULL,
    container_name      VARCHAR(100) NOT NULL,
    user_id             UUID NOT NULL,
    username            VARCHAR(100) NOT NULL,
    executed_command    TEXT NOT NULL,
    is_flagged_danger   BOOLEAN NOT NULL DEFAULT FALSE,
    danger_reason       VARCHAR(100),
    ip_address          INET,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_container_exec_session ON log_container_exec_audit(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_container_exec_danger ON log_container_exec_audit(is_flagged_danger);

-- B. Docker Stack Lifecycle Events (CT01)
CREATE TABLE IF NOT EXISTS log_container_stack_event (
    id                  UUID DEFAULT gen_random_uuid(),
    stack_name          VARCHAR(100) NOT NULL,
    action              VARCHAR(30) NOT NULL, -- DEPLOY, RESTART, STOP, REMOVE, PRUNE
    status              VARCHAR(20) NOT NULL, -- SUCCESS, FAILED, ROLLBACK
    triggered_by        UUID,
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_stack_event_name ON log_container_stack_event(stack_name, created_at DESC);

-- ==============================================================================
-- 3. GROUP MN: MONITORING & TELEMETRY LOGS
-- ==============================================================================

-- A. Agent Infrastructure Telemetry (MN01)
CREATE TABLE IF NOT EXISTS log_agent_telemetry (
    id                  UUID DEFAULT gen_random_uuid(),
    server_id           UUID NOT NULL,
    cpu_usage_pct       NUMERIC(5,2) NOT NULL,
    mem_used_bytes      BIGINT NOT NULL,
    mem_total_bytes     BIGINT NOT NULL,
    disk_used_pct       NUMERIC(5,2) NOT NULL,
    network_rx_bytes    BIGINT NOT NULL DEFAULT 0,
    network_tx_bytes    BIGINT NOT NULL DEFAULT 0,
    process_count       INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_telemetry_server ON log_agent_telemetry(server_id, created_at DESC);

-- B. Agent Process Top CPU/Memory Snapshot (MN01)
CREATE TABLE IF NOT EXISTS log_agent_process_top (
    id                  UUID DEFAULT gen_random_uuid(),
    server_id           UUID NOT NULL,
    pid                 INT NOT NULL,
    process_name        VARCHAR(150) NOT NULL,
    cpu_pct             NUMERIC(5,2) NOT NULL,
    mem_pct             NUMERIC(5,2) NOT NULL,
    command_line        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_process_top_server ON log_agent_process_top(server_id, created_at DESC);

-- C. Synthetic Probe Execution Log (MN02)
CREATE TABLE IF NOT EXISTS log_uptime_check (
    id                  UUID DEFAULT gen_random_uuid(),
    target_id           UUID NOT NULL,
    check_type          VARCHAR(20) NOT NULL, -- HTTP, HTTPS, TCP, ICMP_PING, DNS
    status              VARCHAR(20) NOT NULL, -- UP, DOWN, TIMEOUT, CERT_WARNING, CERT_CRITICAL
    response_time_ms    INT NOT NULL,
    http_status_code    INT,
    ssl_days_remaining  INT,
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_uptime_target ON log_uptime_check(target_id, created_at DESC);

-- D. SNMP Network Device Telemetry Log (MN03)
CREATE TABLE IF NOT EXISTS log_snmp_telemetry (
    id                  UUID DEFAULT gen_random_uuid(),
    device_id           UUID NOT NULL,
    oid                 VARCHAR(100) NOT NULL,
    oid_name            VARCHAR(100),
    metric_value        NUMERIC(14,4) NOT NULL,
    unit                VARCHAR(20),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_snmp_device ON log_snmp_telemetry(device_id, created_at DESC);

-- E. Alert Notification Dispatch Log (MN04)
CREATE TABLE IF NOT EXISTS log_alert_dispatch (
    id                  UUID DEFAULT gen_random_uuid(),
    alert_history_id    UUID NOT NULL,
    channel_type        VARCHAR(30) NOT NULL, -- TELEGRAM, SLACK, EMAIL, WEBHOOK
    target_destination  VARCHAR(150) NOT NULL,
    dispatch_status     VARCHAR(20) NOT NULL, -- SENT, FAILED, RETRIED
    http_response_code  INT,
    error_details       TEXT,
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, sent_at)
) PARTITION BY RANGE (sent_at);

CREATE INDEX IF NOT EXISTS idx_log_alert_dispatch_alert ON log_alert_dispatch(alert_history_id, sent_at DESC);

-- ==============================================================================
-- 4. GROUP SE: SECOPS, SIEM & PAM LOGS
-- ==============================================================================

-- A. WAF Threat & Security Guard Log (SE02)
CREATE TABLE IF NOT EXISTS log_security_guard (
    id                  UUID DEFAULT gen_random_uuid(),
    event_type          VARCHAR(50) NOT NULL, -- SQLI_ATTEMPT, XXE_ATTEMPT, BRUTE_FORCE, PATH_TRAVERSAL
    severity            VARCHAR(20) NOT NULL DEFAULT 'HIGH', -- LOW, MEDIUM, HIGH, CRITICAL
    source_ip           INET NOT NULL,
    user_agent          TEXT,
    request_uri         TEXT,
    payload_dump        TEXT,
    action_taken        VARCHAR(30) NOT NULL DEFAULT 'BLOCKED', -- BLOCKED, FLAGGED, LOGGED
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_security_ip ON log_security_guard(source_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_security_type ON log_security_guard(event_type);

-- B. SIEM Ingest Event Log (SE02 - Wazuh Integration)
CREATE TABLE IF NOT EXISTS log_siem_event (
    id                  UUID DEFAULT gen_random_uuid(),
    agent_id            VARCHAR(50) NOT NULL,
    rule_id             VARCHAR(50) NOT NULL,
    rule_level          INT NOT NULL,
    rule_description    TEXT NOT NULL,
    full_log            TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_siem_rule ON log_siem_event(rule_id, created_at DESC);

-- C. PAM Bastion Session Access Log (SE01)
CREATE TABLE IF NOT EXISTS log_pam_access (
    id                  UUID DEFAULT gen_random_uuid(),
    pam_session_id      UUID NOT NULL,
    user_id             UUID NOT NULL,
    target_host         INET NOT NULL,
    target_protocol     VARCHAR(10) NOT NULL, -- SSH, RDP, VNC
    connection_status   VARCHAR(20) NOT NULL, -- CONNECTED, DISCONNECTED, REJECTED
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_pam_access_user ON log_pam_access(user_id, created_at DESC);

-- D. PAM Interactive Terminal Command Keylogger Audit (SE01)
CREATE TABLE IF NOT EXISTS log_pam_command_audit (
    id                  UUID DEFAULT gen_random_uuid(),
    pam_session_id      UUID NOT NULL,
    command_text        TEXT NOT NULL,
    is_blocked          BOOLEAN NOT NULL DEFAULT FALSE,
    blocked_rule        VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_pam_command_session ON log_pam_command_audit(pam_session_id, created_at DESC);

-- ==============================================================================
-- 5. GROUP AM, SD & AG LOGS
-- ==============================================================================

-- A. Store CMDB & Hardware Mutation Audit (AM01 / AM03)
CREATE TABLE IF NOT EXISTS log_store_asset_audit (
    id                  UUID DEFAULT gen_random_uuid(),
    store_id            UUID NOT NULL,
    asset_type          VARCHAR(50) NOT NULL, -- POS, TELEPHONY, EDC, DIGISIGN, ACCOUNT
    action_type         VARCHAR(30) NOT NULL, -- INSERT, UPDATE, DELETE, REPLACEMENT
    modified_by         UUID,
    old_data            JSONB,
    new_data            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_store_asset_store ON log_store_asset_audit(store_id, created_at DESC);

-- B. Physical Asset Transfer & Repair Audit Log (AM01)
CREATE TABLE IF NOT EXISTS log_asset_movement (
    id                  UUID DEFAULT gen_random_uuid(),
    asset_id            UUID NOT NULL,
    from_location       VARCHAR(100),
    to_location         VARCHAR(100),
    movement_reason     TEXT,
    moved_by            UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_asset_movement_asset ON log_asset_movement(asset_id, created_at DESC);

-- C. Data Center Rack Power & Temp Audit (AM02)
CREATE TABLE IF NOT EXISTS log_rack_power_audit (
    id                  UUID DEFAULT gen_random_uuid(),
    rack_id             UUID NOT NULL,
    power_watts         NUMERIC(8,2) NOT NULL,
    temperature_c       NUMERIC(4,1) NOT NULL,
    humidity_pct        NUMERIC(4,1),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_rack_power ON log_rack_power_audit(rack_id, created_at DESC);

-- D. SLA Breach Audit Log (SD02)
CREATE TABLE IF NOT EXISTS log_sla_breach_audit (
    id                  UUID DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL,
    breach_type         VARCHAR(30) NOT NULL, -- RESPONSE_BREACH, RESOLUTION_BREACH
    breach_duration_min INT NOT NULL,
    escalated_to        UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_sla_breach_ticket ON log_sla_breach_audit(ticket_id, created_at DESC);

-- E. AI MCP Tool Execution Audit (AG01)
CREATE TABLE IF NOT EXISTS log_mcp_execution (
    id                  UUID DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL,
    tool_name           VARCHAR(100) NOT NULL,
    input_params        JSONB,
    execution_result    TEXT,
    latency_ms          INT NOT NULL,
    is_blocked          BOOLEAN NOT NULL DEFAULT FALSE,
    block_reason        VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_mcp_client ON log_mcp_execution(client_id, created_at DESC);

-- F. AI Token Consumption Audit (AG02)
CREATE TABLE IF NOT EXISTS log_ai_execution_audit (
    id                  UUID DEFAULT gen_random_uuid(),
    agent_code          VARCHAR(30) NOT NULL, -- ai-main, ai-rest, ai-site, ai-auto, ai-docs
    task_code           VARCHAR(50) NOT NULL,
    prompt_tokens       INT NOT NULL DEFAULT 0,
    completion_tokens   INT NOT NULL DEFAULT 0,
    total_tokens        INT NOT NULL DEFAULT 0,
    latency_ms          INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_ai_agent ON log_ai_execution_audit(agent_code, created_at DESC);

-- G. System Application Event Log (Global)
CREATE TABLE IF NOT EXISTS log_system_event (
    id                  UUID DEFAULT gen_random_uuid(),
    subsystem           VARCHAR(50) NOT NULL, -- osc_rest, osc_site, osc_auto, osc_base, osc_docs
    log_level           VARCHAR(10) NOT NULL DEFAULT 'INFO', -- DEBUG, INFO, WARN, ERROR, FATAL
    message             TEXT NOT NULL,
    stack_trace         TEXT,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_log_system_subsystem ON log_system_event(subsystem, created_at DESC);

-- ==============================================================================
-- 6. DEFAULT PARTITIONS SETUP
-- ==============================================================================

CREATE TABLE IF NOT EXISTS log_hris_auth_sync_default PARTITION OF log_hris_auth_sync DEFAULT;
CREATE TABLE IF NOT EXISTS log_auth_event_default PARTITION OF log_auth_event DEFAULT;
CREATE TABLE IF NOT EXISTS log_container_exec_audit_default PARTITION OF log_container_exec_audit DEFAULT;
CREATE TABLE IF NOT EXISTS log_container_stack_event_default PARTITION OF log_container_stack_event DEFAULT;
CREATE TABLE IF NOT EXISTS log_agent_telemetry_default PARTITION OF log_agent_telemetry DEFAULT;
CREATE TABLE IF NOT EXISTS log_agent_process_top_default PARTITION OF log_agent_process_top DEFAULT;
CREATE TABLE IF NOT EXISTS log_uptime_check_default PARTITION OF log_uptime_check DEFAULT;
CREATE TABLE IF NOT EXISTS log_snmp_telemetry_default PARTITION OF log_snmp_telemetry DEFAULT;
CREATE TABLE IF NOT EXISTS log_alert_dispatch_default PARTITION OF log_alert_dispatch DEFAULT;
CREATE TABLE IF NOT EXISTS log_security_guard_default PARTITION OF log_security_guard DEFAULT;
CREATE TABLE IF NOT EXISTS log_siem_event_default PARTITION OF log_siem_event DEFAULT;
CREATE TABLE IF NOT EXISTS log_pam_access_default PARTITION OF log_pam_access DEFAULT;
CREATE TABLE IF NOT EXISTS log_pam_command_audit_default PARTITION OF log_pam_command_audit DEFAULT;
CREATE TABLE IF NOT EXISTS log_store_asset_audit_default PARTITION OF log_store_asset_audit DEFAULT;
CREATE TABLE IF NOT EXISTS log_asset_movement_default PARTITION OF log_asset_movement DEFAULT;
CREATE TABLE IF NOT EXISTS log_rack_power_audit_default PARTITION OF log_rack_power_audit DEFAULT;
CREATE TABLE IF NOT EXISTS log_sla_breach_audit_default PARTITION OF log_sla_breach_audit DEFAULT;
CREATE TABLE IF NOT EXISTS log_mcp_execution_default PARTITION OF log_mcp_execution DEFAULT;
CREATE TABLE IF NOT EXISTS log_ai_execution_audit_default PARTITION OF log_ai_execution_audit DEFAULT;
CREATE TABLE IF NOT EXISTS log_system_event_default PARTITION OF log_system_event DEFAULT;

-- ==============================================================================
-- 7. MONTHLY RANGE PARTITIONS (2026-11, 2026-12, 2027-01)
-- ==============================================================================

-- 2026-11
CREATE TABLE IF NOT EXISTS log_agent_telemetry_y2026m11 PARTITION OF log_agent_telemetry FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS log_hris_auth_sync_y2026m11 PARTITION OF log_hris_auth_sync FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS log_security_guard_y2026m11 PARTITION OF log_security_guard FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS log_system_event_y2026m11 PARTITION OF log_system_event FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

-- 2026-12
CREATE TABLE IF NOT EXISTS log_agent_telemetry_y2026m12 PARTITION OF log_agent_telemetry FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS log_hris_auth_sync_y2026m12 PARTITION OF log_hris_auth_sync FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS log_security_guard_y2026m12 PARTITION OF log_security_guard FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS log_system_event_y2026m12 PARTITION OF log_system_event FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- 2027-01
CREATE TABLE IF NOT EXISTS log_agent_telemetry_y2027m01 PARTITION OF log_agent_telemetry FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS log_hris_auth_sync_y2027m01 PARTITION OF log_hris_auth_sync FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS log_security_guard_y2027m01 PARTITION OF log_security_guard FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS log_system_event_y2027m01 PARTITION OF log_system_event FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');