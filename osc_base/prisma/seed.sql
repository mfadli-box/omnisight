-- WP-02 idempotent seed. Synthetic companies and users only; no real personal data.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/seed.sql
-- The seed is safe to run repeatedly: every row has a fixed id or a stable unique key.

BEGIN;

-- Companies
INSERT INTO core.companies (id, code, name, status, timezone, locale, settings, created_at, updated_at) VALUES
  ('00000000-0000-4000-8000-00000000000a', 'company-a', 'Company A', 'active', 'Asia/Jakarta', 'en', '{}'::jsonb, now(), now())
ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code, name=EXCLUDED.name, status=EXCLUDED.status, timezone=EXCLUDED.timezone, locale=EXCLUDED.locale, settings=EXCLUDED.settings, updated_at=now();
INSERT INTO core.companies (id, code, name, status, timezone, locale, settings, created_at, updated_at) VALUES
  ('00000000-0000-4000-8000-00000000000b', 'company-b', 'Company B', 'active', 'Asia/Jakarta', 'en', '{}'::jsonb, now(), now())
ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code, name=EXCLUDED.name, status=EXCLUDED.status, timezone=EXCLUDED.timezone, locale=EXCLUDED.locale, settings=EXCLUDED.settings, updated_at=now();

-- Areas
INSERT INTO core.areas (id, company_id, parent_id, path, code, name, type, status, created_at, updated_at) VALUES
  ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', NULL, 'north'::ltree, 'north', 'North', 'branch', 'active', now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, parent_id=EXCLUDED.parent_id, path=EXCLUDED.path, code=EXCLUDED.code, name=EXCLUDED.name, type=EXCLUDED.type, status=EXCLUDED.status, updated_at=now();
INSERT INTO core.areas (id, company_id, parent_id, path, code, name, type, status, created_at, updated_at) VALUES
  ('10000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', NULL, 'south'::ltree, 'south', 'South', 'branch', 'active', now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, parent_id=EXCLUDED.parent_id, path=EXCLUDED.path, code=EXCLUDED.code, name=EXCLUDED.name, type=EXCLUDED.type, status=EXCLUDED.status, updated_at=now();
INSERT INTO core.areas (id, company_id, parent_id, path, code, name, type, status, created_at, updated_at) VALUES
  ('10000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', NULL, 'north'::ltree, 'north', 'North', 'branch', 'active', now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, parent_id=EXCLUDED.parent_id, path=EXCLUDED.path, code=EXCLUDED.code, name=EXCLUDED.name, type=EXCLUDED.type, status=EXCLUDED.status, updated_at=now();
INSERT INTO core.areas (id, company_id, parent_id, path, code, name, type, status, created_at, updated_at) VALUES
  ('10000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', NULL, 'south'::ltree, 'south', 'South', 'branch', 'active', now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, parent_id=EXCLUDED.parent_id, path=EXCLUDED.path, code=EXCLUDED.code, name=EXCLUDED.name, type=EXCLUDED.type, status=EXCLUDED.status, updated_at=now();

-- Locations
INSERT INTO core.locations (id, company_id, area_id, parent_id, code, name, type, address, status, created_at, updated_at) VALUES
  ('20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-0000000000a1', NULL, 'hq-north', 'North HQ', 'site', '{}'::jsonb, 'active', now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, area_id=EXCLUDED.area_id, parent_id=EXCLUDED.parent_id, code=EXCLUDED.code, name=EXCLUDED.name, type=EXCLUDED.type, address=EXCLUDED.address, status=EXCLUDED.status, updated_at=now();
INSERT INTO core.locations (id, company_id, area_id, parent_id, code, name, type, address, status, created_at, updated_at) VALUES
  ('20000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-0000000000a2', NULL, 'hq-south', 'South HQ', 'site', '{}'::jsonb, 'active', now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, area_id=EXCLUDED.area_id, parent_id=EXCLUDED.parent_id, code=EXCLUDED.code, name=EXCLUDED.name, type=EXCLUDED.type, address=EXCLUDED.address, status=EXCLUDED.status, updated_at=now();
INSERT INTO core.locations (id, company_id, area_id, parent_id, code, name, type, address, status, created_at, updated_at) VALUES
  ('20000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-0000000000b1', NULL, 'hq-north', 'North HQ', 'site', '{}'::jsonb, 'active', now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, area_id=EXCLUDED.area_id, parent_id=EXCLUDED.parent_id, code=EXCLUDED.code, name=EXCLUDED.name, type=EXCLUDED.type, address=EXCLUDED.address, status=EXCLUDED.status, updated_at=now();
INSERT INTO core.locations (id, company_id, area_id, parent_id, code, name, type, address, status, created_at, updated_at) VALUES
  ('20000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-0000000000b2', NULL, 'hq-south', 'South HQ', 'site', '{}'::jsonb, 'active', now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, area_id=EXCLUDED.area_id, parent_id=EXCLUDED.parent_id, code=EXCLUDED.code, name=EXCLUDED.name, type=EXCLUDED.type, address=EXCLUDED.address, status=EXCLUDED.status, updated_at=now();

-- Users (synthetic .invalid addresses, no password hash)
INSERT INTO core.users (id, email, display_name, status, locale, created_at, updated_at) VALUES
  ('30000000-0000-4000-8000-0000000000a1', 'admin.a@example.invalid', 'Admin A', 'active', 'en', now(), now())
ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, status=EXCLUDED.status, locale=EXCLUDED.locale, updated_at=now();
INSERT INTO core.users (id, email, display_name, status, locale, created_at, updated_at) VALUES
  ('30000000-0000-4000-8000-0000000000b1', 'admin.b@example.invalid', 'Admin B', 'active', 'en', now(), now())
ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, status=EXCLUDED.status, locale=EXCLUDED.locale, updated_at=now();

-- Memberships
INSERT INTO core.company_memberships (id, company_id, user_id, employee_no, job_title, status, default_area_id, joined_at, created_at, updated_at) VALUES
  ('40000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-0000000000a1', 'EMP-A-001', 'Administrator', 'active', '10000000-0000-4000-8000-0000000000a1', now(), now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, user_id=EXCLUDED.user_id, employee_no=EXCLUDED.employee_no, job_title=EXCLUDED.job_title, status=EXCLUDED.status, default_area_id=EXCLUDED.default_area_id, updated_at=now();
INSERT INTO core.company_memberships (id, company_id, user_id, employee_no, job_title, status, default_area_id, joined_at, created_at, updated_at) VALUES
  ('40000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-0000000000b1', 'EMP-B-001', 'Administrator', 'active', '10000000-0000-4000-8000-0000000000b1', now(), now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, user_id=EXCLUDED.user_id, employee_no=EXCLUDED.employee_no, job_title=EXCLUDED.job_title, status=EXCLUDED.status, default_area_id=EXCLUDED.default_area_id, updated_at=now();

-- System roles (7 per company)
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('ee214005-1900-51ce-9511-3782e7e7ae5a', '00000000-0000-4000-8000-00000000000a', 'company_admin', 'Company Admin', 'Cannot approve own requests.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '00000000-0000-4000-8000-00000000000a', 'area_manager', 'Area Manager', 'Area and descendants only.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('f3431b73-744f-5176-9ad4-68b652adb24c', '00000000-0000-4000-8000-00000000000a', 'noc_operator', 'NOC Operator', 'May plan and execute after approval.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', '00000000-0000-4000-8000-00000000000a', 'field_technician', 'Field Technician', 'Assets and tickets in the assigned area.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('9900bc6e-ce86-5a07-be91-67bcd8275de8', '00000000-0000-4000-8000-00000000000a', 'viewer', 'Viewer', 'Read-only.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('3e64f8b5-0b13-5b6d-8815-f591256096df', '00000000-0000-4000-8000-00000000000a', 'auditor', 'Auditor', 'Reads audit and access reviews.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('cd39eb14-a2dd-50e6-af7d-2930c7b44b14', '00000000-0000-4000-8000-00000000000a', 'requester', 'Requester', 'Self-service only.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '00000000-0000-4000-8000-00000000000b', 'company_admin', 'Company Admin', 'Cannot approve own requests.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '00000000-0000-4000-8000-00000000000b', 'area_manager', 'Area Manager', 'Area and descendants only.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '00000000-0000-4000-8000-00000000000b', 'noc_operator', 'NOC Operator', 'May plan and execute after approval.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('79febc83-da75-50c0-8255-693247b90690', '00000000-0000-4000-8000-00000000000b', 'field_technician', 'Field Technician', 'Assets and tickets in the assigned area.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('43d99e82-54f7-5b5b-931f-de1ae3b22215', '00000000-0000-4000-8000-00000000000b', 'viewer', 'Viewer', 'Read-only.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('ee151e7a-ac72-545c-842a-e136ddb131ea', '00000000-0000-4000-8000-00000000000b', 'auditor', 'Auditor', 'Reads audit and access reviews.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();
INSERT INTO core.roles (id, company_id, code, name, description, is_system, created_at, updated_at) VALUES
  ('33d1cca7-23a9-5fed-90c9-6248284b4e76', '00000000-0000-4000-8000-00000000000b', 'requester', 'Requester', 'Self-service only.', true, now(), now())
ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id, code=EXCLUDED.code, name=EXCLUDED.name, description=EXCLUDED.description, is_system=EXCLUDED.is_system, updated_at=now();

-- Permissions (64 codes)
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('fe31d858-cdc8-5c30-b0e9-6b1def8de2de', 'AA', 'read', 'Dashboard (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('2c7c9bdf-4700-5b0f-a501-1a72177fabc9', 'AB02', 'post', 'AB02 Users and Invitations (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('ef57de94-85f6-5f67-8d2e-fe307a2d418a', 'AB02', 'read', 'AB02 Users and Invitations (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('3069584e-1cb1-57ef-9866-9b06f6052288', 'AB03', 'post', 'AB03 Roles and Permissions (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('80599320-70ad-54f6-ad78-06c75c79473e', 'AB03', 'read', 'AB03 Roles and Permissions (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('ce568d29-e076-58ac-8d49-299f61eb313c', 'AB04', 'post', 'AB04 HRIS Login (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('aa7498cc-5b00-594e-b7f2-f599187fc3f6', 'AB04', 'read', 'AB04 HRIS Login (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('ea2dd368-208b-5ed0-9289-d4f80493a12b', 'AB05', 'post', 'AB05 Sessions and Devices (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('6baa6eff-54e8-5826-89a0-3a9fd3f2cd76', 'AB05', 'read', 'AB05 Sessions and Devices (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('7a9bdbba-d2fb-5f2c-abd2-8021fc0d69cd', 'AB06', 'read', 'AB06 Login History (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('e550a162-1fbd-5569-bb37-f59958408c7d', 'AB', 'post', 'Identity, Organization, and Access (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('af6a9a38-58ee-5f48-a96b-be85a01806da', 'AB', 'read', 'Identity, Organization, and Access (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('1dc95624-cffc-579a-8871-33f054983c7f', 'AC', 'post', 'Asset Management (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('0eb44b70-c3f3-57f1-98a4-4b5d4b362385', 'AC', 'read', 'Asset Management (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('5b31352e-d0d9-5057-aa81-324ae8dc1640', 'AD06', 'post', 'AD06 Firewall and Rules (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('7004fc5f-8a3e-5a19-9fb6-292d982d1ad0', 'AD06', 'read', 'AD06 Firewall and Rules (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('539a9f46-28a0-58c5-b345-d1ae57c0f9d0', 'AD07', 'post', 'AD07 RouterOS Maintenance (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('6f4383dd-43ba-5780-841a-859c5614f005', 'AD07', 'read', 'AD07 RouterOS Maintenance (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('e6570a08-1fc2-5ac7-86dc-20eb38462b51', 'AD', 'post', 'Network and IPAM (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('e6f3aa69-5416-579d-b8a4-dce75d3cec08', 'AD', 'read', 'Network and IPAM (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('33adaaf1-bfee-5f93-85b0-f33b37b37111', 'AE06', 'post', 'AE06 Wazuh Integration (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('6b763709-e332-5be5-b777-9ecf23354902', 'AE06', 'read', 'AE06 Wazuh Integration (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('4ef14d87-ea5b-5da9-a145-bbbf46207960', 'AE', 'post', 'Infrastructure Monitoring (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('6a659a75-895e-5412-b57c-7f4547ecd7ce', 'AE', 'read', 'Infrastructure Monitoring (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('dfea560c-e647-588a-a986-f171b7bf5aba', 'AF04', 'post', 'AF04 Deploy and Rollback (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('a9647d6b-138c-5181-ad48-a9717ae61ac9', 'AF04', 'read', 'AF04 Deploy and Rollback (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('1457aa21-c7ab-5fd8-a219-7c43e5dc7b18', 'AF05', 'post', 'AF05 Maintenance (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('3836c008-7ef5-5b7f-a3b0-23ecf2d65c60', 'AF05', 'read', 'AF05 Maintenance (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('a94f0058-ed44-5086-aa42-42c49fc15c85', 'AF', 'post', 'Container Operations (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('5ab2035c-a353-5288-bb37-23a15d14d5c3', 'AF', 'read', 'Container Operations (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('21a14d19-7636-5fa7-aacf-c9d33fb81750', 'AG04', 'post', 'AG04 Nginx Configuration (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('5678ed54-3c2e-5bd3-81c1-ca654f759647', 'AG04', 'read', 'AG04 Nginx Configuration (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('0a1655de-e39a-54f6-8d9c-17b8bbb93895', 'AG', 'post', 'Edge, Domain, and Certificates (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('233ee422-5569-542c-ab6e-67eb0fe6fba6', 'AG', 'read', 'Edge, Domain, and Certificates (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('a3c05c81-4e30-5b66-8108-3d50fea4f227', 'AH04', 'post', 'AH04 Restore (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('5ddb171e-73d5-53e4-818a-2b0ba3aa5765', 'AH04', 'read', 'AH04 Restore (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('363854c9-5a90-5e20-b52d-77ccae3bb507', 'AH05', 'post', 'AH05 Verification (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('3f80b052-d683-56a5-a591-5db8afe88a91', 'AH05', 'read', 'AH05 Verification (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('55d83866-114e-5f46-9460-305da01aee37', 'AH', 'post', 'Backup and Configuration (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('5bfb7e24-c356-5444-accf-88f2cc921f75', 'AH', 'read', 'Backup and Configuration (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('b779aaa1-cce4-5e68-8373-6bd8785c91fe', 'AI02', 'post', 'AI02 Access Requests (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('45918701-3416-5962-b401-496372a220bc', 'AI02', 'read', 'AI02 Access Requests (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('5721b845-0dd5-52fe-8401-ab43b18dc661', 'AI05', 'post', 'AI05 Access Policies (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('19aeade5-d4c1-5d8f-819a-e60c8fa2a828', 'AI05', 'read', 'AI05 Access Policies (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('912c2693-6839-54db-895e-8c01bd8ed6df', 'AI', 'post', 'Secure Access (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('831ccc56-5746-5ca3-bed0-7edfae524e0c', 'AI', 'read', 'Secure Access (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('5c2a4632-1d30-5332-8957-d469fdd0ba2a', 'AJ', 'post', 'Service Desk and Contracts (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('de1dcf00-e6dc-5b5d-b6b7-4a841872356e', 'AJ', 'read', 'Service Desk and Contracts (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('f8274eb4-f4dc-5b32-b8c6-2f0f1f929e9b', 'AK', 'post', 'Content and Notifications (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('e20593e4-09cf-574a-bcee-75977a82242b', 'AK', 'read', 'Content and Notifications (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('1ff21c89-3906-516e-8c6a-3bb1af57807f', 'AL04', 'post', 'AL04 Access Reviews (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('b745fd6e-5d89-5740-8abf-fe30023dd405', 'AL04', 'read', 'AL04 Access Reviews (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('f0028f44-2a87-5ce9-b4cb-3a40dd59a230', 'AL05', 'post', 'AL05 Export and Retention (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('ae9bfdfc-2593-52b1-855b-41588194e745', 'AL05', 'read', 'AL05 Export and Retention (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('c6ac1835-0823-5178-be46-882654c07665', 'AL', 'post', 'Audit and Security (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('2e487f73-26d1-5322-8629-11b03ecd0345', 'AL', 'read', 'Audit and Security (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('71e83943-f98f-5038-bc0a-e43eea275ac5', 'AM02', 'post', 'AM02 Credentials and Vault (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('1c1395cd-93bd-5d0b-abfd-e621b7f7bb31', 'AM02', 'read', 'AM02 Credentials and Vault (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('a90e3ed1-e9c5-5a3b-913b-719369d329e8', 'AM03', 'post', 'AM03 Webhooks and API Keys (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('45f9ed3b-b2af-50c5-b3df-62c2fb35590f', 'AM03', 'read', 'AM03 Webhooks and API Keys (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('fdc0351f-9105-5b33-9f1f-7adee025da9c', 'AM08', 'post', 'AM08 Impersonation and Support (post)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('8191d3aa-7102-56bb-a178-6e7f1f9bbaf2', 'AM08', 'read', 'AM08 Impersonation and Support (read)', true)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('fbe81dfa-44ed-537f-92a7-27fec0b5a783', 'AM', 'post', 'Platform Settings (post)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;
INSERT INTO core.permissions (id, module_code, action, name, is_sensitive) VALUES
  ('f5caffa0-f85c-5aab-8e0d-0d9fb9f29155', 'AM', 'read', 'Platform Settings (read)', false)
ON CONFLICT (module_code, action) DO UPDATE SET name=EXCLUDED.name, is_sensitive=EXCLUDED.is_sensitive;

-- Role permissions (module grants plus sensitive submodule grants)
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '2c7c9bdf-4700-5b0f-a501-1a72177fabc9') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'ef57de94-85f6-5f67-8d2e-fe307a2d418a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '3069584e-1cb1-57ef-9866-9b06f6052288') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '80599320-70ad-54f6-ad78-06c75c79473e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'ce568d29-e076-58ac-8d49-299f61eb313c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'aa7498cc-5b00-594e-b7f2-f599187fc3f6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'ea2dd368-208b-5ed0-9289-d4f80493a12b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '6baa6eff-54e8-5826-89a0-3a9fd3f2cd76') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '7a9bdbba-d2fb-5f2c-abd2-8021fc0d69cd') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'e550a162-1fbd-5569-bb37-f59958408c7d') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '1dc95624-cffc-579a-8871-33f054983c7f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '5b31352e-d0d9-5057-aa81-324ae8dc1640') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '7004fc5f-8a3e-5a19-9fb6-292d982d1ad0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '539a9f46-28a0-58c5-b345-d1ae57c0f9d0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '6f4383dd-43ba-5780-841a-859c5614f005') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'e6570a08-1fc2-5ac7-86dc-20eb38462b51') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '33adaaf1-bfee-5f93-85b0-f33b37b37111') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '6b763709-e332-5be5-b777-9ecf23354902') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '4ef14d87-ea5b-5da9-a145-bbbf46207960') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'dfea560c-e647-588a-a986-f171b7bf5aba') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'a9647d6b-138c-5181-ad48-a9717ae61ac9') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '1457aa21-c7ab-5fd8-a219-7c43e5dc7b18') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '3836c008-7ef5-5b7f-a3b0-23ecf2d65c60') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'a94f0058-ed44-5086-aa42-42c49fc15c85') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '21a14d19-7636-5fa7-aacf-c9d33fb81750') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '5678ed54-3c2e-5bd3-81c1-ca654f759647') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '0a1655de-e39a-54f6-8d9c-17b8bbb93895') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '233ee422-5569-542c-ab6e-67eb0fe6fba6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'a3c05c81-4e30-5b66-8108-3d50fea4f227') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '5ddb171e-73d5-53e4-818a-2b0ba3aa5765') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '363854c9-5a90-5e20-b52d-77ccae3bb507') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '3f80b052-d683-56a5-a591-5db8afe88a91') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '55d83866-114e-5f46-9460-305da01aee37') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '5bfb7e24-c356-5444-accf-88f2cc921f75') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'b779aaa1-cce4-5e68-8373-6bd8785c91fe') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '45918701-3416-5962-b401-496372a220bc') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '5721b845-0dd5-52fe-8401-ab43b18dc661') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '19aeade5-d4c1-5d8f-819a-e60c8fa2a828') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '912c2693-6839-54db-895e-8c01bd8ed6df') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '831ccc56-5746-5ca3-bed0-7edfae524e0c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '5c2a4632-1d30-5332-8957-d469fdd0ba2a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'f8274eb4-f4dc-5b32-b8c6-2f0f1f929e9b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '1ff21c89-3906-516e-8c6a-3bb1af57807f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'b745fd6e-5d89-5740-8abf-fe30023dd405') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'f0028f44-2a87-5ce9-b4cb-3a40dd59a230') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'ae9bfdfc-2593-52b1-855b-41588194e745') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '2e487f73-26d1-5322-8629-11b03ecd0345') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '71e83943-f98f-5038-bc0a-e43eea275ac5') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '1c1395cd-93bd-5d0b-abfd-e621b7f7bb31') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'a90e3ed1-e9c5-5a3b-913b-719369d329e8') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', '45f9ed3b-b2af-50c5-b3df-62c2fb35590f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'fbe81dfa-44ed-537f-92a7-27fec0b5a783') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee214005-1900-51ce-9511-3782e7e7ae5a', 'f5caffa0-f85c-5aab-8e0d-0d9fb9f29155') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '1dc95624-cffc-579a-8871-33f054983c7f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '5b31352e-d0d9-5057-aa81-324ae8dc1640') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '7004fc5f-8a3e-5a19-9fb6-292d982d1ad0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '539a9f46-28a0-58c5-b345-d1ae57c0f9d0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '6f4383dd-43ba-5780-841a-859c5614f005') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', 'e6570a08-1fc2-5ac7-86dc-20eb38462b51') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '4ef14d87-ea5b-5da9-a145-bbbf46207960') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', 'dfea560c-e647-588a-a986-f171b7bf5aba') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', 'a9647d6b-138c-5181-ad48-a9717ae61ac9') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '1457aa21-c7ab-5fd8-a219-7c43e5dc7b18') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '3836c008-7ef5-5b7f-a3b0-23ecf2d65c60') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', 'a94f0058-ed44-5086-aa42-42c49fc15c85') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '21a14d19-7636-5fa7-aacf-c9d33fb81750') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '5678ed54-3c2e-5bd3-81c1-ca654f759647') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '0a1655de-e39a-54f6-8d9c-17b8bbb93895') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '233ee422-5569-542c-ab6e-67eb0fe6fba6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '5bfb7e24-c356-5444-accf-88f2cc921f75') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', 'b779aaa1-cce4-5e68-8373-6bd8785c91fe') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '45918701-3416-5962-b401-496372a220bc') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '912c2693-6839-54db-895e-8c01bd8ed6df') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '831ccc56-5746-5ca3-bed0-7edfae524e0c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '5c2a4632-1d30-5332-8957-d469fdd0ba2a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('092f65ae-51cc-5a56-85aa-5383dd763ffa', '2e487f73-26d1-5322-8629-11b03ecd0345') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '5b31352e-d0d9-5057-aa81-324ae8dc1640') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '7004fc5f-8a3e-5a19-9fb6-292d982d1ad0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '539a9f46-28a0-58c5-b345-d1ae57c0f9d0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '6f4383dd-43ba-5780-841a-859c5614f005') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', 'e6570a08-1fc2-5ac7-86dc-20eb38462b51') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '33adaaf1-bfee-5f93-85b0-f33b37b37111') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '6b763709-e332-5be5-b777-9ecf23354902') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '4ef14d87-ea5b-5da9-a145-bbbf46207960') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', 'dfea560c-e647-588a-a986-f171b7bf5aba') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', 'a9647d6b-138c-5181-ad48-a9717ae61ac9') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '1457aa21-c7ab-5fd8-a219-7c43e5dc7b18') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '3836c008-7ef5-5b7f-a3b0-23ecf2d65c60') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', 'a94f0058-ed44-5086-aa42-42c49fc15c85') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '233ee422-5569-542c-ab6e-67eb0fe6fba6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '5bfb7e24-c356-5444-accf-88f2cc921f75') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '831ccc56-5746-5ca3-bed0-7edfae524e0c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '5c2a4632-1d30-5332-8957-d469fdd0ba2a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f3431b73-744f-5176-9ad4-68b652adb24c', '2e487f73-26d1-5322-8629-11b03ecd0345') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', '1dc95624-cffc-579a-8871-33f054983c7f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', '5c2a4632-1d30-5332-8957-d469fdd0ba2a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('c2f0d6cf-e1cf-5cfd-ace3-7fa437b90b5c', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('9900bc6e-ce86-5a07-be91-67bcd8275de8', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('9900bc6e-ce86-5a07-be91-67bcd8275de8', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('9900bc6e-ce86-5a07-be91-67bcd8275de8', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('9900bc6e-ce86-5a07-be91-67bcd8275de8', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('9900bc6e-ce86-5a07-be91-67bcd8275de8', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('9900bc6e-ce86-5a07-be91-67bcd8275de8', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('9900bc6e-ce86-5a07-be91-67bcd8275de8', '233ee422-5569-542c-ab6e-67eb0fe6fba6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('9900bc6e-ce86-5a07-be91-67bcd8275de8', '5bfb7e24-c356-5444-accf-88f2cc921f75') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('9900bc6e-ce86-5a07-be91-67bcd8275de8', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('9900bc6e-ce86-5a07-be91-67bcd8275de8', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', '7a9bdbba-d2fb-5f2c-abd2-8021fc0d69cd') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', '233ee422-5569-542c-ab6e-67eb0fe6fba6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', '5bfb7e24-c356-5444-accf-88f2cc921f75') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', '831ccc56-5746-5ca3-bed0-7edfae524e0c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', '1ff21c89-3906-516e-8c6a-3bb1af57807f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', 'b745fd6e-5d89-5740-8abf-fe30023dd405') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', 'f0028f44-2a87-5ce9-b4cb-3a40dd59a230') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', 'ae9bfdfc-2593-52b1-855b-41588194e745') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', '2e487f73-26d1-5322-8629-11b03ecd0345') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('3e64f8b5-0b13-5b6d-8815-f591256096df', 'f5caffa0-f85c-5aab-8e0d-0d9fb9f29155') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('cd39eb14-a2dd-50e6-af7d-2930c7b44b14', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('cd39eb14-a2dd-50e6-af7d-2930c7b44b14', '912c2693-6839-54db-895e-8c01bd8ed6df') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('cd39eb14-a2dd-50e6-af7d-2930c7b44b14', '831ccc56-5746-5ca3-bed0-7edfae524e0c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('cd39eb14-a2dd-50e6-af7d-2930c7b44b14', '5c2a4632-1d30-5332-8957-d469fdd0ba2a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('cd39eb14-a2dd-50e6-af7d-2930c7b44b14', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('cd39eb14-a2dd-50e6-af7d-2930c7b44b14', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '2c7c9bdf-4700-5b0f-a501-1a72177fabc9') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'ef57de94-85f6-5f67-8d2e-fe307a2d418a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '3069584e-1cb1-57ef-9866-9b06f6052288') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '80599320-70ad-54f6-ad78-06c75c79473e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'ce568d29-e076-58ac-8d49-299f61eb313c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'aa7498cc-5b00-594e-b7f2-f599187fc3f6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'ea2dd368-208b-5ed0-9289-d4f80493a12b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '6baa6eff-54e8-5826-89a0-3a9fd3f2cd76') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '7a9bdbba-d2fb-5f2c-abd2-8021fc0d69cd') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'e550a162-1fbd-5569-bb37-f59958408c7d') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '1dc95624-cffc-579a-8871-33f054983c7f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '5b31352e-d0d9-5057-aa81-324ae8dc1640') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '7004fc5f-8a3e-5a19-9fb6-292d982d1ad0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '539a9f46-28a0-58c5-b345-d1ae57c0f9d0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '6f4383dd-43ba-5780-841a-859c5614f005') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'e6570a08-1fc2-5ac7-86dc-20eb38462b51') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '33adaaf1-bfee-5f93-85b0-f33b37b37111') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '6b763709-e332-5be5-b777-9ecf23354902') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '4ef14d87-ea5b-5da9-a145-bbbf46207960') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'dfea560c-e647-588a-a986-f171b7bf5aba') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'a9647d6b-138c-5181-ad48-a9717ae61ac9') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '1457aa21-c7ab-5fd8-a219-7c43e5dc7b18') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '3836c008-7ef5-5b7f-a3b0-23ecf2d65c60') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'a94f0058-ed44-5086-aa42-42c49fc15c85') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '21a14d19-7636-5fa7-aacf-c9d33fb81750') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '5678ed54-3c2e-5bd3-81c1-ca654f759647') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '0a1655de-e39a-54f6-8d9c-17b8bbb93895') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '233ee422-5569-542c-ab6e-67eb0fe6fba6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'a3c05c81-4e30-5b66-8108-3d50fea4f227') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '5ddb171e-73d5-53e4-818a-2b0ba3aa5765') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '363854c9-5a90-5e20-b52d-77ccae3bb507') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '3f80b052-d683-56a5-a591-5db8afe88a91') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '55d83866-114e-5f46-9460-305da01aee37') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '5bfb7e24-c356-5444-accf-88f2cc921f75') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'b779aaa1-cce4-5e68-8373-6bd8785c91fe') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '45918701-3416-5962-b401-496372a220bc') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '5721b845-0dd5-52fe-8401-ab43b18dc661') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '19aeade5-d4c1-5d8f-819a-e60c8fa2a828') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '912c2693-6839-54db-895e-8c01bd8ed6df') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '831ccc56-5746-5ca3-bed0-7edfae524e0c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '5c2a4632-1d30-5332-8957-d469fdd0ba2a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'f8274eb4-f4dc-5b32-b8c6-2f0f1f929e9b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '1ff21c89-3906-516e-8c6a-3bb1af57807f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'b745fd6e-5d89-5740-8abf-fe30023dd405') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'f0028f44-2a87-5ce9-b4cb-3a40dd59a230') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'ae9bfdfc-2593-52b1-855b-41588194e745') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '2e487f73-26d1-5322-8629-11b03ecd0345') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '71e83943-f98f-5038-bc0a-e43eea275ac5') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '1c1395cd-93bd-5d0b-abfd-e621b7f7bb31') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'a90e3ed1-e9c5-5a3b-913b-719369d329e8') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', '45f9ed3b-b2af-50c5-b3df-62c2fb35590f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'fbe81dfa-44ed-537f-92a7-27fec0b5a783') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7e104b6-0bbb-5986-a3a3-6904acab2710', 'f5caffa0-f85c-5aab-8e0d-0d9fb9f29155') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '1dc95624-cffc-579a-8871-33f054983c7f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '5b31352e-d0d9-5057-aa81-324ae8dc1640') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '7004fc5f-8a3e-5a19-9fb6-292d982d1ad0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '539a9f46-28a0-58c5-b345-d1ae57c0f9d0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '6f4383dd-43ba-5780-841a-859c5614f005') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', 'e6570a08-1fc2-5ac7-86dc-20eb38462b51') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '4ef14d87-ea5b-5da9-a145-bbbf46207960') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', 'dfea560c-e647-588a-a986-f171b7bf5aba') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', 'a9647d6b-138c-5181-ad48-a9717ae61ac9') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '1457aa21-c7ab-5fd8-a219-7c43e5dc7b18') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '3836c008-7ef5-5b7f-a3b0-23ecf2d65c60') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', 'a94f0058-ed44-5086-aa42-42c49fc15c85') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '21a14d19-7636-5fa7-aacf-c9d33fb81750') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '5678ed54-3c2e-5bd3-81c1-ca654f759647') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '0a1655de-e39a-54f6-8d9c-17b8bbb93895') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '233ee422-5569-542c-ab6e-67eb0fe6fba6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '5bfb7e24-c356-5444-accf-88f2cc921f75') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', 'b779aaa1-cce4-5e68-8373-6bd8785c91fe') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '45918701-3416-5962-b401-496372a220bc') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '912c2693-6839-54db-895e-8c01bd8ed6df') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '831ccc56-5746-5ca3-bed0-7edfae524e0c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '5c2a4632-1d30-5332-8957-d469fdd0ba2a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('f7b1b210-1b41-5333-9307-bb4a73a64cae', '2e487f73-26d1-5322-8629-11b03ecd0345') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '5b31352e-d0d9-5057-aa81-324ae8dc1640') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '7004fc5f-8a3e-5a19-9fb6-292d982d1ad0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '539a9f46-28a0-58c5-b345-d1ae57c0f9d0') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '6f4383dd-43ba-5780-841a-859c5614f005') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', 'e6570a08-1fc2-5ac7-86dc-20eb38462b51') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '33adaaf1-bfee-5f93-85b0-f33b37b37111') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '6b763709-e332-5be5-b777-9ecf23354902') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '4ef14d87-ea5b-5da9-a145-bbbf46207960') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', 'dfea560c-e647-588a-a986-f171b7bf5aba') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', 'a9647d6b-138c-5181-ad48-a9717ae61ac9') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '1457aa21-c7ab-5fd8-a219-7c43e5dc7b18') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '3836c008-7ef5-5b7f-a3b0-23ecf2d65c60') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', 'a94f0058-ed44-5086-aa42-42c49fc15c85') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '233ee422-5569-542c-ab6e-67eb0fe6fba6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '5bfb7e24-c356-5444-accf-88f2cc921f75') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '831ccc56-5746-5ca3-bed0-7edfae524e0c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '5c2a4632-1d30-5332-8957-d469fdd0ba2a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('d45420f6-d3c0-568f-acd3-ad728a8c38b7', '2e487f73-26d1-5322-8629-11b03ecd0345') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('79febc83-da75-50c0-8255-693247b90690', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('79febc83-da75-50c0-8255-693247b90690', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('79febc83-da75-50c0-8255-693247b90690', '1dc95624-cffc-579a-8871-33f054983c7f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('79febc83-da75-50c0-8255-693247b90690', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('79febc83-da75-50c0-8255-693247b90690', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('79febc83-da75-50c0-8255-693247b90690', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('79febc83-da75-50c0-8255-693247b90690', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('79febc83-da75-50c0-8255-693247b90690', '5c2a4632-1d30-5332-8957-d469fdd0ba2a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('79febc83-da75-50c0-8255-693247b90690', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('79febc83-da75-50c0-8255-693247b90690', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('43d99e82-54f7-5b5b-931f-de1ae3b22215', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('43d99e82-54f7-5b5b-931f-de1ae3b22215', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('43d99e82-54f7-5b5b-931f-de1ae3b22215', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('43d99e82-54f7-5b5b-931f-de1ae3b22215', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('43d99e82-54f7-5b5b-931f-de1ae3b22215', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('43d99e82-54f7-5b5b-931f-de1ae3b22215', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('43d99e82-54f7-5b5b-931f-de1ae3b22215', '233ee422-5569-542c-ab6e-67eb0fe6fba6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('43d99e82-54f7-5b5b-931f-de1ae3b22215', '5bfb7e24-c356-5444-accf-88f2cc921f75') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('43d99e82-54f7-5b5b-931f-de1ae3b22215', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('43d99e82-54f7-5b5b-931f-de1ae3b22215', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', '7a9bdbba-d2fb-5f2c-abd2-8021fc0d69cd') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', 'af6a9a38-58ee-5f48-a96b-be85a01806da') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', '0eb44b70-c3f3-57f1-98a4-4b5d4b362385') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', 'e6f3aa69-5416-579d-b8a4-dce75d3cec08') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', '6a659a75-895e-5412-b57c-7f4547ecd7ce') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', '5ab2035c-a353-5288-bb37-23a15d14d5c3') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', '233ee422-5569-542c-ab6e-67eb0fe6fba6') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', '5bfb7e24-c356-5444-accf-88f2cc921f75') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', '831ccc56-5746-5ca3-bed0-7edfae524e0c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', '1ff21c89-3906-516e-8c6a-3bb1af57807f') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', 'b745fd6e-5d89-5740-8abf-fe30023dd405') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', 'f0028f44-2a87-5ce9-b4cb-3a40dd59a230') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', 'ae9bfdfc-2593-52b1-855b-41588194e745') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', '2e487f73-26d1-5322-8629-11b03ecd0345') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('ee151e7a-ac72-545c-842a-e136ddb131ea', 'f5caffa0-f85c-5aab-8e0d-0d9fb9f29155') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('33d1cca7-23a9-5fed-90c9-6248284b4e76', 'fe31d858-cdc8-5c30-b0e9-6b1def8de2de') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('33d1cca7-23a9-5fed-90c9-6248284b4e76', '912c2693-6839-54db-895e-8c01bd8ed6df') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('33d1cca7-23a9-5fed-90c9-6248284b4e76', '831ccc56-5746-5ca3-bed0-7edfae524e0c') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('33d1cca7-23a9-5fed-90c9-6248284b4e76', '5c2a4632-1d30-5332-8957-d469fdd0ba2a') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('33d1cca7-23a9-5fed-90c9-6248284b4e76', 'de1dcf00-e6dc-5b5d-b6b7-4a841872356e') ON CONFLICT DO NOTHING;
INSERT INTO core.role_permissions (role_id, permission_id) VALUES ('33d1cca7-23a9-5fed-90c9-6248284b4e76', 'e20593e4-09cf-574a-bcee-75977a82242b') ON CONFLICT DO NOTHING;

-- Company admin membership role (company scope)
INSERT INTO core.membership_roles (id, membership_id, role_id, scope_type, scope_id, granted_by, created_at) VALUES
  ('50000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1', 'ee214005-1900-51ce-9511-3782e7e7ae5a', 'company', NULL, NULL, now())
ON CONFLICT DO NOTHING;
INSERT INTO core.membership_roles (id, membership_id, role_id, scope_type, scope_id, granted_by, created_at) VALUES
  ('50000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000b1', 'f7e104b6-0bbb-5986-a3a3-6904acab2710', 'company', NULL, NULL, now())
ON CONFLICT DO NOTHING;

-- Platform role definitions and default locale. The approved schema has no
-- platform role *definition* table; core.user_platform_roles stores grants.
-- WP-02 stores these three definitions as global platform.settings entries as a
-- temporary workaround (ADR-017). permissions.json remains the source of truth.
INSERT INTO platform.settings (id, company_id, key, value, is_secret, updated_at) VALUES
  ('f992807a-64dd-5b90-8a8e-806d8ba58b1a', NULL, 'platform.role.platform_owner', '{"name_en":"Platform Owner","name_id":"Pemilik Platform","scope":"global","permissions":["AM:read","AM:post","AB:post","AM08:read","AM08:post"],"limits":"AB:post applies only to company lifecycle and the first admin; business data requires impersonation."}'::jsonb, false, now())
ON CONFLICT (id) DO UPDATE SET company_id=NULL, key=EXCLUDED.key, value=EXCLUDED.value, is_secret=EXCLUDED.is_secret, updated_at=now();
INSERT INTO platform.settings (id, company_id, key, value, is_secret, updated_at) VALUES
  ('69358440-7e57-5de5-9ceb-7fe916ae44e2', NULL, 'platform.role.platform_support', '{"name_en":"Platform Support","name_id":"Dukungan Platform","scope":"global","permissions":["AA:read","AL:read","AM:read"],"limits":"Cannot change company business data."}'::jsonb, false, now())
ON CONFLICT (id) DO UPDATE SET company_id=NULL, key=EXCLUDED.key, value=EXCLUDED.value, is_secret=EXCLUDED.is_secret, updated_at=now();
INSERT INTO platform.settings (id, company_id, key, value, is_secret, updated_at) VALUES
  ('145c61e1-e9c4-5cbb-8c09-452354b150b8', NULL, 'platform.role.platform_security', '{"name_en":"Platform Security","name_id":"Keamanan Platform","scope":"global","permissions":["AL:read","AL04:post","AL05:post","AM:read"],"limits":"Cannot change company business configuration or start impersonation."}'::jsonb, false, now())
ON CONFLICT (id) DO UPDATE SET company_id=NULL, key=EXCLUDED.key, value=EXCLUDED.value, is_secret=EXCLUDED.is_secret, updated_at=now();
INSERT INTO platform.settings (id, company_id, key, value, is_secret, updated_at) VALUES
  ('c02f349b-14dc-5440-a2b7-b28ace0964d6', NULL, 'locale.default', '"en"'::jsonb, false, now())
ON CONFLICT (id) DO UPDATE SET company_id=NULL, key=EXCLUDED.key, value=EXCLUDED.value, is_secret=EXCLUDED.is_secret, updated_at=now();

COMMIT;
