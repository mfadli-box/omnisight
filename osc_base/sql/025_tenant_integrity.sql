-- WP-02 post-review tenant integrity (P0).
-- Closes cross-tenant relation and RLS gaps found in the WP-02 review:
--   * composite foreign keys for access reviews and webhook deliveries,
--   * an integration link must reference a global or same-company endpoint,
--   * RLS for core.hris_login_rules and core.hris_login_logs (derived from
--     core.hris_connections), and
--   * RLS on every existing core.login_attempts partition.
-- The migration is additive and idempotent.
-- This file is the canonical SQL copied into
-- prisma/migrations/20261102000100_tenant_integrity/migration.sql.

-- ---------------------------------------------------------------------------
-- Unique indexes required as composite foreign key targets. The tenant column
-- is part of the key so a child row cannot point at another company's row.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS access_reviews_company_id_id_key
  ON audit.access_reviews (company_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS company_memberships_company_id_id_key
  ON core.company_memberships (company_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS roles_company_id_id_key
  ON core.roles (company_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS webhooks_company_id_id_key
  ON platform.webhooks (company_id, id);

-- ---------------------------------------------------------------------------
-- Composite foreign keys.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_access_review_items_review_company'
      AND conrelid = 'audit.access_review_items'::regclass
  ) THEN
    ALTER TABLE audit.access_review_items
      ADD CONSTRAINT fk_access_review_items_review_company
      FOREIGN KEY (company_id, review_id)
      REFERENCES audit.access_reviews (company_id, id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_access_review_items_membership_company'
      AND conrelid = 'audit.access_review_items'::regclass
  ) THEN
    ALTER TABLE audit.access_review_items
      ADD CONSTRAINT fk_access_review_items_membership_company
      FOREIGN KEY (company_id, membership_id)
      REFERENCES core.company_memberships (company_id, id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_access_review_items_role_company'
      AND conrelid = 'audit.access_review_items'::regclass
  ) THEN
    ALTER TABLE audit.access_review_items
      ADD CONSTRAINT fk_access_review_items_role_company
      FOREIGN KEY (company_id, role_id)
      REFERENCES core.roles (company_id, id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_webhook_deliveries_webhook_company'
      AND conrelid = 'platform.webhook_deliveries'::regclass
  ) THEN
    ALTER TABLE platform.webhook_deliveries
      ADD CONSTRAINT fk_webhook_deliveries_webhook_company
      FOREIGN KEY (company_id, webhook_id)
      REFERENCES platform.webhooks (company_id, id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_integration_links_integration'
      AND conrelid = 'platform.integration_links'::regclass
  ) THEN
    ALTER TABLE platform.integration_links
      ADD CONSTRAINT fk_integration_links_integration
      FOREIGN KEY (integration_id)
      REFERENCES platform.integration_endpoints (id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Integration links may reference a global endpoint (company_id IS NULL) or an
-- endpoint of the same company. A plain FK cannot express that because the
-- endpoint company column is nullable, so a trigger enforces it.
--
-- The function is SECURITY DEFINER because platform.integration_endpoints has
-- FORCE RLS and global rows are invisible to the application. As with
-- audit.append_event, the migration owner must have BYPASSRLS; without it every
-- integration link insert fails closed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION platform.enforce_integration_link_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, pg_catalog
AS $$
DECLARE
  v_endpoint_company uuid;
BEGIN
  SELECT company_id INTO v_endpoint_company
  FROM platform.integration_endpoints
  WHERE id = NEW.integration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'integration endpoint % does not exist', NEW.integration_id
      USING ERRCODE = '23503';
  END IF;

  IF v_endpoint_company IS NOT NULL AND v_endpoint_company <> NEW.company_id THEN
    -- Same message as a missing endpoint so tenants cannot probe other
    -- companies' endpoint ids.
    RAISE EXCEPTION 'integration endpoint % does not exist', NEW.integration_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION platform.enforce_integration_link_tenant() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_integration_links_tenant ON platform.integration_links;
CREATE TRIGGER trg_integration_links_tenant
  BEFORE INSERT OR UPDATE ON platform.integration_links
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_integration_link_tenant();

-- ---------------------------------------------------------------------------
-- RLS for HRIS login rules and logs. Both tables carry connection_id instead of
-- company_id, so the policy follows the owning connection.
-- ---------------------------------------------------------------------------

ALTER TABLE core.hris_login_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.hris_login_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.hris_login_rules;
CREATE POLICY tenant_isolation ON core.hris_login_rules
  USING (EXISTS (
    SELECT 1 FROM core.hris_connections c
    WHERE c.id = connection_id
      AND c.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM core.hris_connections c
    WHERE c.id = connection_id
      AND c.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  ));

ALTER TABLE core.hris_login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.hris_login_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.hris_login_logs;
CREATE POLICY tenant_isolation ON core.hris_login_logs
  USING (EXISTS (
    SELECT 1 FROM core.hris_connections c
    WHERE c.id = connection_id
      AND c.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM core.hris_connections c
    WHERE c.id = connection_id
      AND c.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  ));

-- ---------------------------------------------------------------------------
-- RLS on login_attempts partitions. Policies are not inherited by partitions,
-- so the same policy is applied to every existing child table. The partition
-- maintenance job must create this policy (and keep RLS enabled and forced) for
-- each new monthly partition.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_expr text := 'company_id = NULLIF(current_setting(''app.company_id'', true), '''')::uuid';
  v_partition record;
BEGIN
  FOR v_partition IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace pn ON pn.oid = p.relnamespace
    WHERE pn.nspname = 'core'
      AND p.relname = 'login_attempts'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      v_partition.schema_name, v_partition.table_name
    );
    EXECUTE format(
      'ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
      v_partition.schema_name, v_partition.table_name
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = v_partition.schema_name
        AND c.relname = v_partition.table_name
        AND pol.polname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I.%I USING (%s) WITH CHECK (%s)',
        v_partition.schema_name, v_partition.table_name, v_expr, v_expr
      );
    END IF;
  END LOOP;
END;
$$;
