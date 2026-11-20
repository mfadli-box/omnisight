-- 001_initial_seed.sql
-- Hanya data referensi pengembangan/demo. Jangan gunakan company/store contoh ini sebagai
-- identitas produksi. Baris Super Admin adalah placeholder bootstrap nonaktif;
-- provision hash Argon2id melalui perintah bootstrap tepercaya satu kali.

BEGIN;

INSERT INTO public.osc_company (id, code, name, auth_provider, hris_cache_ttl_hours, is_active)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'DEMO-A', 'OmniSight Demo Company A', 'LOCAL', 72, true),
    ('10000000-0000-4000-8000-000000000002', 'DEMO-B', 'OmniSight Demo Company B', 'LOCAL', 72, true);

INSERT INTO public.osc_area (id, company_id, area_code, area_name, is_active)
VALUES
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'REG-A1', 'Company A Regional 1', true),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'REG-A2', 'Company A Regional 2', true),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'REG-B1', 'Company B Regional 1', true),
    ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'REG-B2', 'Company B Regional 2', true);

INSERT INTO public.osc_store
    (id, company_id, area_id, store_code, store_name, network_ip_cidr, status, is_active)
VALUES
    ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'A-001', 'Company A Store 001', '192.0.2.1/32', 'ACTIVE', true),
    ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'A-002', 'Company A Store 002', '192.0.2.2/32', 'ACTIVE', true),
    ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 'B-001', 'Company B Store 001', '198.51.100.1/32', 'ACTIVE', true),
    ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', 'B-002', 'Company B Store 002', '198.51.100.2/32', 'ACTIVE', true);

INSERT INTO public.osc_menu
    (module_code, group_code, module_number, group_name, module_name, display_order)
VALUES
    ('CT01', 'CT', 1, 'Control Tower', 'Executive Control Tower', 10),
    ('OP01', 'OP', 1, 'Operations', 'PAM Bastion', 20),
    ('OP02', 'OP', 2, 'Operations', 'Agent & Scheduler', 21),
    ('KB01', 'KB', 1, 'Knowledge Base', 'SOP & Technical Docs', 30),
    ('RP01', 'RP', 1, 'Reports', 'Database Excel Export', 40),
    ('RP02', 'RP', 2, 'Reports', 'PDF Report Generator', 41),
    ('SA01', 'SA', 1, 'System Administration', 'Company & Area', 50),
    ('SA02', 'SA', 2, 'System Administration', 'User & Access', 51),
    ('SA03', 'SA', 3, 'System Administration', 'Menu Privilege', 52),
    ('SA04', 'SA', 4, 'System Administration', 'External Connectors', 53);

INSERT INTO public.osc_role (id, company_id, role_code, role_name, is_system, is_active)
VALUES
    ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'SUPER_ADMIN', 'Super Administrator', true, true),
    ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'SUPER_ADMIN', 'Super Administrator', true, true);

INSERT INTO public.osc_company_menu
    (company_id, module_code, is_enabled, can_view, can_create, can_update, can_delete)
SELECT c.id, m.module_code, true, true, true, true, true
FROM public.osc_company AS c
CROSS JOIN public.osc_menu AS m
WHERE c.code IN ('DEMO-A', 'DEMO-B');

INSERT INTO public.osc_role_menu
    (company_id, role_id, module_code, can_view, can_create, can_update, can_delete)
SELECT r.company_id, r.id, m.module_code, true, true, true, true
FROM public.osc_role AS r
CROSS JOIN public.osc_menu AS m
WHERE r.role_code = 'SUPER_ADMIN';

INSERT INTO public.osc_user
    (id, username, email, full_name, password_hash, auth_source, is_active)
VALUES
    ('50000000-0000-4000-8000-000000000001', 'superadmin', NULL,
     'Super Administrator (Bootstrap Required)', NULL, 'LOCAL', false);

INSERT INTO public.osc_user_access
    (user_id, company_id, area_id, role_id, is_default, is_active)
VALUES
    ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', NULL,
     '40000000-0000-4000-8000-000000000001', true, true),
    ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', NULL,
     '40000000-0000-4000-8000-000000000002', false, true);

COMMIT;
