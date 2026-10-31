-- WP-02 RLS, grants, composite foreign key, partial unique, and tenant trigger tests.
SELECT osc_test.assert_eq(
  (SELECT rolbypassrls::text FROM pg_roles WHERE rolname = 'osc_rest_app'),
  'false',
  'osc_rest_app must not bypass RLS'
);

SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM information_schema.columns c
   JOIN pg_namespace n ON n.nspname = c.table_schema
   JOIN pg_class r ON r.relname = c.table_name AND r.relnamespace = n.oid
   WHERE c.table_schema IN ('core', 'audit', 'platform')
     AND c.column_name = 'company_id'
     AND r.relkind = 'r'
     AND NOT r.relispartition
     -- user_identities is intentionally cross-tenant per skema-inti.md; its
     -- global rows (company_id IS NULL) are not tenant-scoped.
     AND NOT (c.table_schema = 'core' AND c.table_name = 'user_identities')
     AND (NOT r.relrowsecurity OR NOT r.relforcerowsecurity)),
  '0',
  'every table with company_id must have ENABLE and FORCE RLS'
);

-- No app.company_id setting: no tenant rows are visible.
BEGIN;
SET LOCAL ROLE osc_rest_app;
RESET app.company_id;
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.areas), '0', 'areas invisible without company setting');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.roles), '0', 'roles invisible without company setting');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.membership_roles), '0', 'membership roles invisible without company setting');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.role_permissions), '0', 'role permissions invisible without company setting');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM audit.audit_events), '0', 'audit events invisible without company setting');
ROLLBACK;

-- Company A sees only its two areas, seven roles, and one membership.
BEGIN;
SET LOCAL ROLE osc_rest_app;
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000a';
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.areas), '2', 'company A areas');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.locations), '2', 'company A locations');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.roles), '7', 'company A roles');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.company_memberships), '1', 'company A memberships');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.membership_roles), '1', 'company A membership roles');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.role_permissions), '162', 'company A role permissions');
ROLLBACK;

-- The app can insert a valid area-scoped role for its own membership.
BEGIN;
SET LOCAL ROLE osc_rest_app;
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000a';
INSERT INTO core.membership_roles (id, membership_id, role_id, scope_type, scope_id, granted_by, created_at)
VALUES (gen_random_uuid(), '40000000-0000-4000-8000-0000000000a1', '092f65ae-51cc-5a56-85aa-5383dd763ffa', 'area', '10000000-0000-4000-8000-0000000000a1', NULL, now());
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.membership_roles), '2', 'company A can add its own membership role');
ROLLBACK;

-- RLS blocks a role-permission row for another company's role.
BEGIN;
SET LOCAL ROLE osc_rest_app;
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000a';
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO core.role_permissions (role_id, permission_id)
  VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', (SELECT id FROM core.permissions WHERE module_code = 'AA' AND action = 'read'))
  $sql$,
  '42501',
  'cross-company role permission insert is blocked by RLS'
);
ROLLBACK;

-- Company B sees only its two areas and seven roles.
BEGIN;
SET LOCAL ROLE osc_rest_app;
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000b';
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.areas), '2', 'company B areas');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.roles), '7', 'company B roles');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.membership_roles), '1', 'company B membership roles');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.role_permissions), '162', 'company B role permissions');
ROLLBACK;

-- WITH CHECK blocks writing a row for another company.
BEGIN;
SET LOCAL ROLE osc_rest_app;
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000a';
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO core.areas (id, company_id, parent_id, path, code, name, type, status, created_at, updated_at)
  VALUES (gen_random_uuid(), '00000000-0000-4000-8000-00000000000b', NULL, 'evil'::ltree, 'evil', 'Evil', 'branch', 'active', now(), now())
  $sql$,
  '42501',
  'cross-company area insert is blocked by RLS'
);
ROLLBACK;

-- A composite foreign key rejects a location whose area belongs to another company.
BEGIN;
SET LOCAL ROLE osc_rest_app;
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000a';
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO core.locations (id, company_id, area_id, parent_id, code, name, type, address, status, created_at, updated_at)
  VALUES (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-0000000000b1', NULL, 'cross', 'Cross', 'site', '{}'::jsonb, 'active', now(), now())
  $sql$,
  '23503',
  'cross-company location insert is blocked by composite FK'
);
ROLLBACK;

-- A soft-deleted area code can be reused by a new active area.
BEGIN;
SET LOCAL ROLE osc_rest_app;
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000a';
UPDATE core.areas
SET deleted_at = now(), updated_at = now()
WHERE id = '10000000-0000-4000-8000-0000000000a1';
INSERT INTO core.areas (id, company_id, parent_id, path, code, name, type, status, created_at, updated_at)
VALUES (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', NULL, 'north_reuse'::ltree, 'north', 'North Reuse', 'branch', 'active', now(), now());
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.areas WHERE code = 'north' AND deleted_at IS NULL),
  '1',
  'active area code is unique after soft delete'
);
ROLLBACK;

-- Global provider identities are unique when company_id IS NULL.
BEGIN;
INSERT INTO core.user_identities (id, user_id, provider, provider_subject, company_id, metadata, updated_at)
VALUES (gen_random_uuid(), '30000000-0000-4000-8000-0000000000a1', 'oidc', 'global-subject', NULL, '{}'::jsonb, now());
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO core.user_identities (id, user_id, provider, provider_subject, company_id, metadata, updated_at)
  VALUES (gen_random_uuid(), '30000000-0000-4000-8000-0000000000b1', 'oidc', 'global-subject', NULL, '{}'::jsonb, now())
  $sql$,
  '23505',
  'global provider identity is unique'
);
INSERT INTO core.user_identities (id, user_id, provider, provider_subject, company_id, metadata, updated_at)
VALUES
  (gen_random_uuid(), '30000000-0000-4000-8000-0000000000a1', 'oidc', 'company-subject', '00000000-0000-4000-8000-00000000000a', '{}'::jsonb, now()),
  (gen_random_uuid(), '30000000-0000-4000-8000-0000000000b1', 'oidc', 'company-subject', '00000000-0000-4000-8000-00000000000b', '{}'::jsonb, now());
ROLLBACK;

-- The membership-role trigger rejects a role from another company.
BEGIN;
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO core.membership_roles (id, membership_id, role_id, scope_type, scope_id, granted_by, created_at)
  VALUES (gen_random_uuid(), '40000000-0000-4000-8000-0000000000a1', 'f7e104b6-0bbb-5986-a3a3-6904acab2710', 'company', NULL, NULL, now())
  $sql$,
  '23514',
  'membership role trigger rejects cross-company role'
);
ROLLBACK;

-- The membership-role trigger rejects an area from another company.
BEGIN;
SELECT osc_test.assert_fails(
  $sql$
  INSERT INTO core.membership_roles (id, membership_id, role_id, scope_type, scope_id, granted_by, created_at)
  VALUES (gen_random_uuid(), '40000000-0000-4000-8000-0000000000a1', '092f65ae-51cc-5a56-85aa-5383dd763ffa', 'area', '10000000-0000-4000-8000-0000000000b1', NULL, now())
  $sql$,
  '23514',
  'membership role trigger rejects cross-company area'
);
ROLLBACK;
