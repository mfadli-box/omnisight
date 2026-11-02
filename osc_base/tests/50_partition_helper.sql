-- WP-02 login_attempts partition helper: atomic creation, idempotency, RLS,
-- grants, and application-role separation.

BEGIN;

SELECT osc_test.assert_eq(
  core.ensure_login_attempts_partition('2027-10-01'),
  'core.login_attempts_2027_10',
  'helper creates the monthly partition'
);
SELECT osc_test.assert_eq(
  core.ensure_login_attempts_partition('2027-10-31'),
  'core.login_attempts_2027_10',
  'helper normalizes to the month and is idempotent'
);
SELECT osc_test.assert_eq(
  core.ensure_login_attempts_partition('2026-11-15'),
  'core.login_attempts_2026_11',
  'helper accepts an existing partition'
);

SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM pg_inherits i
   JOIN pg_class c ON c.oid = i.inhrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   JOIN pg_class p ON p.oid = i.inhparent
   JOIN pg_namespace pn ON pn.oid = p.relnamespace
   WHERE n.nspname = 'core'
     AND c.relname = 'login_attempts_2027_10'
     AND pn.nspname = 'core'
     AND p.relname = 'login_attempts'),
  '1',
  'exactly one partition per month'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM pg_policy
   WHERE polrelid = 'core.login_attempts_2027_10'::regclass
     AND polname = 'tenant_isolation'),
  '1',
  'exactly one tenant policy'
);
SELECT osc_test.assert_true(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class
   WHERE oid = 'core.login_attempts_2027_10'::regclass),
  'helper partition has forced RLS'
);
SELECT osc_test.assert_true(
  has_table_privilege('osc_rest_app', 'core.login_attempts_2027_10', 'INSERT'),
  'helper grants the application write access'
);
SELECT osc_test.assert_fails(
  $sql$SELECT core.ensure_login_attempts_partition(NULL)$sql$,
  '22023',
  'helper rejects a null month'
);

-- One row per company as the migration owner, then test direct partition access
-- as the application role.
INSERT INTO core.login_attempts
  (id, company_id, identifier_hash, method, result, ip, user_agent, request_id, latency_ms, created_at)
VALUES
  ('87000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a',
   '\x31'::bytea, 'password', 'success', '192.0.2.31', 'partition-test', gen_random_uuid(), 10,
   '2027-10-10T00:00:00Z'),
  ('87000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000000b',
   '\x32'::bytea, 'password', 'success', '192.0.2.32', 'partition-test', gen_random_uuid(), 10,
   '2027-10-11T00:00:00Z');

SET LOCAL ROLE osc_rest_app;
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000a';

SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.login_attempts_2027_10),
  '1',
  'helper partition isolates company A'
);

INSERT INTO core.login_attempts_2027_10
  (id, company_id, identifier_hash, method, result, ip, user_agent, request_id, latency_ms, created_at)
VALUES
  ('87000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-00000000000a',
   '\x33'::bytea, 'password', 'success', '192.0.2.33', 'partition-test', gen_random_uuid(), 10,
   '2027-10-12T00:00:00Z');

SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.login_attempts_2027_10),
  '2',
  'company A can insert into the helper partition'
);
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO core.login_attempts_2027_10
    (id, company_id, identifier_hash, method, result, ip, user_agent, request_id, latency_ms, created_at)
  VALUES
    ('87000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-00000000000b',
     '\x34'::bytea, 'password', 'success', '192.0.2.34', 'partition-test', gen_random_uuid(), 10,
     '2027-10-13T00:00:00Z')
  $sql$,
  '42501',
  'cross-company insert into the helper partition is blocked'
);
SELECT osc_test.assert_fails(
  $sql$SELECT core.ensure_login_attempts_partition('2027-11-01')$sql$,
  '42501',
  'application role cannot execute the helper'
);
SELECT osc_test.assert_fails(
  $sql$
  CREATE TABLE core.login_attempts_evil PARTITION OF core.login_attempts
    FOR VALUES FROM ('2030-01-01') TO ('2030-02-01')
  $sql$,
  '42501',
  'application role cannot create partitions'
);

RESET app.company_id;
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.login_attempts_2027_10),
  '0',
  'helper partition is invisible without a company setting'
);

SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000b';
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.login_attempts_2027_10),
  '1',
  'helper partition isolates company B'
);

ROLLBACK;
