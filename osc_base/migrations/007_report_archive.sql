-- Hasil ekspor adalah objek privat milik tenant; jangan pernah mengekspos bucket secara langsung.
CREATE TABLE public.osc_report_archive (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.osc_company(id) ON DELETE RESTRICT,
    area_id uuid,
    created_by uuid NOT NULL REFERENCES public.osc_user(id) ON DELETE RESTRICT,
    object_key text NOT NULL UNIQUE,
    report_format varchar(8) NOT NULL CHECK (report_format IN ('XLSX','PDF')),
    source_name varchar(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT osc_report_archive_area_company_fk FOREIGN KEY (area_id,company_id)
        REFERENCES public.osc_area(id,company_id) ON DELETE RESTRICT
);
CREATE INDEX osc_report_archive_scope_idx ON public.osc_report_archive(company_id,area_id,created_at DESC);
GRANT SELECT, INSERT ON public.osc_report_archive TO osc_app_runtime;
ALTER TABLE public.osc_report_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY osc_report_archive_tenant_scope ON public.osc_report_archive
    USING (public.osc_rls_scope_allowed(company_id,area_id))
    WITH CHECK (public.osc_rls_scope_allowed(company_id,area_id));
