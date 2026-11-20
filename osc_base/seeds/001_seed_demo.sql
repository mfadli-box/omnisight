-- Fixture untuk basis data pengembangan/demo. Provisioning produksi terpisah.
BEGIN;

INSERT INTO public.osc_company (id, code, name)
VALUES ('10000000-0000-4000-8000-000000000010', 'IDM', 'OmniSight IDM Demo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.osc_user (id, company_id, username, full_name, password_hash)
VALUES ('50000000-0000-4000-8000-000000000010',
        '10000000-0000-4000-8000-000000000010',
        'admin', 'Super Administrator', '$argon2id$v=19$m=19456,t=2,p=1$W2UiPvnf/JPimc4khwzS5Q$0YiyPvRqNOSABtnukJMGJTMf9EQPEDPCCcvEOz2mUnc')
ON CONFLICT (id) DO NOTHING;

-- Jangan memberikan akses demo kepada identitas yang kebetulan sudah ada.
DO $demo$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.osc_user AS u
        JOIN public.osc_company AS c ON c.id = u.company_id
        WHERE c.id = '10000000-0000-4000-8000-000000000010' AND c.code = 'IDM'
          AND u.id = '50000000-0000-4000-8000-000000000010' AND u.username = 'admin'
    ) THEN
        RAISE EXCEPTION 'ID seed IDM/admin sudah digunakan oleh data lain';
    END IF;
END;
$demo$;

INSERT INTO public.osc_area (company_id, code, name)
VALUES
    ('10000000-0000-4000-8000-000000000010', 'JKT', 'Jakarta'),
    ('10000000-0000-4000-8000-000000000010', 'SBY', 'Surabaya')
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO public.osc_store (company_id, area_id, code, name, network_ip_cidr)
SELECT a.company_id, a.id, s.code, s.name, s.network_ip_cidr
FROM (VALUES
    ('JKT', 'JKT-001', 'Jakarta Demo Store', '192.0.2.0/25'::cidr),
    ('SBY', 'SBY-001', 'Surabaya Demo Store', '198.51.100.0/25'::cidr)
) AS s(area_code, code, name, network_ip_cidr)
JOIN public.osc_area AS a ON a.code = s.area_code
WHERE a.company_id = '10000000-0000-4000-8000-000000000010'
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO public.osc_menu AS m
    (code, group_code, module_number, group_name, title, route_path, icon, sort_order)
VALUES
    ('CT01', 'CT', 1, 'Control Tower', 'Executive Control Tower', '/CT01', 'LayoutDashboard', 10),
    ('OP01', 'OP', 1, 'Operations', 'PAM Bastion', '/OP01', 'ShieldCheck', 20),
    ('OP02', 'OP', 2, 'Operations', 'Agent & Scheduler', '/OP02', 'Server', 21),
    ('KB01', 'KB', 1, 'Knowledge Base', 'SOP & Technical Docs', '/KB01', 'BookOpen', 30),
    ('RP01', 'RP', 1, 'Reports', 'Database Excel Export', '/RP01', 'FileSpreadsheet', 40),
    ('RP02', 'RP', 2, 'Reports', 'PDF Report Generator', '/RP02', 'FileText', 41),
    ('SA01', 'SA', 1, 'System Administration', 'Company & Area', '/SA01', 'Building2', 50),
    ('SA02', 'SA', 2, 'System Administration', 'User & Access', '/SA02', 'Users', 51),
    ('SA03', 'SA', 3, 'System Administration', 'Menu Privilege', '/SA03', 'ListChecks', 52),
    ('SA04', 'SA', 4, 'System Administration', 'External Connectors', '/SA04', 'Network', 53)
ON CONFLICT (code) DO UPDATE
SET route_path = COALESCE(m.route_path, EXCLUDED.route_path),
    icon = COALESCE(m.icon, EXCLUDED.icon)
WHERE m.route_path IS NULL OR m.icon IS NULL;

INSERT INTO public.osc_role (company_id, role_code, role_name, is_system)
VALUES ('10000000-0000-4000-8000-000000000010', 'SUPER_ADMIN', 'Super Administrator', true)
ON CONFLICT (company_id, role_code) DO NOTHING;

INSERT INTO public.osc_user_access (user_id, company_id, role_id, area_id, is_default)
SELECT '50000000-0000-4000-8000-000000000010', r.company_id, r.id, NULL, true
FROM public.osc_role AS r
WHERE r.company_id = '10000000-0000-4000-8000-000000000010' AND r.role_code = 'SUPER_ADMIN'
ON CONFLICT (user_id, company_id, area_id) DO NOTHING;

INSERT INTO public.osc_company_menu_entitlement
    (company_id, module_code, can_view, can_create, can_update, can_delete)
SELECT '10000000-0000-4000-8000-000000000010', m.code, true,
       m.code <> 'CT01',
       m.code NOT IN ('CT01', 'RP01', 'RP02'),
       m.code IN ('KB01', 'SA01', 'SA02', 'SA03', 'SA04')
FROM public.osc_menu AS m
WHERE m.code IN ('CT01', 'OP01', 'OP02', 'KB01', 'RP01', 'RP02', 'SA01', 'SA02', 'SA03', 'SA04')
ON CONFLICT (company_id, module_code) DO NOTHING;

INSERT INTO public.osc_company_menu (company_id, role_id, menu_code, can_view, can_create, can_update, can_delete)
SELECT r.company_id, r.id, e.module_code, e.can_view, e.can_create, e.can_update, e.can_delete
FROM public.osc_role AS r
JOIN public.osc_company_menu_entitlement AS e ON e.company_id = r.company_id
WHERE r.company_id = '10000000-0000-4000-8000-000000000010' AND r.role_code = 'SUPER_ADMIN'
  AND e.module_code IN ('CT01', 'OP01', 'OP02', 'KB01', 'RP01', 'RP02', 'SA01', 'SA02', 'SA03', 'SA04')
ON CONFLICT (company_id, role_id, menu_code) DO NOTHING;

COMMIT;
