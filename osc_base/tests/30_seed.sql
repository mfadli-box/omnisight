-- WP-02 seed counts and idempotency checks. The runner executes seed.sql twice
-- before this file, so these counts also prove the seed did not duplicate rows.
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.companies), '2', 'seed companies');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.areas), '4', 'seed areas');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.locations), '4', 'seed locations');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.users), '2', 'seed users');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.company_memberships), '2', 'seed memberships');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.membership_roles), '2', 'seed membership roles');

SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.permissions), '64', 'seed permission codes');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.permissions WHERE is_sensitive), '39', 'seed sensitive permission codes');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.roles), '14', 'seed system roles for two companies');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.roles WHERE is_system), '14', 'all seeded roles are system roles');
SELECT osc_test.assert_eq((SELECT count(*)::text FROM core.role_permissions), '324', 'seed role-permission rows for two companies');

SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM core.role_permissions rp
   JOIN core.roles r ON r.id = rp.role_id
   JOIN core.companies c ON c.id = r.company_id
   WHERE c.code = 'company-a' AND r.code = 'company_admin'),
  '61',
  'company_admin grants'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM core.role_permissions rp
   JOIN core.roles r ON r.id = rp.role_id
   JOIN core.companies c ON c.id = r.company_id
   WHERE c.code = 'company-a' AND r.code = 'area_manager'),
  '31',
  'area_manager grants'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM core.role_permissions rp
   JOIN core.roles r ON r.id = rp.role_id
   JOIN core.companies c ON c.id = r.company_id
   WHERE c.code = 'company-a' AND r.code = 'noc_operator'),
  '26',
  'noc_operator grants'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM core.role_permissions rp
   JOIN core.roles r ON r.id = rp.role_id
   JOIN core.companies c ON c.id = r.company_id
   WHERE c.code = 'company-a' AND r.code = 'field_technician'),
  '10',
  'field_technician grants'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM core.role_permissions rp
   JOIN core.roles r ON r.id = rp.role_id
   JOIN core.companies c ON c.id = r.company_id
   WHERE c.code = 'company-a' AND r.code = 'viewer'),
  '10',
  'viewer grants'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM core.role_permissions rp
   JOIN core.roles r ON r.id = rp.role_id
   JOIN core.companies c ON c.id = r.company_id
   WHERE c.code = 'company-a' AND r.code = 'auditor'),
  '18',
  'auditor grants'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text
   FROM core.role_permissions rp
   JOIN core.roles r ON r.id = rp.role_id
   JOIN core.companies c ON c.id = r.company_id
   WHERE c.code = 'company-a' AND r.code = 'requester'),
  '6',
  'requester grants'
);

-- Temporary platform role definitions in settings until ADR-017 is decided.
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM platform.settings WHERE key LIKE 'platform.role.%'),
  '3',
  'three temporary platform role definitions'
);
SELECT osc_test.assert_eq(
  (SELECT value->>'scope' FROM platform.settings WHERE key = 'platform.role.platform_owner'),
  'global',
  'platform_owner scope'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM platform.settings WHERE key = 'locale.default'),
  '1',
  'default locale setting'
);
SELECT osc_test.assert_eq(
  (SELECT value #>> '{}' FROM platform.settings WHERE key = 'locale.default'),
  'en',
  'default locale is en'
);

SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.users WHERE email::text NOT LIKE '%@example.invalid'),
  '0',
  'seed users use example.invalid addresses'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.users WHERE password_hash IS NOT NULL OR mfa_secret_ref IS NOT NULL),
  '0',
  'seed users contain no credentials'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM platform.settings WHERE is_secret),
  '0',
  'seed settings contain no secrets'
);
SELECT osc_test.assert_eq(
  (SELECT count(*)::text FROM core.membership_roles WHERE scope_type <> 'company' OR scope_id IS NOT NULL),
  '0',
  'seed membership roles are company-scoped'
);
