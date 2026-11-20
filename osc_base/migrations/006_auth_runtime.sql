-- 006_auth_runtime.sql
-- Migrasi role/konteks runtime yang kompatibel ke depan. Migrasi ini juga memperbarui DB
-- yang telah menerapkan draf awal 005_init.sql dengan RLS pada control-plane.

DO $block$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'osc_app_runtime') THEN
        EXECUTE 'CREATE ROLE osc_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS';
    END IF;
END;
$block$;

-- Resolusi company dan grant sebelum autentikasi terjadi sebelum backend dapat mengatur
-- konteks tenant tepercaya. Data control-plane ini hanya boleh diakses melalui SQL backend,
-- jangan pernah melalui API query generik untuk klien.
ALTER TABLE public.osc_company DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_area DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_store DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_role DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_user_access DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_company_menu DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_role_menu DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS osc_company_tenant_scope ON public.osc_company;
DROP POLICY IF EXISTS osc_area_tenant_scope ON public.osc_area;
DROP POLICY IF EXISTS osc_store_tenant_scope ON public.osc_store;
DROP POLICY IF EXISTS osc_role_tenant_scope ON public.osc_role;
DROP POLICY IF EXISTS osc_user_access_tenant_scope ON public.osc_user_access;
DROP POLICY IF EXISTS osc_company_menu_tenant_scope ON public.osc_company_menu;
DROP POLICY IF EXISTS osc_role_menu_tenant_scope ON public.osc_role_menu;

GRANT USAGE ON SCHEMA public TO osc_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.osc_company, public.osc_area, public.osc_store, public.osc_user,
    public.osc_role, public.osc_user_access, public.osc_menu, public.osc_company_menu,
    public.osc_role_menu, public.osc_sop_document, public.osc_pam_target,
    public.osc_pam_session, public.osc_agent_node, public.osc_report_template
TO osc_app_runtime;
GRANT SELECT, INSERT ON TABLE public.osc_activity_log TO osc_app_runtime;
GRANT USAGE, SELECT ON SEQUENCE public.osc_activity_log_id_seq TO osc_app_runtime;

DO $block$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'omnisight_app') THEN
        EXECUTE 'GRANT osc_app_runtime TO omnisight_app';
    END IF;
END;
$block$;
