-- WP-02 core constraints, partial unique indexes, composite foreign keys,
-- membership-role tenant guard, and monthly login_attempts partitions.
-- This file is the canonical SQL copied into
-- prisma/migrations/20261030000200_core_constraints/migration.sql.

-- ---------------------------------------------------------------------------
-- CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE core.companies
  ADD CONSTRAINT companies_locale_check CHECK (locale IN ('en', 'id'));

ALTER TABLE core.users
  ADD CONSTRAINT users_locale_check CHECK (locale IN ('en', 'id'));

ALTER TABLE core.areas
  ADD CONSTRAINT areas_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);

ALTER TABLE core.user_platform_roles
  ADD CONSTRAINT user_platform_roles_role_code_check
  CHECK (role_code IN ('platform_owner', 'platform_support', 'platform_security'));

ALTER TABLE core.membership_roles
  ADD CONSTRAINT membership_roles_scope_check
  CHECK (
    (scope_type = 'company' AND scope_id IS NULL)
    OR (scope_type = 'area' AND scope_id IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- Partial unique indexes
-- ---------------------------------------------------------------------------

-- A soft-deleted area may keep its code; only active rows are unique.
DROP INDEX core.areas_company_id_code_key;
CREATE UNIQUE INDEX areas_company_id_code_active_key
  ON core.areas (company_id, code)
  WHERE deleted_at IS NULL;

-- Employee numbers are unique per company only when present.
DROP INDEX core.company_memberships_company_id_employee_no_key;
CREATE UNIQUE INDEX company_memberships_company_id_employee_no_active_key
  ON core.company_memberships (company_id, employee_no)
  WHERE employee_no IS NOT NULL;

-- Global provider identities use company_id IS NULL. PostgreSQL treats NULLs as
-- distinct in a plain unique index, so add the partial index for the NULL case.
CREATE UNIQUE INDEX user_identities_global_provider_key
  ON core.user_identities (provider, provider_subject)
  WHERE company_id IS NULL;

-- Company-scoped membership roles have scope_id IS NULL; prevent duplicate
-- company-wide grants because the plain unique index treats NULLs as distinct.
CREATE UNIQUE INDEX membership_roles_company_scope_key
  ON core.membership_roles (membership_id, role_id, scope_type)
  WHERE scope_id IS NULL;

-- Access review items with a company scope have the same NULL uniqueness issue.
CREATE UNIQUE INDEX access_review_items_company_scope_key
  ON audit.access_review_items (review_id, membership_id, role_id, scope_type)
  WHERE scope_id IS NULL;

-- Platform-level settings and flags have company_id IS NULL. These partial
-- indexes make the documented (company_id, key) uniqueness meaningful for the
-- global rows as well.
CREATE UNIQUE INDEX settings_platform_key_key
  ON platform.settings (key)
  WHERE company_id IS NULL;

CREATE UNIQUE INDEX feature_flags_platform_key_key
  ON platform.feature_flags (key)
  WHERE company_id IS NULL;

CREATE UNIQUE INDEX data_retention_policies_platform_class_key
  ON audit.data_retention_policies (data_class)
  WHERE company_id IS NULL;

CREATE UNIQUE INDEX integration_endpoints_platform_name_key
  ON platform.integration_endpoints (name)
  WHERE company_id IS NULL;

-- ---------------------------------------------------------------------------
-- Composite foreign keys: a row may only reference another row in the same
-- company (and, for locations, the same area).
-- ---------------------------------------------------------------------------

ALTER TABLE core.areas
  ADD CONSTRAINT fk_areas_parent_company
  FOREIGN KEY (company_id, parent_id)
  REFERENCES core.areas (company_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE core.locations
  ADD CONSTRAINT fk_locations_area_company
  FOREIGN KEY (company_id, area_id)
  REFERENCES core.areas (company_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE core.locations
  ADD CONSTRAINT fk_locations_parent_same_area
  FOREIGN KEY (company_id, area_id, parent_id)
  REFERENCES core.locations (company_id, area_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE core.company_memberships
  ADD CONSTRAINT fk_company_memberships_default_area
  FOREIGN KEY (company_id, default_area_id)
  REFERENCES core.areas (company_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- membership_roles has no company_id column, so a trigger validates that the
-- membership, role, and optional area all belong to the same company.
-- ---------------------------------------------------------------------------

CREATE FUNCTION core.enforce_membership_role_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_membership_company uuid;
  v_role_company uuid;
  v_area_company uuid;
BEGIN
  SELECT company_id INTO v_membership_company
  FROM core.company_memberships
  WHERE id = NEW.membership_id;

  IF v_membership_company IS NULL THEN
    RAISE EXCEPTION 'membership % does not exist', NEW.membership_id
      USING ERRCODE = '23503';
  END IF;

  SELECT company_id INTO v_role_company
  FROM core.roles
  WHERE id = NEW.role_id;

  IF v_role_company IS NULL THEN
    RAISE EXCEPTION 'role % does not exist', NEW.role_id
      USING ERRCODE = '23503';
  END IF;

  IF v_role_company <> v_membership_company THEN
    RAISE EXCEPTION 'role % belongs to a different company than membership %',
      NEW.role_id, NEW.membership_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.scope_type = 'area' THEN
    SELECT company_id INTO v_area_company
    FROM core.areas
    WHERE id = NEW.scope_id;

    IF v_area_company IS NULL THEN
      RAISE EXCEPTION 'area % does not exist', NEW.scope_id
        USING ERRCODE = '23503';
    END IF;

    IF v_area_company <> v_membership_company THEN
      RAISE EXCEPTION 'area % belongs to a different company than membership %',
        NEW.scope_id, NEW.membership_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_membership_roles_tenant
  BEFORE INSERT OR UPDATE ON core.membership_roles
  FOR EACH ROW EXECUTE FUNCTION core.enforce_membership_role_tenant();

-- ---------------------------------------------------------------------------
-- Monthly partitions for core.login_attempts. The maintenance job owns future
-- partition creation; the application role has no DDL rights.
-- ---------------------------------------------------------------------------

CREATE TABLE core.login_attempts_2026_10 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE core.login_attempts_2026_11 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE core.login_attempts_2026_12 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE core.login_attempts_2027_01 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE core.login_attempts_2027_02 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE core.login_attempts_2027_03 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE core.login_attempts_2027_04 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE core.login_attempts_2027_05 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE core.login_attempts_2027_06 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE core.login_attempts_2027_07 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE core.login_attempts_2027_08 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE core.login_attempts_2027_09 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
