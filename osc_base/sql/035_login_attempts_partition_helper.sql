-- WP-02 login_attempts partition helper.
-- Creates a monthly partition atomically with forced tenant RLS, the
-- tenant_isolation policy, and application grants. The maintenance job must use
-- this helper; creating a partition directly leaves it without RLS.
-- The helper is idempotent for an existing month and serializes concurrent
-- calls with a transaction-scoped advisory lock.
-- This file is the canonical SQL copied into
-- prisma/migrations/20261102000200_login_attempts_partition_helper/migration.sql.

CREATE OR REPLACE FUNCTION core.ensure_login_attempts_partition(p_month date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_catalog
AS $$
DECLARE
  v_start date;
  v_end date;
  v_name text;
  v_qualified text;
  v_oid oid;
  v_expr text := 'company_id = NULLIF(current_setting(''app.company_id'', true), '''')::uuid';
BEGIN
  IF p_month IS NULL THEN
    RAISE EXCEPTION 'partition month must not be null' USING ERRCODE = '22023';
  END IF;

  v_start := date_trunc('month', p_month)::date;
  v_end := (v_start + interval '1 month')::date;
  v_name := 'login_attempts_' || to_char(v_start, 'YYYY_MM');
  v_qualified := format('core.%I', v_name);

  -- Serialize concurrent maintenance calls for the same month. The lock ends
  -- with the surrounding transaction.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('core.login_attempts:' || v_start::text, 0)
  );

  v_oid := to_regclass(v_qualified);

  IF v_oid IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %s PARTITION OF core.login_attempts FOR VALUES FROM (%L) TO (%L)',
      v_qualified, v_start, v_end
    );
    v_oid := to_regclass(v_qualified);
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace pn ON pn.oid = p.relnamespace
    WHERE n.nspname = 'core'
      AND c.relname = v_name
      AND pn.nspname = 'core'
      AND p.relname = 'login_attempts'
  ) THEN
    RAISE EXCEPTION 'relation % exists but is not a partition of core.login_attempts',
      v_qualified
      USING ERRCODE = '42P07';
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_qualified);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', v_qualified);

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy pol
    WHERE pol.polrelid = v_oid
      AND pol.polname = 'tenant_isolation'
  ) THEN
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING (%s) WITH CHECK (%s)',
      v_qualified, v_expr, v_expr
    );
  END IF;

  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO osc_rest_app',
    v_qualified
  );

  RETURN v_qualified;
END;
$$;

-- The maintenance job runs as the database owner or a dedicated role that is
-- granted EXECUTE explicitly. osc_rest_app must never be granted EXECUTE.
REVOKE ALL ON FUNCTION core.ensure_login_attempts_partition(date) FROM PUBLIC;
