-- 005_init.sql
-- RLS tenant/area menolak secara aman data cakupan perusahaan dan seluruh tabel transaksi.
-- Role runtime tidak boleh memiliki tabel ini atau hak BYPASSRLS. Pemilik migrasi
-- harus tetap terpisah agar seed dapat dijalankan dan pemulihan operasional diaudit.
-- RLS mempercayai backend untuk mengatur konteks lokal transaksi dari principal tervalidasi;
-- klien database yang dapat menjalankan SQL arbitrer bisa mengatur GUC khusus sendiri. Simpan
-- kredensial DB hanya untuk layanan dan jangan sediakan koneksi langsung kepada klien.

DO $block$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'osc_app_runtime') THEN
        EXECUTE 'CREATE ROLE osc_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS';
    END IF;
END;
$block$;

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

CREATE FUNCTION public.osc_rls_current_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    raw_value text;
BEGIN
    raw_value := NULLIF(current_setting('app.current_company_id', true), '');
    IF raw_value IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN raw_value::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$function$;

CREATE FUNCTION public.osc_rls_allowed_area_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    raw_value text;
    token text;
    result_ids uuid[] := ARRAY[]::uuid[];
BEGIN
    raw_value := NULLIF(current_setting('app.allowed_area_ids', true), '');
    IF raw_value IS NULL THEN
        RETURN result_ids;
    END IF;

    FOREACH token IN ARRAY string_to_array(raw_value, ',') LOOP
        IF btrim(token) = '' THEN
            CONTINUE;
        END IF;
        BEGIN
            result_ids := array_append(result_ids, btrim(token)::uuid);
        EXCEPTION
            WHEN invalid_text_representation THEN
                -- Satu token tidak valid membatalkan seluruh cakupan; jangan pernah meluaskan akses.
                RETURN ARRAY[]::uuid[];
        END;
    END LOOP;
    RETURN result_ids;
END;
$function$;

CREATE FUNCTION public.osc_rls_scope_allowed(p_company_id uuid, p_area_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    context_company_id uuid;
    company_active boolean;
    area_active boolean;
BEGIN
    context_company_id := public.osc_rls_current_company_id();
    IF context_company_id IS NULL OR p_company_id IS DISTINCT FROM context_company_id THEN
        RETURN false;
    END IF;

    SELECT c.is_active INTO company_active
    FROM public.osc_company AS c
    WHERE c.id = p_company_id;
    IF COALESCE(company_active, false) IS NOT TRUE THEN
        RETURN false;
    END IF;

    -- Area NULL berarti data seluruh perusahaan. Data khusus area memerlukan ID area
    -- yang diizinkan secara eksplisit dan area aktif milik perusahaan aktif yang sama.
    IF p_area_id IS NULL THEN
        RETURN true;
    END IF;
    IF NOT (p_area_id = ANY (public.osc_rls_allowed_area_ids())) THEN
        RETURN false;
    END IF;

    SELECT a.is_active INTO area_active
    FROM public.osc_area AS a
    WHERE a.id = p_area_id AND a.company_id = p_company_id;
    RETURN COALESCE(area_active, false);
END;
$function$;

CREATE FUNCTION public.osc_rls_store_scope_allowed(
    p_company_id uuid,
    p_area_id uuid,
    p_store_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
    SELECT public.osc_rls_scope_allowed(p_company_id, p_area_id)
       AND EXISTS (
            SELECT 1
            FROM public.osc_store AS s
            WHERE s.id = p_store_id
              AND s.company_id = p_company_id
              AND s.area_id = p_area_id
              AND s.is_active
       );
$function$;

-- Helper policy hanya mengekspos data boolean/cakupan dan memakai search_path tetap.
-- Pemiliknya harus role khusus pemilik migrasi/skema, bukan role aplikasi.
GRANT EXECUTE ON FUNCTION public.osc_rls_current_company_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.osc_rls_allowed_area_ids() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.osc_rls_scope_allowed(uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.osc_rls_store_scope_allowed(uuid, uuid, uuid) TO PUBLIC;

-- Identitas, hierarki, grant akses, dan katalog menu adalah tabel control-plane.
-- Tabel tersebut sengaja berada di luar RLS agar login sebelum autentikasi dapat menemukan
-- perusahaan dan grant-nya. Repository aplikasi wajib memakai parameter dan membatasi setiap lookup;
-- tabel ini tidak boleh diekspos melalui API query generik untuk klien.

-- RLS diaktifkan pada setiap tabel transaksi bisnis dengan pemeriksaan baca dan tulis.
-- Konteks company yang hilang/tidak valid, company/area nonaktif, atau area yang tidak ada
-- pada app.allowed_area_ids membuat tidak ada baris yang terlihat/dapat ditulis.
ALTER TABLE public.osc_sop_document ENABLE ROW LEVEL SECURITY;
CREATE POLICY osc_sop_document_tenant_scope ON public.osc_sop_document
    USING (public.osc_rls_scope_allowed(company_id, area_id))
    WITH CHECK (public.osc_rls_scope_allowed(company_id, area_id));

ALTER TABLE public.osc_pam_target ENABLE ROW LEVEL SECURITY;
CREATE POLICY osc_pam_target_tenant_scope ON public.osc_pam_target
    USING (public.osc_rls_scope_allowed(company_id, area_id))
    WITH CHECK (public.osc_rls_scope_allowed(company_id, area_id));

ALTER TABLE public.osc_pam_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY osc_pam_session_tenant_scope ON public.osc_pam_session
    USING (public.osc_rls_scope_allowed(company_id, area_id))
    WITH CHECK (public.osc_rls_scope_allowed(company_id, area_id));

ALTER TABLE public.osc_agent_node ENABLE ROW LEVEL SECURITY;
CREATE POLICY osc_agent_node_tenant_scope ON public.osc_agent_node
    USING (public.osc_rls_store_scope_allowed(company_id, area_id, store_id))
    WITH CHECK (public.osc_rls_store_scope_allowed(company_id, area_id, store_id));

ALTER TABLE public.osc_report_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY osc_report_template_tenant_scope ON public.osc_report_template
    USING (public.osc_rls_scope_allowed(company_id, area_id))
    WITH CHECK (public.osc_rls_scope_allowed(company_id, area_id));

ALTER TABLE public.osc_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY osc_activity_log_tenant_scope ON public.osc_activity_log
    USING (public.osc_rls_scope_allowed(company_id, area_id))
    WITH CHECK (public.osc_rls_scope_allowed(company_id, area_id));

COMMENT ON FUNCTION public.osc_rls_scope_allowed(uuid, uuid) IS
    'Predikat RLS: memerlukan app.current_company_id aktif yang cocok; baris bercakupan area juga memerlukan ID area aktif dalam app.allowed_area_ids yang dipisahkan koma. area_id NULL berarti data seluruh perusahaan.';
COMMENT ON TABLE public.osc_user_access IS
    'Grant akses control-plane sengaja tidak memakai RLS agar autentikasi dapat menemukan grant sebelum konteks tenant tersedia. Lindungi akses melalui repository backend berparameter; jangan ekspos SQL generik atau API koleksi.';
COMMENT ON TABLE public.osc_user IS
    'Tabel identitas global sengaja tidak memakai RLS tenant karena login dapat berlangsung sebelum pemilihan company. Jangan berikan akses luas kepada role DB untuk browser/umum; gunakan resolver pra-autentikasi terbatas dan kembalikan hanya field yang diperlukan untuk verifikasi kredensial.';
