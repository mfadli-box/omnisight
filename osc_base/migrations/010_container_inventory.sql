-- Apply after 009_compose_stacks.sql.
BEGIN;
ALTER TABLE public.osc_ops_job DROP CONSTRAINT osc_ops_job_action_check;
ALTER TABLE public.osc_ops_job ADD CONSTRAINT osc_ops_job_action_check CHECK (action IN
 ('read','save','convert','up','down','pull','restart','terminal','docker.start','docker.stop','docker.prune_containers','docker.prune_images'));
ALTER TABLE public.osc_ops_job DROP CONSTRAINT osc_ops_job_check;
ALTER TABLE public.osc_ops_job ADD CONSTRAINT osc_ops_job_target_check CHECK
 ((action IN ('terminal','docker.start','docker.stop','docker.prune_containers','docker.prune_images')) = (stack_id IS NULL));
CREATE TABLE public.osc_container_snapshot (
 node_id uuid PRIMARY KEY,
 company_id uuid NOT NULL,
 area_id uuid NOT NULL,
 store_id uuid NOT NULL,
 containers jsonb NOT NULL CHECK (jsonb_typeof(containers)='array'),
 sbom jsonb NOT NULL CHECK (jsonb_typeof(sbom)='array'),
 recorded_at bigint NOT NULL,
 FOREIGN KEY (node_id,company_id,area_id,store_id) REFERENCES public.osc_agent_node(id,company_id,area_id,store_id)
);
ALTER TABLE public.osc_container_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osc_container_snapshot FORCE ROW LEVEL SECURITY;
CREATE POLICY osc_container_snapshot_scope ON public.osc_container_snapshot
 USING (public.osc_rls_store_scope_allowed(company_id,area_id,store_id))
 WITH CHECK (public.osc_rls_store_scope_allowed(company_id,area_id,store_id));
GRANT SELECT, INSERT, UPDATE ON public.osc_container_snapshot TO osc_app_runtime;
COMMIT;
