-- 001_init_core.sql
-- Bootstrap PostgreSQL 18, atau upgrade setelah rantai historis 001_apps–007_report_archive.
BEGIN;

DO $upgrade$
BEGIN
    IF to_regclass('public.osc_company_menu_entitlement') IS NULL
       AND to_regclass('public.osc_role_menu') IS NOT NULL THEN
        ALTER TABLE public.osc_company_menu RENAME TO osc_company_menu_entitlement;
        ALTER TABLE public.osc_role_menu RENAME TO osc_company_menu;
        ALTER TABLE public.osc_company_menu RENAME COLUMN module_code TO menu_code;

        ALTER TABLE public.osc_area RENAME COLUMN area_code TO code;
        ALTER TABLE public.osc_area RENAME COLUMN area_name TO name;
        ALTER TABLE public.osc_store RENAME COLUMN store_code TO code;
        ALTER TABLE public.osc_store RENAME COLUMN store_name TO name;
        ALTER TABLE public.osc_menu RENAME COLUMN module_code TO code;
        ALTER TABLE public.osc_menu RENAME COLUMN module_name TO title;
        ALTER TABLE public.osc_menu RENAME COLUMN display_order TO sort_order;
        ALTER TABLE public.osc_agent_node RENAME COLUMN platform TO os_type;
        ALTER TABLE public.osc_agent_node RENAME COLUMN last_heartbeat_at TO last_seen_at;

        ALTER TABLE public.osc_user
            ADD COLUMN company_id uuid REFERENCES public.osc_company (id) ON DELETE RESTRICT;
        ALTER TABLE public.osc_menu
            ADD COLUMN route_path text,
            ADD COLUMN icon text,
            ALTER COLUMN module_number DROP NOT NULL,
            ALTER COLUMN group_name DROP NOT NULL,
            ADD CONSTRAINT osc_menu_code_format_check
                CHECK (code ~ '^[A-Z]{2}(0[1-9]|[1-9][0-9])$' AND left(code, 2) = group_code);
        ALTER TABLE public.osc_agent_node
            ADD COLUMN hostname varchar(255),
            ADD COLUMN ip_address inet,
            ADD COLUMN agent_secret_hash text,
            ALTER COLUMN node_code DROP NOT NULL,
            ALTER COLUMN display_name DROP NOT NULL;
        ALTER TABLE public.osc_sop_document ADD COLUMN is_active boolean NOT NULL DEFAULT true;
        ALTER TABLE public.osc_pam_session ADD COLUMN is_active boolean NOT NULL DEFAULT true;
        ALTER TABLE public.osc_report_archive ADD COLUMN is_active boolean NOT NULL DEFAULT true;
    END IF;
END;
$upgrade$;

CREATE TABLE IF NOT EXISTS public.osc_company (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                varchar(32) NOT NULL,
    name                varchar(200) NOT NULL,
    auth_provider       varchar(16) NOT NULL DEFAULT 'LOCAL',
    hris_login_url       text,
    hris_cache_ttl_hours integer NOT NULL DEFAULT 72,
    ad_ldap_url          text,
    oidc_tenant_id       varchar(255),
    is_active            boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_company_code_key UNIQUE (code),
    CONSTRAINT osc_company_auth_provider_check
        CHECK (auth_provider IN ('LOCAL', 'HRIS_ASMX', 'LDAP_AD', 'M365_OIDC')),
    CONSTRAINT osc_company_hris_ttl_check
        CHECK (hris_cache_ttl_hours BETWEEN 1 AND 8760),
    CONSTRAINT osc_company_hris_config_check
        CHECK ((auth_provider = 'HRIS_ASMX') = (hris_login_url IS NOT NULL)),
    CONSTRAINT osc_company_hris_template_check
        CHECK (hris_login_url IS NULL OR (position('{U}' IN hris_login_url) > 0 AND position('{P}' IN hris_login_url) > 0)),
    CONSTRAINT osc_company_ldap_config_check
        CHECK (auth_provider <> 'LDAP_AD' OR ad_ldap_url IS NOT NULL),
    CONSTRAINT osc_company_oidc_config_check
        CHECK (auth_provider <> 'M365_OIDC' OR oidc_tenant_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.osc_area (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL,
    code        varchar(32) NOT NULL,
    name        varchar(200) NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_area_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_area_company_code_key UNIQUE (company_id, code),
    CONSTRAINT osc_area_id_company_key UNIQUE (id, company_id)
);

CREATE INDEX IF NOT EXISTS osc_area_company_active_idx ON public.osc_area (company_id, is_active);

CREATE TABLE IF NOT EXISTS public.osc_store (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL,
    area_id         uuid NOT NULL,
    code            varchar(32) NOT NULL,
    name            varchar(200) NOT NULL,
    network_ip_cidr cidr NOT NULL,
    status          varchar(16) NOT NULL DEFAULT 'ACTIVE',
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_store_area_company_fk
        FOREIGN KEY (area_id, company_id)
        REFERENCES public.osc_area (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_store_company_code_key UNIQUE (company_id, code),
    CONSTRAINT osc_store_id_company_area_key UNIQUE (id, company_id, area_id),
    CONSTRAINT osc_store_status_check
        CHECK (status IN ('ACTIVE', 'PLANNED', 'MAINTENANCE', 'CLOSED'))
);

CREATE INDEX IF NOT EXISTS osc_store_company_area_active_idx
    ON public.osc_store (company_id, area_id, is_active);
CREATE INDEX IF NOT EXISTS osc_store_network_ip_idx ON public.osc_store (network_ip_cidr);

COMMENT ON COLUMN public.osc_company.hris_login_url IS
    'Hanya template URL: gunakan placeholder {U} dan {P}; jangan simpan kata sandi asli atau kredensial hasil interpolasi.';
COMMENT ON COLUMN public.osc_store.network_ip_cidr IS
    'Rentang jaringan store dalam format CIDR PostgreSQL; validasi rentang yang diizinkan/privat pada policy aplikasi.';
COMMENT ON TABLE public.osc_area IS
    'Hierarki regional. Target 6–10 area aktif per perusahaan merupakan validasi operasional, bukan constraint CHECK per baris.';
COMMENT ON TABLE public.osc_store IS
    'Hierarki store. Target kapasitas 500–1000 store bukan constraint CHECK per baris.';

CREATE TABLE IF NOT EXISTS public.osc_user (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id               uuid REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    username                 varchar(128) NOT NULL,
    email                    varchar(320),
    full_name                varchar(200) NOT NULL,
    password_hash            text,
    auth_source              varchar(16) NOT NULL DEFAULT 'LOCAL',
    last_hris_sync_at        timestamptz,
    mfa_enabled              boolean NOT NULL DEFAULT false,
    mfa_secret_encrypted     bytea,
    mfa_last_verified_step   bigint,
    mfa_last_verified_at     timestamptz,
    mfa_backup_codes_hash    jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_active                boolean NOT NULL DEFAULT true,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_user_auth_source_check
        CHECK (auth_source IN ('LOCAL', 'HRIS_ASMX', 'LDAP_AD', 'M365_OIDC')),
    CONSTRAINT osc_user_argon2id_hash_check
        CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%'),
    CONSTRAINT osc_user_active_local_hash_check
        CHECK (NOT (is_active AND auth_source = 'LOCAL') OR password_hash IS NOT NULL),
    CONSTRAINT osc_user_mfa_secret_check
        CHECK (NOT mfa_enabled OR mfa_secret_encrypted IS NOT NULL),
    CONSTRAINT osc_user_mfa_step_check
        CHECK (mfa_last_verified_step IS NULL OR mfa_last_verified_step >= 0),
    CONSTRAINT osc_user_backup_codes_array_check
        CHECK (jsonb_typeof(mfa_backup_codes_hash) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS osc_user_username_lower_key ON public.osc_user (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS osc_user_email_lower_key
    ON public.osc_user (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS osc_user_active_auth_source_idx
    ON public.osc_user (auth_source, is_active);

COMMENT ON COLUMN public.osc_user.company_id IS
    'Perusahaan asal opsional untuk identitas global. Otorisasi tenant tetap berasal dari osc_user_access.';
COMMENT ON COLUMN public.osc_user.password_hash IS
    'Hanya verifier berkode Argon2id; NULL diperbolehkan untuk identitas bootstrap nonaktif yang belum diprovisi.';
COMMENT ON COLUMN public.osc_user.mfa_secret_encrypted IS
    'Envelope AES-256-GCM terenkripsi oleh aplikasi (nonce + ciphertext + tag); material kunci harus tetap di luar PostgreSQL.';
COMMENT ON COLUMN public.osc_user.mfa_backup_codes_hash IS
    'Array JSON yang hanya berisi hash Argon2id. Jangan pernah menyimpan backup code dalam teks biasa.';

CREATE TABLE IF NOT EXISTS public.osc_role (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL,
    role_code   varchar(48) NOT NULL,
    role_name   varchar(120) NOT NULL,
    is_system   boolean NOT NULL DEFAULT false,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_role_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_role_company_code_key UNIQUE (company_id, role_code),
    CONSTRAINT osc_role_id_company_key UNIQUE (id, company_id)
);

CREATE TABLE IF NOT EXISTS public.osc_user_access (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    company_id  uuid NOT NULL,
    area_id     uuid,
    role_id     uuid NOT NULL,
    is_default  boolean NOT NULL DEFAULT false,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_user_access_user_fk
        FOREIGN KEY (user_id) REFERENCES public.osc_user (id) ON DELETE RESTRICT,
    CONSTRAINT osc_user_access_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_user_access_area_company_fk
        FOREIGN KEY (area_id, company_id)
        REFERENCES public.osc_area (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_user_access_role_company_fk
        FOREIGN KEY (role_id, company_id)
        REFERENCES public.osc_role (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_user_access_scope_key UNIQUE NULLS NOT DISTINCT (user_id, company_id, area_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS osc_user_access_one_default_idx
    ON public.osc_user_access (user_id) WHERE is_default AND is_active;
CREATE INDEX IF NOT EXISTS osc_user_access_lookup_idx
    ON public.osc_user_access (user_id, company_id, is_active);
CREATE INDEX IF NOT EXISTS osc_user_access_area_idx
    ON public.osc_user_access (company_id, area_id, is_active);

CREATE TABLE IF NOT EXISTS public.osc_menu (
    code          char(4) PRIMARY KEY,
    group_code    char(2) NOT NULL,
    module_number smallint,
    group_name    varchar(80),
    title         varchar(160) NOT NULL,
    route_path    text,
    icon          text,
    sort_order    smallint NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_menu_group_code_check CHECK (group_code ~ '^[A-Z]{2}$'),
    CONSTRAINT osc_menu_module_number_check CHECK (module_number BETWEEN 1 AND 99),
    CONSTRAINT osc_menu_code_check
        CHECK (code = group_code || lpad(module_number::text, 2, '0')),
    CONSTRAINT osc_menu_code_format_check
        CHECK (code ~ '^[A-Z]{2}(0[1-9]|[1-9][0-9])$' AND left(code, 2) = group_code),
    CONSTRAINT osc_menu_group_number_key UNIQUE (group_code, module_number)
);

CREATE TABLE IF NOT EXISTS public.osc_company_menu_entitlement (
    company_id    uuid NOT NULL,
    module_code   char(4) NOT NULL,
    is_enabled    boolean NOT NULL DEFAULT true,
    can_view      boolean NOT NULL DEFAULT true,
    can_create    boolean NOT NULL DEFAULT true,
    can_update    boolean NOT NULL DEFAULT true,
    can_delete    boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_company_menu_pk PRIMARY KEY (company_id, module_code),
    CONSTRAINT osc_company_menu_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_company_menu_module_fk
        FOREIGN KEY (module_code) REFERENCES public.osc_menu (code) ON DELETE RESTRICT,
    CONSTRAINT osc_company_menu_enabled_flags_check
        CHECK (is_enabled OR NOT (can_view OR can_create OR can_update OR can_delete))
);

CREATE TABLE IF NOT EXISTS public.osc_company_menu (
    company_id    uuid NOT NULL,
    role_id       uuid NOT NULL,
    menu_code     char(4) NOT NULL,
    can_view      boolean NOT NULL DEFAULT false,
    can_create    boolean NOT NULL DEFAULT false,
    can_update    boolean NOT NULL DEFAULT false,
    can_delete    boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_role_menu_pk PRIMARY KEY (company_id, role_id, menu_code),
    CONSTRAINT osc_role_menu_role_company_fk
        FOREIGN KEY (role_id, company_id)
        REFERENCES public.osc_role (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_role_menu_company_module_fk
        FOREIGN KEY (company_id, menu_code)
        REFERENCES public.osc_company_menu_entitlement (company_id, module_code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS osc_role_menu_lookup_idx
    ON public.osc_company_menu (company_id, role_id, menu_code);

COMMENT ON COLUMN public.osc_user_access.area_id IS
    'NULL memberi role akses ke seluruh area aktif di perusahaan ini; UUID membatasi grant ke area aktif tersebut.';
COMMENT ON TABLE public.osc_company_menu_entitlement IS
    'Entitlement/batas maksimum tenant untuk setiap modul. Grant efektif adalah irisan dengan osc_company_menu.';
COMMENT ON TABLE public.osc_company_menu IS
    'Grant aksi pada tingkat role. Privilege efektif memerlukan entitlement company dan grant role.';
COMMENT ON TABLE public.osc_menu IS
    'Katalog modul global: grup dua huruf ditambah nomor modul dua digit (misalnya CT01); XX00 menunjukkan pola kode, bukan modul seed.';

CREATE TABLE IF NOT EXISTS public.osc_sop_document (
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
    is_active         boolean NOT NULL DEFAULT true,
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

CREATE INDEX IF NOT EXISTS osc_sop_scope_status_idx
    ON public.osc_sop_document (company_id, area_id, approval_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.osc_pam_target (
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

CREATE INDEX IF NOT EXISTS osc_pam_target_scope_active_idx
    ON public.osc_pam_target (company_id, area_id, is_active);

CREATE TABLE IF NOT EXISTS public.osc_pam_session (
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
    is_active      boolean NOT NULL DEFAULT true,
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

CREATE INDEX IF NOT EXISTS osc_pam_session_scope_user_idx
    ON public.osc_pam_session (company_id, area_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS osc_pam_session_expiry_idx
    ON public.osc_pam_session (state, expires_at);

CREATE TABLE IF NOT EXISTS public.osc_agent_node (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     uuid NOT NULL,
    area_id        uuid NOT NULL,
    store_id       uuid NOT NULL,
    node_code      varchar(96),
    display_name   varchar(160),
    hostname       varchar(255),
    ip_address     inet,
    os_type        varchar(32) NOT NULL,
    agent_version  varchar(64),
    last_seen_at   timestamptz,
    agent_secret_hash text,
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
        CHECK (os_type IN ('WINDOWS', 'LINUX', 'UBUNTU'))
);

CREATE INDEX IF NOT EXISTS osc_agent_node_store_status_idx
    ON public.osc_agent_node (company_id, area_id, store_id, status);
CREATE INDEX IF NOT EXISTS osc_agent_node_heartbeat_idx
    ON public.osc_agent_node (last_seen_at);

CREATE TABLE IF NOT EXISTS public.osc_report_template (
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

CREATE INDEX IF NOT EXISTS osc_report_template_scope_active_idx
    ON public.osc_report_template (company_id, area_id, is_active);

CREATE TABLE IF NOT EXISTS public.osc_activity_log (
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

CREATE INDEX IF NOT EXISTS osc_activity_scope_time_idx
    ON public.osc_activity_log (company_id, area_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS osc_activity_actor_time_idx
    ON public.osc_activity_log (actor_user_id, occurred_at DESC)
    WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS osc_activity_action_time_idx
    ON public.osc_activity_log (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS osc_activity_request_id_idx
    ON public.osc_activity_log (request_id)
    WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.osc_reject_activity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
    RAISE EXCEPTION 'osc_activity_log is append-only; % is prohibited', TG_OP
        USING ERRCODE = '55000';
END;
$function$;

CREATE OR REPLACE TRIGGER osc_activity_log_no_update_delete
    BEFORE UPDATE OR DELETE ON public.osc_activity_log
    FOR EACH STATEMENT EXECUTE FUNCTION public.osc_reject_activity_mutation();

CREATE OR REPLACE TRIGGER osc_activity_log_no_truncate
    BEFORE TRUNCATE ON public.osc_activity_log
    FOR EACH STATEMENT EXECUTE FUNCTION public.osc_reject_activity_mutation();

COMMENT ON TABLE public.osc_activity_log IS
    'Jejak audit append-only. Role aplikasi runtime tidak boleh memiliki tabel ini atau mendapat hak TRUNCATE/menonaktifkan trigger.';
COMMENT ON COLUMN public.osc_activity_log.details IS
    'Hanya metadata terstruktur yang telah disamarkan; jangan sertakan kata sandi, OTP, backup code, token, atau nilai URL kredensial HRIS.';
COMMENT ON COLUMN public.osc_agent_node.agent_secret_hash IS
    'Verifier kredensial node. Jangan simpan secret mentah atau sertakan hash dalam ekspor.';
COMMENT ON COLUMN public.osc_agent_node.credential_ref IS
    'Referensi opaque ke kredensial per node yang dikelola secara eksternal; jangan simpan secret mentah di sini.';
COMMENT ON COLUMN public.osc_pam_target.credential_ref IS
    'Referensi opaque ke entri secret vault; jangan pernah simpan kata sandi target atau private key di tabel ini.';

-- Hasil ekspor adalah objek privat milik tenant; jangan pernah mengekspos bucket secara langsung.
CREATE TABLE IF NOT EXISTS public.osc_report_archive (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    area_id uuid,
    created_by uuid NOT NULL REFERENCES public.osc_user (id) ON DELETE RESTRICT,
    object_key text NOT NULL UNIQUE,
    report_format varchar(8) NOT NULL CHECK (report_format IN ('XLSX', 'PDF')),
    source_name varchar(64) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT osc_report_archive_area_company_fk FOREIGN KEY (area_id, company_id)
        REFERENCES public.osc_area (id, company_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS osc_report_archive_scope_idx
    ON public.osc_report_archive (company_id, area_id, created_at DESC);

COMMIT;
