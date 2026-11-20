-- Jalankan sebagai pemilik skema setelah 001_init_core.sql.
BEGIN;

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'osc_app_runtime') THEN
        CREATE ROLE osc_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'omnisight_app') THEN
        GRANT osc_app_runtime TO omnisight_app;
    END IF;
END;
$roles$;

-- Control plane dipakai oleh resolver backend sebelum konteks tenant tersedia.
GRANT USAGE ON SCHEMA public TO osc_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.osc_company, public.osc_area, public.osc_store, public.osc_user,
    public.osc_role, public.osc_user_access, public.osc_menu, public.osc_company_menu,
    public.osc_company_menu_entitlement, public.osc_sop_document, public.osc_pam_target,
    public.osc_pam_session, public.osc_agent_node, public.osc_report_template
TO osc_app_runtime;
GRANT SELECT, INSERT ON TABLE public.osc_report_archive TO osc_app_runtime;

REVOKE ALL ON TABLE public.osc_activity_log FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.osc_activity_log FROM osc_app_runtime;
GRANT SELECT, INSERT ON TABLE public.osc_activity_log TO osc_app_runtime;
GRANT USAGE, SELECT ON SEQUENCE public.osc_activity_log_id_seq TO osc_app_runtime;

CREATE OR REPLACE FUNCTION public.osc_rls_current_company_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
    RETURN NULLIF(current_setting('app.current_company_id', true), '')::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.osc_rls_allowed_area_ids()
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    raw_value text := NULLIF(btrim(current_setting('app.allowed_area_ids', true)), '');
BEGIN
    IF raw_value = '{}' THEN
        RETURN ARRAY[]::uuid[];
    END IF;

    -- Cast seluruh daftar sekaligus agar satu token cacat membatalkan konteks.
    RETURN string_to_array(raw_value, ',')::uuid[];
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.osc_rls_scope_allowed(p_company_id uuid, p_area_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
    SELECT COALESCE(
        p_company_id = public.osc_rls_current_company_id()
        AND scope.area_ids IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.osc_company AS c
            WHERE c.id = p_company_id AND c.is_active
        )
        AND (
            p_area_id IS NULL
            OR (
                p_area_id = ANY (scope.area_ids)
                AND EXISTS (
                    SELECT 1 FROM public.osc_area AS a
                    WHERE a.id = p_area_id AND a.company_id = p_company_id AND a.is_active
                )
            )
        ),
        false
    )
    FROM (SELECT public.osc_rls_allowed_area_ids() AS area_ids) AS scope;
$function$;

CREATE OR REPLACE FUNCTION public.osc_rls_store_scope_allowed(
    p_company_id uuid,
    p_area_id uuid,
    p_store_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
    SELECT public.osc_rls_scope_allowed(p_company_id, p_area_id)
       AND EXISTS (
            SELECT 1 FROM public.osc_store AS s
            WHERE s.id = p_store_id AND s.company_id = p_company_id
              AND s.area_id = p_area_id AND s.is_active
       );
$function$;

COMMENT ON FUNCTION public.osc_rls_scope_allowed(uuid, uuid) IS
    'Konteks transaksi memerlukan UUID company aktif dan daftar UUID area dipisahkan koma atau {}. Baris dengan area_id NULL bercakupan perusahaan.';

DO $policies$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'osc_sop_document', 'osc_pam_target', 'osc_pam_session',
        'osc_report_template', 'osc_report_archive'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_tenant_scope', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I
                USING (is_active AND public.osc_rls_scope_allowed(company_id, area_id))
                WITH CHECK (is_active AND public.osc_rls_scope_allowed(company_id, area_id))',
            table_name || '_tenant_scope', table_name
        );
    END LOOP;
END;
$policies$;

ALTER TABLE public.osc_agent_node ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_agent_node FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osc_agent_node_tenant_scope ON public.osc_agent_node;
CREATE POLICY osc_agent_node_tenant_scope ON public.osc_agent_node
    USING (is_active AND public.osc_rls_store_scope_allowed(company_id, area_id, store_id))
    WITH CHECK (is_active AND public.osc_rls_store_scope_allowed(company_id, area_id, store_id));

ALTER TABLE public.osc_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_activity_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osc_activity_log_tenant_scope ON public.osc_activity_log;
DROP POLICY IF EXISTS osc_activity_log_read ON public.osc_activity_log;
DROP POLICY IF EXISTS osc_activity_log_append ON public.osc_activity_log;
CREATE POLICY osc_activity_log_read ON public.osc_activity_log FOR SELECT
    USING (public.osc_rls_scope_allowed(company_id, area_id));
CREATE POLICY osc_activity_log_append ON public.osc_activity_log FOR INSERT
    WITH CHECK (public.osc_rls_scope_allowed(company_id, area_id));

COMMIT;
