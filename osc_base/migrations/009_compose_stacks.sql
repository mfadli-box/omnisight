-- Apply after 008_node_telemetry.sql.
BEGIN;

CREATE TABLE public.osc_compose_stack (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    area_id uuid NOT NULL,
    store_id uuid NOT NULL,
    node_id uuid NOT NULL,
    stack_name text NOT NULL CHECK (stack_name ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
    compose_path text GENERATED ALWAYS AS (stack_name || '/compose.yaml') STORED,
    env_encrypted bytea,
    status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','READY','RUNNING','STOPPED','ERROR')),
    last_deployed_at timestamptz,
    UNIQUE (node_id, stack_name),
    UNIQUE (id, node_id, company_id, area_id, store_id),
    FOREIGN KEY (node_id, company_id, area_id, store_id)
        REFERENCES public.osc_agent_node (id, company_id, area_id, store_id)
);
CREATE INDEX osc_compose_stack_scope_idx ON public.osc_compose_stack (company_id, area_id, store_id);

CREATE TABLE public.osc_ops_job (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    area_id uuid NOT NULL,
    store_id uuid NOT NULL,
    node_id uuid NOT NULL,
    stack_id uuid,
    actor_user_id uuid NOT NULL REFERENCES public.osc_user(id),
    session_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('read','save','convert','up','down','pull','restart','terminal')),
    payload_encrypted bytea,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    CHECK ((action = 'terminal') = (stack_id IS NULL)),
    FOREIGN KEY (node_id, company_id, area_id, store_id)
        REFERENCES public.osc_agent_node (id, company_id, area_id, store_id),
    FOREIGN KEY (stack_id, node_id, company_id, area_id, store_id)
        REFERENCES public.osc_compose_stack (id, node_id, company_id, area_id, store_id)
);
CREATE UNIQUE INDEX osc_ops_job_active_node_idx ON public.osc_ops_job (node_id)
    WHERE status IN ('queued','running');
CREATE INDEX osc_ops_job_expiry_idx ON public.osc_ops_job (expires_at);

CREATE TABLE public.osc_ops_event (
    job_id uuid NOT NULL REFERENCES public.osc_ops_job(id) ON DELETE CASCADE,
    seq integer NOT NULL CHECK (seq BETWEEN 1 AND 128),
    output_encrypted bytea NOT NULL,
    PRIMARY KEY (job_id, seq)
);

ALTER TABLE public.osc_compose_stack ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_compose_stack FORCE ROW LEVEL SECURITY;
CREATE POLICY osc_compose_stack_scope ON public.osc_compose_stack
    USING (public.osc_rls_store_scope_allowed(company_id, area_id, store_id))
    WITH CHECK (public.osc_rls_store_scope_allowed(company_id, area_id, store_id));

ALTER TABLE public.osc_ops_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_ops_job FORCE ROW LEVEL SECURITY;
CREATE POLICY osc_ops_job_scope ON public.osc_ops_job
    USING (public.osc_rls_store_scope_allowed(company_id, area_id, store_id))
    WITH CHECK (public.osc_rls_store_scope_allowed(company_id, area_id, store_id));

ALTER TABLE public.osc_ops_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_ops_event FORCE ROW LEVEL SECURITY;
CREATE POLICY osc_ops_event_scope ON public.osc_ops_event
    USING (EXISTS (SELECT 1 FROM public.osc_ops_job j WHERE j.id = job_id))
    WITH CHECK (EXISTS (SELECT 1 FROM public.osc_ops_job j WHERE j.id = job_id));

GRANT SELECT, INSERT, UPDATE ON public.osc_compose_stack TO osc_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osc_ops_job TO osc_app_runtime;
GRANT SELECT, INSERT ON public.osc_ops_event TO osc_app_runtime;

COMMIT;
