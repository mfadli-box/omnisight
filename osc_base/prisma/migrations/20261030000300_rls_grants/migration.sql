-- WP-02 application role and grants.
-- osc_rest_app is a NOLOGIN group role. Deployments create a separate login
-- role that is a member of osc_rest_app; no password or credential is stored
-- in this repository.
-- This file is the canonical SQL copied into
-- prisma/migrations/20261030000300_rls_grants/migration.sql.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'osc_rest_app') THEN
    CREATE ROLE osc_rest_app
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA core, asset, network, monitor, ops, service, content, audit, platform
  TO osc_rest_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA core, asset, network, monitor, ops, service, content, platform
  TO osc_rest_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA audit
  TO osc_rest_app;

-- audit.audit_events is append-only for the application.
REVOKE UPDATE, DELETE ON audit.audit_events FROM osc_rest_app;
GRANT SELECT, INSERT ON audit.audit_events TO osc_rest_app;

-- Chain heads are maintained only by audit.append_event(), not by the app.
REVOKE INSERT, UPDATE, DELETE ON audit.audit_chain_heads FROM osc_rest_app;
GRANT SELECT ON audit.audit_chain_heads TO osc_rest_app;

GRANT USAGE, SELECT ON ALL SEQUENCES
  IN SCHEMA core, asset, network, monitor, ops, service, content, audit, platform
  TO osc_rest_app;

ALTER DEFAULT PRIVILEGES
  IN SCHEMA core, asset, network, monitor, ops, service, content, platform
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO osc_rest_app;

ALTER DEFAULT PRIVILEGES
  IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO osc_rest_app;

ALTER DEFAULT PRIVILEGES
  IN SCHEMA core, asset, network, monitor, ops, service, content, audit, platform
  GRANT USAGE, SELECT ON SEQUENCES TO osc_rest_app;

-- WP-02 row level security.
-- Every table that carries company_id is a tenant table. RLS is enabled and
-- forced so the table owner is also subject to policy; the application role
-- osc_rest_app is never the table owner. A transaction must set:
--   SET LOCAL app.company_id = '<company uuid>';
-- Without that setting current_setting(..., true) is NULL and no tenant rows
-- are visible.
-- This file is the canonical SQL copied into
-- prisma/migrations/20261030000300_rls_grants/migration.sql.

ALTER TABLE core.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.areas FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.areas
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE core.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.locations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.locations
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE core.company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.company_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.company_memberships
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE core.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.roles
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE core.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.login_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.login_attempts
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE core.hris_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.hris_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.hris_connections
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE core.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.vendors
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE core.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.files
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE core.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.api_keys
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

-- Derived tenant tables without a company_id column. The policy follows the
-- parent membership/role so the app cannot read another company's grants.
ALTER TABLE core.membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.membership_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.membership_roles
  USING (EXISTS (
    SELECT 1 FROM core.company_memberships m
    WHERE m.id = membership_id
      AND m.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM core.company_memberships m
    WHERE m.id = membership_id
      AND m.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  ));

ALTER TABLE core.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.role_permissions
  USING (EXISTS (
    SELECT 1 FROM core.roles r
    WHERE r.id = role_id
      AND r.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM core.roles r
    WHERE r.id = role_id
      AND r.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  ));

ALTER TABLE audit.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit.audit_events
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE audit.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.security_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit.security_events
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE audit.access_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.access_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit.access_reviews
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE audit.access_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.access_review_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit.access_review_items
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE audit.data_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.data_retention_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit.data_retention_policies
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE platform.integration_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.integration_endpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.integration_endpoints
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE platform.integration_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.integration_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.integration_links
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE platform.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.webhooks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.webhooks
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE platform.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.webhook_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.webhook_deliveries
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE platform.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.settings
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE platform.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.feature_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.feature_flags
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE platform.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.outbox_events
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE platform.impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.impersonation_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.impersonation_sessions
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
