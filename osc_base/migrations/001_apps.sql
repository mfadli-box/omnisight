-- 001_apps.sql
-- Data master tenant dan lokasi. Terapkan satu kali melalui pelaksana migrasi.

CREATE TABLE public.osc_company (
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

CREATE TABLE public.osc_area (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL,
    area_code   varchar(32) NOT NULL,
    area_name   varchar(200) NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_area_company_fk
        FOREIGN KEY (company_id) REFERENCES public.osc_company (id) ON DELETE RESTRICT,
    CONSTRAINT osc_area_company_code_key UNIQUE (company_id, area_code),
    CONSTRAINT osc_area_id_company_key UNIQUE (id, company_id)
);

CREATE INDEX osc_area_company_active_idx ON public.osc_area (company_id, is_active);

CREATE TABLE public.osc_store (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL,
    area_id         uuid NOT NULL,
    store_code      varchar(32) NOT NULL,
    store_name      varchar(200) NOT NULL,
    network_ip_cidr cidr NOT NULL,
    status          varchar(16) NOT NULL DEFAULT 'ACTIVE',
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_store_area_company_fk
        FOREIGN KEY (area_id, company_id)
        REFERENCES public.osc_area (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_store_company_code_key UNIQUE (company_id, store_code),
    CONSTRAINT osc_store_id_company_area_key UNIQUE (id, company_id, area_id),
    CONSTRAINT osc_store_status_check
        CHECK (status IN ('ACTIVE', 'PLANNED', 'MAINTENANCE', 'CLOSED'))
);

CREATE INDEX osc_store_company_area_active_idx
    ON public.osc_store (company_id, area_id, is_active);
CREATE INDEX osc_store_network_ip_idx ON public.osc_store (network_ip_cidr);

COMMENT ON COLUMN public.osc_company.hris_login_url IS
    'Hanya template URL: gunakan placeholder {U} dan {P}; jangan simpan kata sandi asli atau kredensial hasil interpolasi.';
COMMENT ON COLUMN public.osc_store.network_ip_cidr IS
    'Rentang jaringan store dalam format CIDR PostgreSQL; validasi rentang yang diizinkan/privat pada policy aplikasi.';
COMMENT ON TABLE public.osc_area IS
    'Hierarki regional. Target 6–10 area aktif per perusahaan merupakan validasi operasional, bukan constraint CHECK per baris.';
COMMENT ON TABLE public.osc_store IS
    'Hierarki store. Target kapasitas 500–1000 store bukan constraint CHECK per baris.';
