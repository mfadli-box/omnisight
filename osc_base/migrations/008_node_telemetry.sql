-- Apply after 001_init_core.sql and 002_rls_policies.sql.
BEGIN;

ALTER TABLE public.osc_agent_node ADD CONSTRAINT osc_agent_node_metric_scope_key
    UNIQUE (id, company_id, area_id, store_id);

CREATE TABLE public.osc_node_metric (
    node_id uuid NOT NULL,
    company_id uuid NOT NULL,
    area_id uuid NOT NULL,
    store_id uuid NOT NULL,
    cpu_pct double precision NOT NULL CHECK (cpu_pct BETWEEN 0 AND 100),
    ram_used_mb double precision NOT NULL CHECK (ram_used_mb >= 0),
    ram_total_mb double precision NOT NULL CHECK (ram_total_mb > 0 AND ram_used_mb <= ram_total_mb),
    disk_json jsonb NOT NULL CHECK (jsonb_typeof(disk_json) = 'array'),
    disk_io_json jsonb NOT NULL CHECK (jsonb_typeof(disk_io_json) = 'array'),
    net_json jsonb NOT NULL CHECK (jsonb_typeof(net_json) = 'array'),
    load_avg double precision[] CHECK (cardinality(load_avg) = 3),
    temp_c double precision CHECK (temp_c BETWEEN -273.15 AND 250),
    smart_json jsonb NOT NULL CHECK (jsonb_typeof(smart_json) = 'array'),
    containers_json jsonb NOT NULL CHECK (jsonb_typeof(containers_json) = 'array'),
    recorded_at timestamptz NOT NULL,
    PRIMARY KEY (node_id, recorded_at),
    FOREIGN KEY (node_id, company_id, area_id, store_id)
        REFERENCES public.osc_agent_node (id, company_id, area_id, store_id)
        ON DELETE RESTRICT
);

CREATE TABLE public.osc_alert_rule (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.osc_company(id),
    area_id uuid,
    metric_type text NOT NULL CHECK (metric_type IN
        ('cpu_pct', 'ram_used_mb', 'ram_pct', 'disk_pct', 'load_avg', 'temp_c', 'smart_failed')),
    threshold double precision NOT NULL CHECK (CASE metric_type
        WHEN 'temp_c' THEN threshold BETWEEN -273.15 AND 250
        WHEN 'smart_failed' THEN threshold = 1
        WHEN 'cpu_pct' THEN threshold BETWEEN 0 AND 100
        WHEN 'ram_pct' THEN threshold BETWEEN 0 AND 100
        WHEN 'disk_pct' THEN threshold BETWEEN 0 AND 100
        WHEN 'load_avg' THEN threshold BETWEEN 0 AND 1e6
        ELSE threshold BETWEEN 0 AND 1e12 END),
    duration_sec integer NOT NULL CHECK (duration_sec BETWEEN 0 AND 86400),
    webhook_url text CHECK (length(webhook_url) <= 2048),
    UNIQUE (id, company_id),
    FOREIGN KEY (area_id, company_id) REFERENCES public.osc_area (id, company_id)
);

CREATE INDEX osc_alert_rule_scope_idx ON public.osc_alert_rule (company_id, area_id);

CREATE TABLE public.osc_node_alert_state (
    node_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    company_id uuid NOT NULL,
    area_id uuid NOT NULL,
    store_id uuid NOT NULL,
    breached_since timestamptz NOT NULL,
    last_sample_at timestamptz NOT NULL,
    metric_type text NOT NULL,
    threshold double precision NOT NULL,
    duration_sec integer NOT NULL,
    notified boolean NOT NULL,
    PRIMARY KEY (node_id, rule_id),
    FOREIGN KEY (node_id, company_id, area_id, store_id)
        REFERENCES public.osc_agent_node (id, company_id, area_id, store_id),
    FOREIGN KEY (rule_id, company_id) REFERENCES public.osc_alert_rule (id, company_id) ON DELETE CASCADE
);

ALTER TABLE public.osc_node_metric ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_node_metric FORCE ROW LEVEL SECURITY;
CREATE POLICY osc_node_metric_scope ON public.osc_node_metric
    USING (public.osc_rls_store_scope_allowed(company_id, area_id, store_id))
    WITH CHECK (public.osc_rls_store_scope_allowed(company_id, area_id, store_id));

ALTER TABLE public.osc_alert_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_alert_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY osc_alert_rule_scope ON public.osc_alert_rule
    USING (public.osc_rls_scope_allowed(company_id, area_id))
    WITH CHECK (public.osc_rls_scope_allowed(company_id, area_id));

ALTER TABLE public.osc_node_alert_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_node_alert_state FORCE ROW LEVEL SECURITY;
CREATE POLICY osc_node_alert_state_scope ON public.osc_node_alert_state
    USING (public.osc_rls_store_scope_allowed(company_id, area_id, store_id))
    WITH CHECK (public.osc_rls_store_scope_allowed(company_id, area_id, store_id));

GRANT SELECT, INSERT ON public.osc_node_metric TO osc_app_runtime;
-- URLs remain visible only to the role provisioning rules.
GRANT SELECT (id, company_id, area_id, metric_type, threshold, duration_sec)
    ON public.osc_alert_rule TO osc_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osc_node_alert_state TO osc_app_runtime;

COMMIT;
