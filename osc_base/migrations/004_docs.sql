-- 004_docs.sql
-- Transaksi domain, metadata storage, inventaris agent, pelaporan, dan jejak audit.

CREATE TABLE public.osc_sop_document (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        uuid NOT NULL,
    area_id           uuid,
    document_code     varchar(64) NOT NULL,
    title             varchar(240) NOT NULL,
    markdown_content  text NOT NULL DEFAULT '',
    approval_status   varchar(16) NOT NULL DEFAULT 'DRAFT',
    rustfs_object_key text,
    created_by        uuid NOT NULL,
    approved_by       uuid,
    approved_at       timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_sop_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_sop_area_company_fk
        FOREIGN KEY (area_id, company_id)
        REFERENCES public.osc_area (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_sop_created_by_fk
        FOREIGN KEY (created_by) REFERENCES public.osc_user (id) ON DELETE RESTRICT,
    CONSTRAINT osc_sop_approved_by_fk
        FOREIGN KEY (approved_by) REFERENCES public.osc_user (id) ON DELETE RESTRICT,
    CONSTRAINT osc_sop_company_code_key UNIQUE (company_id, document_code),
    CONSTRAINT osc_sop_approval_status_check
        CHECK (approval_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED')),
    CONSTRAINT osc_sop_approval_fields_check
        CHECK (
            (approval_status = 'APPROVED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
            OR
            (approval_status <> 'APPROVED' AND approved_at IS NULL AND approved_by IS NULL)
        )
);

CREATE INDEX osc_sop_scope_status_idx
    ON public.osc_sop_document (company_id, area_id, approval_status, updated_at DESC);

CREATE TABLE public.osc_pam_target (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     uuid NOT NULL,
    area_id        uuid NOT NULL,
    target_code    varchar(64) NOT NULL,
    display_name   varchar(160) NOT NULL,
    hostname       varchar(255) NOT NULL,
    port           integer NOT NULL,
    protocol       varchar(16) NOT NULL,
    credential_ref varchar(512),
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_pam_target_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_pam_target_area_company_fk
        FOREIGN KEY (area_id, company_id)
        REFERENCES public.osc_area (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_pam_target_company_code_key UNIQUE (company_id, target_code),
    CONSTRAINT osc_pam_target_id_scope_key UNIQUE (id, company_id, area_id),
    CONSTRAINT osc_pam_target_port_check CHECK (port BETWEEN 1 AND 65535),
    CONSTRAINT osc_pam_target_protocol_check CHECK (protocol IN ('SSH', 'RDP', 'HTTPS'))
);

CREATE INDEX osc_pam_target_scope_active_idx
    ON public.osc_pam_target (company_id, area_id, is_active);

CREATE TABLE public.osc_pam_session (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     uuid NOT NULL,
    area_id        uuid NOT NULL,
    target_id      uuid NOT NULL,
    user_id        uuid NOT NULL,
    state          varchar(16) NOT NULL DEFAULT 'AUTHORIZED',
    requested_reason text NOT NULL,
    authorized_at  timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,
    closed_at      timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_pam_session_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_pam_session_area_company_fk
        FOREIGN KEY (area_id, company_id)
        REFERENCES public.osc_area (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_pam_session_target_scope_fk
        FOREIGN KEY (target_id, company_id, area_id)
        REFERENCES public.osc_pam_target (id, company_id, area_id) ON DELETE RESTRICT,
    CONSTRAINT osc_pam_session_user_fk
        FOREIGN KEY (user_id) REFERENCES public.osc_user (id) ON DELETE RESTRICT,
    CONSTRAINT osc_pam_session_state_check
        CHECK (state IN ('AUTHORIZED', 'ACTIVE', 'CLOSED', 'EXPIRED', 'REVOKED')),
    CONSTRAINT osc_pam_session_expiry_check CHECK (expires_at > authorized_at),
    CONSTRAINT osc_pam_session_closed_check
        CHECK ((state IN ('CLOSED', 'REVOKED', 'EXPIRED')) = (closed_at IS NOT NULL))
);

CREATE INDEX osc_pam_session_scope_user_idx
    ON public.osc_pam_session (company_id, area_id, user_id, created_at DESC);
CREATE INDEX osc_pam_session_expiry_idx
    ON public.osc_pam_session (state, expires_at);

CREATE TABLE public.osc_agent_node (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     uuid NOT NULL,
    area_id        uuid NOT NULL,
    store_id       uuid NOT NULL,
    node_code      varchar(96) NOT NULL,
    display_name   varchar(160) NOT NULL,
    platform       varchar(32) NOT NULL,
    agent_version  varchar(64),
    last_heartbeat_at timestamptz,
    status         varchar(16) NOT NULL DEFAULT 'PENDING',
    credential_ref varchar(512),
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_agent_node_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_agent_node_area_company_fk
        FOREIGN KEY (area_id, company_id)
        REFERENCES public.osc_area (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_agent_node_store_scope_fk
        FOREIGN KEY (store_id, company_id, area_id)
        REFERENCES public.osc_store (id, company_id, area_id) ON DELETE RESTRICT,
    CONSTRAINT osc_agent_node_scope_code_key UNIQUE (company_id, store_id, node_code),
    CONSTRAINT osc_agent_node_status_check
        CHECK (status IN ('PENDING', 'ONLINE', 'STALE', 'DISABLED')),
    CONSTRAINT osc_agent_node_platform_check
        CHECK (platform IN ('WINDOWS', 'LINUX', 'UBUNTU'))
);

CREATE INDEX osc_agent_node_store_status_idx
    ON public.osc_agent_node (company_id, area_id, store_id, status);
CREATE INDEX osc_agent_node_heartbeat_idx
    ON public.osc_agent_node (last_heartbeat_at);

CREATE TABLE public.osc_report_template (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     uuid NOT NULL,
    area_id        uuid,
    template_code  varchar(64) NOT NULL,
    report_name    varchar(180) NOT NULL,
    report_format  varchar(8) NOT NULL,
    definition     jsonb NOT NULL DEFAULT '{}'::jsonb,
    rustfs_object_key text,
    is_active      boolean NOT NULL DEFAULT true,
    created_by     uuid NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_report_template_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_report_template_area_company_fk
        FOREIGN KEY (area_id, company_id)
        REFERENCES public.osc_area (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_report_template_created_by_fk
        FOREIGN KEY (created_by) REFERENCES public.osc_user (id) ON DELETE RESTRICT,
    CONSTRAINT osc_report_template_scope_code_key UNIQUE NULLS NOT DISTINCT (company_id, area_id, template_code),
    CONSTRAINT osc_report_template_format_check CHECK (report_format IN ('XLSX', 'PDF')),
    CONSTRAINT osc_report_template_definition_check CHECK (jsonb_typeof(definition) = 'object')
);

CREATE INDEX osc_report_template_scope_active_idx
    ON public.osc_report_template (company_id, area_id, is_active);

CREATE TABLE public.osc_activity_log (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at    timestamptz NOT NULL DEFAULT now(),
    company_id     uuid NOT NULL,
    area_id        uuid,
    actor_user_id  uuid,
    actor_agent_id uuid,
    action         varchar(96) NOT NULL,
    target_type    varchar(96),
    target_id      text,
    outcome        varchar(16) NOT NULL DEFAULT 'SUCCESS',
    request_id     varchar(128),
    source_ip      inet,
    details        jsonb NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT osc_activity_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_activity_area_company_fk
        FOREIGN KEY (area_id, company_id)
        REFERENCES public.osc_area (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_activity_actor_user_fk
        FOREIGN KEY (actor_user_id) REFERENCES public.osc_user (id) ON DELETE RESTRICT,
    CONSTRAINT osc_activity_actor_agent_fk
        FOREIGN KEY (actor_agent_id) REFERENCES public.osc_agent_node (id) ON DELETE RESTRICT,
    CONSTRAINT osc_activity_actor_check
        CHECK (num_nonnulls(actor_user_id, actor_agent_id) <= 1),
    CONSTRAINT osc_activity_outcome_check
        CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILURE')),
    CONSTRAINT osc_activity_details_object_check CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX osc_activity_scope_time_idx
    ON public.osc_activity_log (company_id, area_id, occurred_at DESC);
CREATE INDEX osc_activity_actor_time_idx
    ON public.osc_activity_log (actor_user_id, occurred_at DESC)
    WHERE actor_user_id IS NOT NULL;
CREATE INDEX osc_activity_action_time_idx
    ON public.osc_activity_log (action, occurred_at DESC);
CREATE INDEX osc_activity_request_id_idx
    ON public.osc_activity_log (request_id)
    WHERE request_id IS NOT NULL;

CREATE FUNCTION public.osc_reject_activity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
    RAISE EXCEPTION 'osc_activity_log is append-only; % is prohibited', TG_OP
        USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER osc_activity_log_no_update_delete
    BEFORE UPDATE OR DELETE ON public.osc_activity_log
    FOR EACH ROW EXECUTE FUNCTION public.osc_reject_activity_mutation();

CREATE TRIGGER osc_activity_log_no_truncate
    BEFORE TRUNCATE ON public.osc_activity_log
    FOR EACH STATEMENT EXECUTE FUNCTION public.osc_reject_activity_mutation();

COMMENT ON TABLE public.osc_activity_log IS
    'Jejak audit append-only. Role aplikasi runtime tidak boleh memiliki tabel ini atau mendapat hak TRUNCATE/menonaktifkan trigger.';
COMMENT ON COLUMN public.osc_activity_log.details IS
    'Hanya metadata terstruktur yang telah disamarkan; jangan sertakan kata sandi, OTP, backup code, token, atau nilai URL kredensial HRIS.';
COMMENT ON COLUMN public.osc_agent_node.credential_ref IS
    'Referensi opaque ke kredensial per node yang dikelola secara eksternal; jangan simpan secret mentah di sini.';
COMMENT ON COLUMN public.osc_pam_target.credential_ref IS
    'Referensi opaque ke entri secret vault; jangan pernah simpan kata sandi target atau private key di tabel ini.';
