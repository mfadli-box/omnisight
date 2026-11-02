-- WP-02 P0 tenant integrity tests: composite foreign keys, integration link
-- tenant trigger, HRIS login RLS, and direct-partition RLS for login_attempts.

SELECT osc_test.assert_true(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'core' AND c.relname = 'hris_login_rules'),
  'hris_login_rules has forced RLS'
);
SELECT osc_test.assert_true(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'core' AND c.relname = 'hris_login_logs'),
  'hris_login_logs has forced RLS'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM pg_inherits i
   JOIN pg_class c ON c.oid = i.inhrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   JOIN pg_class p ON p.oid = i.inhparent
   JOIN pg_namespace pn ON pn.oid = p.relnamespace
   WHERE pn.nspname = 'core'
     AND p.relname = 'login_attempts'
     AND (NOT c.relrowsecurity
          OR NOT c.relforcerowsecurity
          OR NOT EXISTS (
            SELECT 1 FROM pg_policy pol
            WHERE pol.polrelid = c.oid AND pol.polname = 'tenant_isolation'
          ))),
  '0',
  'every login_attempts partition has forced tenant RLS'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM pg_constraint
   WHERE conname IN (
     'fk_access_review_items_review_company',
     'fk_access_review_items_membership_company',
     'fk_access_review_items_role_company',
     'fk_webhook_deliveries_webhook_company',
     'fk_integration_links_integration'
   )),
  '5',
  'tenant integrity foreign keys exist'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'platform'
     AND c.relname = 'integration_links'
     AND t.tgname = 'trg_integration_links_tenant'
     AND NOT t.tgisinternal),
  '1',
  'integration link tenant trigger exists'
);

BEGIN;

-- Fixtures are written as the migration owner; the app role must never need to
-- create another company's review, endpoint, connection, or webhook.
INSERT INTO audit.access_reviews
  (id, company_id, period_start, period_end, status, reviewer_user_id, due_at, created_at, updated_at)
VALUES
  ('81000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
   '2026-10-01', '2026-10-31', 'draft', '30000000-0000-4000-8000-0000000000a1',
   '2026-11-30T00:00:00Z', now(), now()),
  ('81000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b',
   '2026-10-01', '2026-10-31', 'draft', '30000000-0000-4000-8000-0000000000b1',
   '2026-11-30T00:00:00Z', now(), now());

INSERT INTO platform.webhooks
  (id, company_id, name, url, secret_ref, events, enabled, created_at, updated_at)
VALUES
  ('82000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
   'Hook A', 'https://hooks.example.invalid/a', 'vault://placeholder', '[]'::jsonb, true, now(), now()),
  ('82000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b',
   'Hook B', 'https://hooks.example.invalid/b', 'vault://placeholder', '[]'::jsonb, true, now(), now());

INSERT INTO platform.integration_endpoints
  (id, company_id, kind, name, base_url, credential_ref, config, status, created_at, updated_at)
VALUES
  ('83000000-0000-4000-8000-000000000001', NULL,
   'hris', 'Global HRIS', 'https://global.example.invalid', 'vault://placeholder', '{}'::jsonb, 'active', now(), now()),
  ('83000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
   'hris', 'Endpoint A', 'https://a.example.invalid', 'vault://placeholder', '{}'::jsonb, 'active', now(), now()),
  ('83000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b',
   'hris', 'Endpoint B', 'https://b.example.invalid', 'vault://placeholder', '{}'::jsonb, 'active', now(), now());

INSERT INTO core.hris_connections
  (id, company_id, name, base_url, auth_type, credential_ref, extra_headers, tls_policy,
   timeout_ms, max_retries, status, created_at, updated_at)
VALUES
  ('84000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
   'HRIS A', 'https://hris-a.example.invalid', 'api_key', 'vault://placeholder', '{}'::jsonb,
   'verify_full', 5000, 1, 'active', now(), now()),
  ('84000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b',
   'HRIS B', 'https://hris-b.example.invalid', 'api_key', 'vault://placeholder', '{}'::jsonb,
   'verify_full', 5000, 1, 'active', now(), now());

INSERT INTO core.hris_login_rules
  (id, connection_id, name, priority, is_active, match_conditions, request_spec,
   success_when, field_map, role_map, failure_map, fallback_policy, version, created_at, updated_at)
VALUES
  ('85000000-0000-4000-8000-0000000000a1', '84000000-0000-4000-8000-0000000000a1',
   'Rule A', 100, true, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
   '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 1, now(), now()),
  ('85000000-0000-4000-8000-0000000000b1', '84000000-0000-4000-8000-0000000000b1',
   'Rule B', 100, true, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
   '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 1, now(), now());

INSERT INTO core.hris_login_logs
  (id, connection_id, rule_id, identifier_hash, result, http_status, latency_ms, request_id, created_at)
VALUES
  ('86000000-0000-4000-8000-0000000000a1', '84000000-0000-4000-8000-0000000000a1',
   '85000000-0000-4000-8000-0000000000a1', '\x01'::bytea, 'success', 200, 12,
   '70000000-0000-4000-8000-0000000000a1', now()),
  ('86000000-0000-4000-8000-0000000000b1', '84000000-0000-4000-8000-0000000000b1',
   '85000000-0000-4000-8000-0000000000b1', '\x02'::bytea, 'success', 200, 12,
   '70000000-0000-4000-8000-0000000000b1', now());

INSERT INTO core.login_attempts
  (id, company_id, identifier_hash, method, result, ip, user_agent, request_id, latency_ms, created_at)
VALUES
  ('87000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
   '\x03'::bytea, 'password', 'success', '192.0.2.10', 'wp02-test',
   '70000000-0000-4000-8000-0000000000a3', 15, '2026-11-15T00:00:00Z'),
  ('87000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b',
   '\x04'::bytea, 'password', 'success', '192.0.2.11', 'wp02-test',
   '70000000-0000-4000-8000-0000000000b3', 15, '2026-11-15T00:00:00Z');

SET LOCAL ROLE osc_rest_app;
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000a';

-- Same-company composite foreign keys accept the row.
INSERT INTO audit.access_review_items
  (id, company_id, review_id, membership_id, role_id, scope_type, scope_id, decision)
VALUES
  ('81000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a',
   '81000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1',
   '092f65ae-51cc-5a56-85aa-5383dd763ffa', 'company', NULL, 'pending');

INSERT INTO platform.webhook_deliveries
  (id, company_id, webhook_id, event_type, payload_ref, status, attempt)
VALUES
  ('82010000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
   '82000000-0000-4000-8000-0000000000a1', 'asset.updated', 's3://placeholder/evt-a.json', 'pending', 1);

-- A company link may target a global endpoint or its own endpoint.
INSERT INTO platform.integration_links
  (id, company_id, integration_id, local_type, local_id, external_type, external_id, sync_direction, updated_at)
VALUES
  ('83100000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
   '83000000-0000-4000-8000-000000000001', 'asset', '90000000-0000-4000-8000-0000000000a1',
   'asset', 'ext-global', 'push', now()),
  ('83100000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a',
   '83000000-0000-4000-8000-0000000000a1', 'asset', '90000000-0000-4000-8000-0000000000a2',
   'asset', 'ext-a', 'push', now());

SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM audit.access_review_items),
  '1',
  'company A can insert its own access review item'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM platform.webhook_deliveries),
  '1',
  'company A can insert its own webhook delivery'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM platform.integration_links),
  '2',
  'company A can link global and own integration endpoints'
);

-- HRIS rows follow the owning connection.
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.hris_login_rules),
  '1',
  'company A sees only its HRIS login rule'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.hris_login_logs),
  '1',
  'company A sees only its HRIS login log'
);

INSERT INTO core.hris_login_rules
  (id, connection_id, name, priority, is_active, match_conditions, request_spec,
   success_when, field_map, role_map, failure_map, fallback_policy, version, created_at, updated_at)
VALUES
  ('85000000-0000-4000-8000-0000000000a2', '84000000-0000-4000-8000-0000000000a1',
   'Rule A2', 100, true, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
   '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 1, now(), now());

INSERT INTO core.hris_login_logs
  (id, connection_id, rule_id, identifier_hash, result, http_status, latency_ms, request_id, created_at)
VALUES
  ('86000000-0000-4000-8000-0000000000a2', '84000000-0000-4000-8000-0000000000a1',
   '85000000-0000-4000-8000-0000000000a1', '\x05'::bytea, 'success', 200, 12,
   '70000000-0000-4000-8000-0000000000a4', now());

SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.hris_login_rules),
  '2',
  'company A can add a rule to its own connection'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.hris_login_logs),
  '2',
  'company A can add a log to its own connection'
);

-- login_attempts is visible through the parent and through the partition.
INSERT INTO core.login_attempts
  (id, company_id, identifier_hash, method, result, ip, user_agent, request_id, latency_ms, created_at)
VALUES
  ('87000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a',
   '\x06'::bytea, 'password', 'success', '192.0.2.12', 'wp02-test',
   '70000000-0000-4000-8000-0000000000a5', 15, '2026-11-16T00:00:00Z');

SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.login_attempts),
  '2',
  'company A sees its own login attempts through the parent'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.login_attempts_2026_11),
  '2',
  'company A sees its own login attempts through the partition'
);

-- Cross-company references are rejected.
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO audit.access_review_items
    (id, company_id, review_id, membership_id, role_id, scope_type, scope_id, decision)
  VALUES
    ('81000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000a',
     '81000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000a1',
     '092f65ae-51cc-5a56-85aa-5383dd763ffa', 'company', NULL, 'pending')
  $sql$,
  '23503',
  'cross-company access review is blocked'
);
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO audit.access_review_items
    (id, company_id, review_id, membership_id, role_id, scope_type, scope_id, decision)
  VALUES
    ('81000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000000a',
     '81000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000b1',
     '092f65ae-51cc-5a56-85aa-5383dd763ffa', 'company', NULL, 'pending')
  $sql$,
  '23503',
  'cross-company access review membership is blocked'
);
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO audit.access_review_items
    (id, company_id, review_id, membership_id, role_id, scope_type, scope_id, decision)
  VALUES
    ('81000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-00000000000a',
     '81000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1',
     'f7e104b6-0bbb-5986-a3a3-6904acab2710', 'company', NULL, 'pending')
  $sql$,
  '23503',
  'cross-company access review role is blocked'
);
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO platform.webhook_deliveries
    (id, company_id, webhook_id, event_type, payload_ref, status, attempt)
  VALUES
    ('82010000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a',
     '82000000-0000-4000-8000-0000000000b1', 'asset.updated', 's3://placeholder/evt-b.json', 'pending', 1)
  $sql$,
  '23503',
  'cross-company webhook delivery is blocked'
);
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO platform.integration_links
    (id, company_id, integration_id, local_type, local_id, external_type, external_id, sync_direction, updated_at)
  VALUES
    ('83100000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000a',
     '83000000-0000-4000-8000-0000000000b1', 'asset', '90000000-0000-4000-8000-0000000000a3',
     'asset', 'ext-b', 'push', now())
  $sql$,
  '23503',
  'cross-company integration endpoint is blocked'
);
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO core.hris_login_rules
    (id, connection_id, name, priority, is_active, match_conditions, request_spec,
     success_when, field_map, role_map, failure_map, fallback_policy, version, created_at, updated_at)
  VALUES
    ('85000000-0000-4000-8000-0000000000a3', '84000000-0000-4000-8000-0000000000b1',
     'Rule B2', 100, true, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
     '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 1, now(), now())
  $sql$,
  '42501',
  'cross-company HRIS rule insert is blocked by RLS'
);
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO core.hris_login_logs
    (id, connection_id, rule_id, identifier_hash, result, http_status, latency_ms, request_id, created_at)
  VALUES
    ('86000000-0000-4000-8000-0000000000a3', '84000000-0000-4000-8000-0000000000b1',
     '85000000-0000-4000-8000-0000000000b1', '\x07'::bytea, 'success', 200, 12,
     '70000000-0000-4000-8000-0000000000a6', now())
  $sql$,
  '42501',
  'cross-company HRIS log insert is blocked by RLS'
);
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO core.login_attempts_2026_11
    (id, company_id, identifier_hash, method, result, ip, user_agent, request_id, latency_ms, created_at)
  VALUES
    ('87000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000b',
     '\x08'::bytea, 'password', 'success', '192.0.2.13', 'wp02-test',
     '70000000-0000-4000-8000-0000000000a7', 15, '2026-11-17T00:00:00Z')
  $sql$,
  '42501',
  'direct partition insert for another company is blocked by RLS'
);

-- Without app.company_id neither HRIS nor login_attempts rows are visible.
RESET app.company_id;
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.hris_login_rules), '0', 'HRIS rules invisible without company setting');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.hris_login_logs), '0', 'HRIS logs invisible without company setting');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.login_attempts), '0', 'login attempts invisible without company setting');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.login_attempts_2026_11), '0', 'login attempt partition invisible without company setting');

SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000b';
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.hris_login_rules), '1', 'company B sees only its HRIS login rule');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.hris_login_logs), '1', 'company B sees only its HRIS login log');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.login_attempts), '1', 'company B sees only its login attempt');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.login_attempts_2026_11), '1', 'company B sees only its login attempt partition row');

ROLLBACK;
