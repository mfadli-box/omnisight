-- 003_role.sql
-- Role tenant, grant pengguna, katalog modul, entitlement tenant, dan grant role.

CREATE TABLE public.osc_role (
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

CREATE TABLE public.osc_user_access (
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

CREATE UNIQUE INDEX osc_user_access_one_default_idx
    ON public.osc_user_access (user_id) WHERE is_default AND is_active;
CREATE INDEX osc_user_access_lookup_idx
    ON public.osc_user_access (user_id, company_id, is_active);
CREATE INDEX osc_user_access_area_idx
    ON public.osc_user_access (company_id, area_id, is_active);

CREATE TABLE public.osc_menu (
    module_code   char(4) PRIMARY KEY,
    group_code    char(2) NOT NULL,
    module_number smallint NOT NULL,
    group_name    varchar(80) NOT NULL,
    module_name   varchar(160) NOT NULL,
    display_order smallint NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_menu_group_code_check CHECK (group_code ~ '^[A-Z]{2}$'),
    CONSTRAINT osc_menu_module_number_check CHECK (module_number BETWEEN 1 AND 99),
    CONSTRAINT osc_menu_module_code_check
        CHECK (module_code = group_code || lpad(module_number::text, 2, '0')),
    CONSTRAINT osc_menu_group_number_key UNIQUE (group_code, module_number)
);

CREATE TABLE public.osc_company_menu (
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
        FOREIGN KEY (module_code) REFERENCES public.osc_menu (module_code) ON DELETE RESTRICT,
    CONSTRAINT osc_company_menu_enabled_flags_check
        CHECK (is_enabled OR NOT (can_view OR can_create OR can_update OR can_delete))
);

CREATE TABLE public.osc_role_menu (
    company_id    uuid NOT NULL,
    role_id       uuid NOT NULL,
    module_code   char(4) NOT NULL,
    can_view      boolean NOT NULL DEFAULT false,
    can_create    boolean NOT NULL DEFAULT false,
    can_update    boolean NOT NULL DEFAULT false,
    can_delete    boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_role_menu_pk PRIMARY KEY (company_id, role_id, module_code),
    CONSTRAINT osc_role_menu_role_company_fk
        FOREIGN KEY (role_id, company_id)
        REFERENCES public.osc_role (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT osc_role_menu_company_module_fk
        FOREIGN KEY (company_id, module_code)
        REFERENCES public.osc_company_menu (company_id, module_code) ON DELETE RESTRICT
);

CREATE INDEX osc_role_menu_lookup_idx
    ON public.osc_role_menu (company_id, role_id, module_code);

COMMENT ON COLUMN public.osc_user_access.area_id IS
    'NULL memberi role akses ke seluruh area aktif di perusahaan ini; UUID membatasi grant ke area aktif tersebut.';
COMMENT ON TABLE public.osc_company_menu IS
    'Entitlement/batas maksimum tenant untuk setiap modul. Grant role efektif adalah irisan dengan osc_role_menu.';
COMMENT ON TABLE public.osc_role_menu IS
    'Grant aksi pada tingkat role. Privilege efektif memerlukan entitlement company dan grant role.';
COMMENT ON TABLE public.osc_menu IS
    'Katalog modul global: grup dua huruf ditambah nomor modul dua digit (misalnya CT01); XX00 menunjukkan pola kode, bukan modul seed.';
