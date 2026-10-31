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
