-- OmniSight Master Seed Data Script
-- Database: PostgreSQL 18+ (osc_base)
-- File: 04_seed.sql

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET timezone = 'UTC';

-- Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. SEED MASTER COMPANIES (dat_company)
INSERT INTO dat_company (company_id, company_code, company_name, has_hris_link, hris_login_url, is_mfa_active, is_active) VALUES
('00000000-0000-0000-0000-000000000001', 'CP-HOLDING', 'PT OmniSight Holding Corp', FALSE, NULL, FALSE, TRUE),
('00000000-0000-0000-0000-000000000002', 'CP-RETAIL',  'PT Retail Omni Indonesia', TRUE, 'http://hris.web/Login.asmx/CheckLogin?uLogin={U}&uPaswd={P}', TRUE, TRUE),
('00000000-0000-0000-0000-000000000003', 'CP-LOGIST',  'PT Logistik Express Nusantara', TRUE, 'http://hris-logistics.internal/api/check?uLogin={U}&uPaswd={P}', FALSE, TRUE)
ON CONFLICT (company_id) DO UPDATE SET company_name = EXCLUDED.company_name;

-- 2. SEED MASTER AREAS (dat_area)
INSERT INTO dat_area (area_id, company_id, area_code, area_name, is_active) VALUES
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'AR-HQ',    'Head Office Jakarta', TRUE),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'AR-JKT',   'Area Jabodetabek Retail', TRUE),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'AR-BDG',   'Area Jawa Barat Retail', TRUE),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'AR-HUB1',  'Hub Utama Marunda Logistik', TRUE)
ON CONFLICT (area_id) DO UPDATE SET area_name = EXCLUDED.area_name;

-- 3. SEED MASTER STORES (dat_store)
INSERT INTO dat_store (store_id, company_id, area_id, store_code, store_name, address, is_active) VALUES
('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'ST-HQ-TWR',  'OmniSight Tower HQ', 'Jl. Jend. Sudirman Kav. 52, Jakarta Selatan', TRUE),
('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'ST-JKT-GI',  'Flagship Store Grand Indonesia', 'Grand Indonesia Mall West Mall Lt. 2, Jakarta', TRUE),
('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'ST-BDG-PVJ', 'Store Paris Van Java Bandung', 'Jl. Sukajadi No. 137, Bandung', TRUE),
('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'ST-HUB-MRD', 'Warehouse Hub Marunda', 'Kawasan Berikat Marunda, Jakarta Utara', TRUE),
('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'BAL0109',    'CK MELASTI', 'Jl. Melasti, Legian, Kuta, Bali', TRUE)
ON CONFLICT (store_id) DO UPDATE SET store_name = EXCLUDED.store_name;

-- 4. SEED MASTER ROLES (dat_role)
INSERT INTO dat_role (role_id, role_code, role_name, description, is_system_role) VALUES
('30000000-0000-0000-0000-000000000001', 'SUPERADMIN',    'Super Administrator',    'Akses penuh ke seluruh sistem dan modul OmniSight', TRUE),
('30000000-0000-0000-0000-000000000002', 'SRE_ENGINEER',  'Site Reliability Eng.',   'Pengelolaan infrastruktur, agen telemetri, dan eksekusi skrip', FALSE),
('30000000-0000-0000-0000-000000000003', 'SEC_AUDITOR',   'Security Auditor',       'Akses baca audit trail, log WAF, SIEM, dan compliance guard', FALSE),
('30000000-0000-0000-0000-000000000004', 'STORE_MANAGER', 'Store / Branch Manager', 'Pengelolaan tiket insiden dan CMDB aset tingkat cabang', FALSE),
('30000000-0000-0000-0000-000000000005', 'STAFF_USER',    'Staff Operational User', 'Akses dasar pelaporan insiden dan dashboard monitoring', FALSE)
ON CONFLICT (role_id) DO UPDATE SET role_name = EXCLUDED.role_name;

-- 5. SEED MASTER SUB-MODULE MENUS (dat_menu) — 19 Sub-Modul
INSERT INTO dat_menu (menu_id, group_code, sub_module_code, menu_name, description, route_path, icon_name, sort_order) VALUES
('50000000-0000-0000-0000-000000000001', 'CM', 'CM01', 'Identity & Auth Manager', 'Manajemen Auth, MFA, & Web Service HRIS', '/cm/identity', 'ShieldCheck', 10),
('50000000-0000-0000-0000-000000000002', 'CM', 'CM02', 'Tenant & Master Data',     'Pengelolaan Company, Area, & Store', '/cm/master-data', 'Building', 20),
('50000000-0000-0000-0000-000000000003', 'CM', 'CM03', 'Audit Trail & Settings',  'Audit trail sistem dan konfigurasi rotasi log', '/cm/audit-trail', 'FileText', 30),
('50000000-0000-0000-0000-000000000004', 'CT', 'CT01', 'Docker Stack Engine',     'Pengelolaan Docker Compose (Dockge/Arcane engine)', '/ct/docker-stack', 'Box', 40),
('50000000-0000-0000-0000-000000000005', 'CT', 'CT02', 'Container Terminal',      'Terminal akses container & inspeksi log real-time', '/ct/terminal', 'Terminal', 50),
('50000000-0000-0000-0000-000000000006', 'MN', 'MN01', 'Lightweight Agent Metrics','Telemetri Host CPU, RAM, Disk, Net (Beszel engine)', '/mn/agent-metrics', 'Activity', 60),
('50000000-0000-0000-0000-000000000007', 'MN', 'MN02', 'Synthetic Uptime & SSL',  'Monitoring Uptime & Certificate Warning (Uptime Kuma engine)', '/mn/uptime-ssl', 'Globe', 70),
('50000000-0000-0000-0000-000000000008', 'MN', 'MN03', 'SNMP Infrastructure',     'Monitoring Jaringan & Router (Zabbix/LibreNMS engine)', '/mn/snmp-monitor', 'Server', 80),
('50000000-0000-0000-0000-000000000009', 'MN', 'MN04', 'Alert & Escalation Matrix', 'Evaluator Threshold & Deduplikasi Alert', '/mn/alerts', 'Bell', 90),
('50000000-0000-0000-0000-000000000010', 'SE', 'SE01', 'Privileged Access (PAM)', 'Bastion Web Terminal SSH/RDP (JumpServer engine)', '/se/pam-terminal', 'Key', 100),
('50000000-0000-0000-0000-000000000011', 'SE', 'SE02', 'SIEM & Threat Guard',     'Deteksi ancaman keamanan & aturan compliance (Wazuh engine)', '/se/threat-guard', 'Lock', 110),
('50000000-0000-0000-0000-000000000012', 'NP', 'NP01', 'Nginx Proxy & SSL',       'Reverse proxy domain dan auto-renew SSL (Nginx UI)', '/np/proxy-manager', 'Share2', 120),
('50000000-0000-0000-0000-000000000013', 'NP', 'NP02', 'IPAM & Network Map',      'Alokasi IP Address & Source of Truth (NetBox engine)', '/np/ipam', 'Network', 130),
('50000000-0000-0000-0000-000000000014', 'AM', 'AM01', 'IT Asset Inventory',      'Inventarisasi Hardware & Lisensi (Snipe-IT engine)', '/am/hardware', 'Cpu', 140),
('50000000-0000-0000-0000-000000000015', 'AM', 'AM02', 'DCIM & Rack Mapping',     'Pemetaan Rack Server Data Center (Ralph engine)', '/am/dcim-racks', 'Layers', 150),
('50000000-0000-0000-0000-000000000016', 'AM', 'AM03', 'Store Equipment CMDB',    'Aset TI khusus Toko & Cabang', '/am/store-assets', 'ShoppingBag', 160),
('50000000-0000-0000-0000-000000000017', 'SD', 'SD01', 'Incident Ticketing',      'Tiketing insiden TI dan kendala operasional (GLPI engine)', '/sd/tickets', 'LifeBuoy', 170),
('50000000-0000-0000-0000-000000000018', 'SD', 'SD02', 'SLA Escalation Manager',  'Pemantauan SLA tiket dan eskalasi otomatis', '/sd/sla-monitor', 'Clock', 180),
('50000000-0000-0000-0000-000000000019', 'AG', 'AG01', 'MCP Gateway Registry',    'Registry Model Context Protocol & AI routing', '/ag/mcp-registry', 'Bot', 190),
('50000000-0000-0000-0000-000000000020', 'AG', 'AG02', 'Directus Work Log',       'Pencatatan laporan kerja AI ke Directus (`osc_note`)', '/ag/work-log', 'BookOpen', 200)
ON CONFLICT (menu_id) DO UPDATE SET menu_name = EXCLUDED.menu_name;

-- 6. SEED MASTER USERS (dat_user)
INSERT INTO dat_user (user_id, username, email, password_hash, hris_backup_password, mfa_secret, is_mfa_enabled, is_active, is_superadmin) VALUES
-- Passwords below are Argon2id hashes for 'OmniSight2026!'
('40000000-0000-0000-0000-000000000001', 'admin_omni',    'admin@omnisight.local',    '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlzYWx0MTIzNDU2Nw$X4q0+8Jg2Qk1w3q+W9k8+Q', NULL, NULL, FALSE, TRUE, TRUE),
('40000000-0000-0000-0000-000000000002', 'sre_lead',      'sre.lead@omnisight.local',  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlzYWx0MTIzNDU2Nw$X4q0+8Jg2Qk1w3q+W9k8+Q', '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlzYWx0MTIzNDU2Nw$X4q0+8Jg2Qk1w3q+W9k8+Q', 'JBSWY3DPEHPK3PXP', TRUE, TRUE, FALSE),
('40000000-0000-0000-0000-000000000003', 'sec_auditor',   'auditor@omnisight.local',   '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlzYWx0MTIzNDU2Nw$X4q0+8Jg2Qk1w3q+W9k8+Q', NULL, NULL, FALSE, TRUE, FALSE),
('40000000-0000-0000-0000-000000000004', 'retail_manager','mgr.retail@retail.co.id',   NULL, '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlzYWx0MTIzNDU2Nw$X4q0+8Jg2Qk1w3q+W9k8+Q', 'KRSXG5CTMVRXEZLU', TRUE, TRUE, FALSE),
('40000000-0000-0000-0000-000000000005', 'staff_logistics','staff.log@logistics.co.id', NULL, '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlzYWx0MTIzNDU2Nw$X4q0+8Jg2Qk1w3q+W9k8+Q', NULL, FALSE, TRUE, FALSE)
ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;

-- 7. SEED DATA KEPEGAWAIAN (dat_employee)
INSERT INTO dat_employee (employee_id, user_id, employee_nik, full_name, home_company_id, home_area_id, home_store_id, position_title, department, phone_number, is_active) VALUES
('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'NIK-0001', 'Chief Systems Architect', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Head of Infrastructure', 'IT Operations', '+628111000001', TRUE),
('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'NIK-0002', 'Lead SRE & DevOps Eng',   '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Principal SRE', 'DevSecOps', '+628111000002', TRUE),
('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'NIK-0003', 'Senior SecOps Auditor',   '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Security Auditor', 'Information Security', '+628111000003', TRUE),
('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 'NIK-8801', 'Budi Santoso (Store Mgr)', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Store Manager GI', 'Retail Operations', '+628129000881', TRUE),
('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005', 'NIK-9901', 'Siti Rahma (Logistics Staff)','00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'Logistics Supervisor', 'Warehouse', '+628139000991', TRUE)
ON CONFLICT (employee_id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- 8. SEED INFRASTRUCTURE NODES & AGENT CONFIG (dat_server & dat_agent_config)
INSERT INTO dat_server (server_id, company_id, area_id, server_hostname, ip_address, os_type, agent_node_id, environment, is_active) VALUES
('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'osc-prod-app01', '192.168.10.10', 'Ubuntu', 'node-agent-ubuntuhq-01', 'production', TRUE),
('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'osc-prod-db01',  '192.168.10.20', 'Ubuntu', 'node-agent-ubuntudb-01', 'production', TRUE),
('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'pos-win-gi01',   '172.18.21.8',  'Windows', 'node-agent-winpos-01',  'production', TRUE)
ON CONFLICT (server_id) DO UPDATE SET server_hostname = EXCLUDED.server_hostname;

INSERT INTO dat_agent_config (config_id, server_id, metrics_interval_s, heartbeat_interval_s, allow_remote_exec, telemetry_enabled, config_version) VALUES
('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 10, 30, TRUE, TRUE, 1),
('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 5,  15, FALSE, TRUE, 1),
('80000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003', 15, 60, TRUE, TRUE, 1)
ON CONFLICT (server_id) DO UPDATE SET metrics_interval_s = EXCLUDED.metrics_interval_s;

-- 9. SEED STORE ASSETS & EQUIPMENT CMDB (BAL0109 / CK MELASTI)
INSERT INTO dat_store_telephony (store_id, ip_address, phone_type, phone_number, phone_imei)
VALUES ('20000000-0000-0000-0000-000000000005', '172.18.21.8', 'Samsung Galaxy A13', '62818157484', '354690571407220')
ON CONFLICT (store_id) DO UPDATE SET ip_address = EXCLUDED.ip_address;

INSERT INTO dat_store_pos (store_id, pos_slot, pc_model, ram_capacity, printer_model)
VALUES 
    ('20000000-0000-0000-0000-000000000005', 'ss_pos', 'Lenovo TC M70q', '8 GB', 'HP Laser 107'),
    ('20000000-0000-0000-0000-000000000005', 'c1_pos', 'Lenovo TC M70q', '8 GB', 'Citizen')
ON CONFLICT (store_id, pos_slot) DO UPDATE SET pc_model = EXCLUDED.pc_model;

INSERT INTO dat_store_edc (store_id, bank_name, edc_model, connection_type, connect_target, mid_code, tid_code)
VALUES 
    ('20000000-0000-0000-0000-000000000005', 'BCA', 'Move/2500', 'LAN', 'CASHIER 1', '44201345', 'COCU3241'),
    ('20000000-0000-0000-0000-000000000005', 'MDR', 'Move/2500', 'H2H', NULL, '71419453416', '77570260'),
    ('20000000-0000-0000-0000-000000000005', 'BRI', 'Verifone/X990', 'LAN', 'SS', '1999517046', '10860872');

INSERT INTO dat_store_digisign (store_id, pc_brand, pc_serial_number, rental_status, tv_unit_count, tv1_brand, tv1_serial_number, tv2_brand, tv2_serial_number)
VALUES 
    ('20000000-0000-0000-0000-000000000005', 'BMax', '3001C260400421', 'YA', 2, 'Aqua', 'DH1ZN4M00010PS4H0509', 'Aqua', 'DH1ZN4M00010PS4L0010');
