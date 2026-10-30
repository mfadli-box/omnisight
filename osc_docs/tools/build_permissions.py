import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "technical" / "contracts" / "permissions.json"

modules = [
    ("AA", "Dashboard", "Dashboard", "/dashboard", "/dashboard"),
    ("AB", "Identity, Organization, and Access", "Identitas, Organisasi, dan Akses", "/identity", "/identity"),
    ("AC", "Asset Management", "Manajemen Aset", "/assets", "/assets"),
    ("AD", "Network and IPAM", "Jaringan dan IPAM", "/network", "/network"),
    ("AE", "Infrastructure Monitoring", "Monitoring Infrastruktur", "/monitoring", "/monitoring"),
    ("AF", "Container Operations", "Operasi Container", "/containers", "/containers"),
    ("AG", "Edge, Domain, and Certificates", "Edge, Domain, dan Sertifikat", "/edge", "/edge"),
    ("AH", "Backup and Configuration", "Backup dan Konfigurasi", "/backups", "/backups"),
    ("AI", "Secure Access", "Akses Aman", "/access", "/access"),
    ("AJ", "Service Desk and Contracts", "Layanan dan Kontrak", "/service-desk", "/service-desk"),
    ("AK", "Content and Notifications", "Konten dan Notifikasi", "/content", "/content"),
    ("AL", "Audit and Security", "Audit dan Keamanan", "/audit", "/audit"),
    ("AM", "Platform Settings", "Pengaturan Platform", "/platform", "/settings"),
]

# code, name_en, name_id, read, post, scope, sensitivity, approval, sensitive_roles, note
subs = [
    ("AA01", "Summary", "Ringkasan", "AA:read", None, ["user"], "normal", "none", [], "Filtered by the user's effective scope."),
    ("AA02", "Service Health", "Kesehatan Layanan", "AA:read", None, ["company", "global"], "normal", "none", [], "No internal hostnames in component data."),
    ("AA03", "Recent Activity", "Aktivitas Terbaru", "AA:read", None, ["company", "area"], "normal", "none", [], "Audit filter follows the user's permissions."),
    ("AB01", "Companies and Areas", "Perusahaan dan Area", "AB:read", "AB:post", ["global", "company"], "normal", "none", [], "Company creation is platform-only; area management is company-scoped."),
    ("AB02", "Users and Invitations", "Pengguna dan Undangan", "AB02:read", "AB02:post", ["company"], "high", "none", ["company_admin"], "Re-authentication and reason required."),
    ("AB03", "Roles and Permissions", "Peran dan Izin", "AB03:read", "AB03:post", ["company"], "high", "none", ["company_admin"], "Re-authentication; last admin cannot be removed."),
    ("AB04", "HRIS Login", "Login HRIS", "AB04:read", "AB04:post", ["company"], "critical", "required", ["company_admin"], "Re-authentication and approval required."),
    ("AB05", "Sessions and Devices", "Sesi dan Perangkat", "AB05:read", "AB05:post", ["company", "self"], "high", "none", ["company_admin"], "Own sessions use self-service; other users require AB05:post."),
    ("AB06", "Login History", "Riwayat Login", "AB06:read", None, ["company"], "high", "none", ["company_admin", "auditor"], "Identifiers are masked."),
    ("AB07", "Directory", "Direktori", "AB:read", None, ["company", "area"], "normal", "none", [], "Searchable only within the user's scope."),
    ("AC01", "Categories and Models", "Kategori dan Model", "AC:read", "AC:post", ["company", "area"], "normal", "none", [], ""),
    ("AC02", "Physical Assets", "Aset Fisik", "AC:read", "AC:post", ["area"], "normal", "none", [], ""),
    ("AC03", "Locations and Placement", "Lokasi dan Penempatan", "AC:read", "AC:post", ["area"], "normal", "none", [], "Composite foreign key enforces company, area, and location consistency."),
    ("AC04", "Check-out / Check-in", "Check-out / Check-in", "AC:read", "AC:post", ["area"], "normal", "none", [], ""),
    ("AC05", "Movements and History", "Mutasi dan Riwayat", "AC:read", None, ["area"], "normal", "none", [], "History is append-only."),
    ("AC06", "Labels and QR", "Label dan QR", "AC:read", "AC:post", ["area"], "normal", "none", [], "QR tokens contain no sensitive data."),
    ("AC07", "Asset Reports", "Laporan Aset", "AC:read", None, ["company", "area"], "normal", "none", [], "Exports are audited."),
    ("AD01", "Sites, Racks, and Locations", "Site, Rack, dan Lokasi", "AD:read", "AD:post", ["area"], "normal", "none", [], ""),
    ("AD02", "Network Devices", "Perangkat Jaringan", "AD:read", "AD:post", ["area"], "normal", "none", [], ""),
    ("AD03", "IPAM and VLANs", "IPAM dan VLAN", "AD:read", "AD:post", ["area"], "normal", "none", [], "Allocation conflicts are checked."),
    ("AD04", "Topology and Links", "Topologi dan Koneksi", "AD:read", None, ["area"], "normal", "none", [], ""),
    ("AD05", "MikroTik Routers", "Router MikroTik", "AD:read", "AD:post", ["area"], "high", "none", [], "Credentials are vault references."),
    ("AD06", "Firewall and Rules", "Firewall dan Aturan", "AD06:read", "AD06:post", ["area"], "critical", "required", ["company_admin", "area_manager", "noc_operator"], "Plan, approval, snapshot, execute, verify, and rollback."),
    ("AD07", "RouterOS Maintenance", "Maintenance RouterOS", "AD07:read", "AD07:post", ["area"], "critical", "required", ["company_admin", "area_manager", "noc_operator"], "Approval and snapshot required."),
    ("AD08", "NetBox/LibreNMS Integration", "Integrasi NetBox/LibreNMS", "AD:read", "AD:post", ["company"], "normal", "none", [], "Synchronization is idempotent; conflicts go to review."),
    ("AE01", "Hosts and Agents", "Host dan Agent", "AE:read", None, ["area"], "normal", "none", [], ""),
    ("AE02", "Metrics and Charts", "Metrik dan Grafik", "AE:read", None, ["area"], "normal", "none", [], ""),
    ("AE03", "Alerts and Thresholds", "Alert dan Ambang Batas", "AE:read", "AE:post", ["area"], "normal", "none", [], ""),
    ("AE04", "Incidents", "Insiden", "AE:read", "AE:post", ["area"], "normal", "none", [], ""),
    ("AE05", "LibreNMS Integration", "Integrasi LibreNMS", "AE:read", "AE:post", ["company"], "normal", "none", [], ""),
    ("AE06", "Wazuh Integration", "Integrasi Wazuh", "AE06:read", "AE06:post", ["company"], "critical", "required", ["company_admin", "noc_operator"], "Approval required for active response."),
    ("AE07", "Metric Retention", "Retensi Metrik", "AE:read", "AE:post", ["company"], "normal", "none", [], ""),
    ("AF01", "Endpoints", "Endpoint", "AF:read", "AF:post", ["area"], "high", "none", [], "TLS and socket proxy required."),
    ("AF02", "Stacks and Compose", "Stack dan Compose", "AF:read", "AF:post", ["area"], "normal", "none", [], "Compose validation and image digest required."),
    ("AF03", "Services and Containers", "Layanan dan Container", "AF:read", None, ["area"], "normal", "none", [], ""),
    ("AF04", "Deploy and Rollback", "Deploy dan Rollback", "AF04:read", "AF04:post", ["area"], "critical", "required", ["company_admin", "area_manager", "noc_operator"], "Approval, health check, and rollback."),
    ("AF05", "Maintenance", "Maintenance", "AF05:read", "AF05:post", ["area"], "high", "policy", ["company_admin", "area_manager", "noc_operator"], "Approval depends on the environment."),
    ("AF06", "Host Overview", "Gambaran Host", "AF:read", None, ["area"], "normal", "none", [], ""),
    ("AG01", "Domains", "Domain", "AG:read", "AG:post", ["company"], "normal", "none", [], ""),
    ("AG02", "Certificates", "Sertifikat", "AG:read", "AG:post", ["company"], "high", "none", [], "Private keys stay in the vault."),
    ("AG03", "Proxy Hosts", "Proxy Host", "AG:read", "AG:post", ["company"], "normal", "none", [], ""),
    ("AG04", "Nginx Configuration", "Konfigurasi Nginx", "AG04:read", "AG04:post", ["company", "area"], "critical", "required", ["company_admin", "area_manager"], "Approval, nginx -t, and rollback."),
    ("AG05", "Edge Nodes", "Edge Node", "AG:read", "AG:post", ["company"], "normal", "none", [], ""),
    ("AH01", "Configuration Sources", "Sumber Konfigurasi", "AH:read", "AH:post", ["company", "area"], "normal", "none", [], ""),
    ("AH02", "Backup Schedules", "Jadwal Backup", "AH:read", "AH:post", ["company", "area"], "normal", "none", [], ""),
    ("AH03", "Snapshots and Diff", "Snapshot dan Diff", "AH:read", None, ["company", "area"], "high", "none", [], "Encrypted snapshots; downloads are audited."),
    ("AH04", "Restore", "Restore", "AH04:read", "AH04:post", ["company", "area"], "critical", "dual_control", ["company_admin"], "Applicant and approver must be different users."),
    ("AH05", "Verification", "Verifikasi", "AH05:read", "AH05:post", ["company"], "high", "required", ["company_admin"], "Verification runs in an isolated environment."),
    ("AI01", "Access Targets", "Target Akses", "AI:read", "AI:post", ["company", "area"], "high", "none", [], "Credentials are vault references."),
    ("AI02", "Access Requests", "Permintaan Akses", "AI02:read", "AI02:post", ["self", "area"], "high", "none", ["company_admin", "area_manager"], "Requester uses AI:post with self scope; approvers use AI02:read/post. Self-approval is rejected."),
    ("AI03", "Active Sessions", "Sesi Aktif", "AI:read", "AI:post", ["area"], "high", "none", [], "Termination takes effect immediately."),
    ("AI04", "Recordings and Audit", "Rekaman dan Audit", "AI:read", None, ["company"], "high", "none", [], "Metadata and recorded-session links are audited."),
    ("AI05", "Access Policies", "Kebijakan Akses", "AI05:read", "AI05:post", ["company"], "high", "none", ["company_admin"], "Re-authentication required."),
    ("AJ01", "Tickets", "Tiket", "AJ:read", "AJ:post", ["self", "area"], "normal", "none", [], "Requesters see only their own tickets unless they hold area scope."),
    ("AJ02", "Categories and SLA", "Kategori dan SLA", "AJ:read", "AJ:post", ["company"], "normal", "none", [], ""),
    ("AJ03", "Contracts and Vendors", "Kontrak dan Vendor", "AJ:read", "AJ:post", ["company"], "high", "none", [], "Documents have restricted access."),
    ("AJ04", "Knowledge Base", "Knowledge Base", "AJ:read", "AJ:post", ["company", "public"], "normal", "none", [], "HTML is sanitized."),
    ("AJ05", "Service Reports", "Laporan Layanan", "AJ:read", None, ["company", "area"], "normal", "none", [], ""),
    ("AK01", "Articles and Pages", "Artikel dan Halaman", "AK:read", "AK:post", ["company", "public"], "normal", "none", [], "HTML is sanitized."),
    ("AK02", "Blog and Announcements", "Blog dan Pengumuman", "AK:read", "AK:post", ["company", "public"], "normal", "none", [], ""),
    ("AK03", "Notification Templates", "Template Notifikasi", "AK:read", "AK:post", ["company"], "normal", "none", [], "Template variables are validated."),
    ("AK04", "Delivery and History", "Kirim dan Riwayat", "AK:read", None, ["company"], "normal", "none", [], ""),
    ("AK05", "User Preferences", "Preferensi Pengguna", "AK:read", "AK:post", ["self"], "normal", "none", [], "Self-service only."),
    ("AL01", "Audit Trail", "Audit Trail", "AL:read", None, ["company"], "high", "none", [], "Sensitive payload fields are redacted."),
    ("AL02", "Logins and Access", "Login dan Akses", "AL:read", None, ["company"], "high", "none", [], "Identifiers are masked."),
    ("AL03", "Security Events", "Kejadian Keamanan", "AL:read", "AL:post", ["company"], "high", "none", [], "Triage is audited."),
    ("AL04", "Access Reviews", "Review Akses", "AL04:read", "AL04:post", ["company"], "high", "none", ["company_admin", "auditor"], "The reviewer cannot be the review target."),
    ("AL05", "Export and Retention", "Ekspor dan Retensi", "AL05:read", "AL05:post", ["company"], "critical", "required", ["company_admin", "auditor"], "Approval, watermark, and export audit."),
    ("AM01", "Integrations and Adapters", "Integrasi dan Adapter", "AM:read", "AM:post", ["company"], "high", "none", [], "Secrets are vault references."),
    ("AM02", "Credentials and Vault", "Kredensial dan Vault", "AM02:read", "AM02:post", ["company"], "critical", "required", ["company_admin"], "Secret values are never returned."),
    ("AM03", "Webhooks and API Keys", "Webhook dan API Key", "AM03:read", "AM03:post", ["company"], "high", "none", ["company_admin"], "Keys are shown once and expire."),
    ("AM04", "Scheduler", "Scheduler", "AM:read", "AM:post", ["company"], "normal", "none", [], ""),
    ("AM05", "Platform Settings", "Pengaturan Platform", "AM:read", "AM:post", ["company"], "normal", "none", [], ""),
    ("AM06", "Feature Flags", "Feature Flag", "AM:read", "AM:post", ["company"], "normal", "none", [], ""),
    ("AM07", "Branding and Theme", "Branding dan Tema", "AM:read", "AM:post", ["company"], "normal", "none", [], "Upload validation required."),
    ("AM08", "Impersonation and Support", "Impersonasi dan Dukungan", "AM08:read", "AM08:post", ["global"], "critical", "required", [], "Platform owner only; MFA, reason, time limit, and permanent banner."),
]

assert len(subs) == 76, len(subs)
assert len({s[0] for s in subs}) == 76

module_grants = {
    "company_admin": {
        "AA": "read", "AB": "post", "AC": "post", "AD": "post", "AE": "post",
        "AF": "post", "AG": "post", "AH": "post", "AI": "post", "AJ": "post",
        "AK": "post", "AL": "read", "AM": "post",
    },
    "area_manager": {
        "AA": "read", "AB": "read", "AC": "post", "AD": "post*", "AE": "post",
        "AF": "post*", "AG": "post*", "AH": "read", "AI": "post", "AJ": "post",
        "AK": "read", "AL": "read", "AM": "none",
    },
    "noc_operator": {
        "AA": "read", "AB": "read", "AC": "read", "AD": "post*", "AE": "post",
        "AF": "post*", "AG": "read", "AH": "read", "AI": "read", "AJ": "post",
        "AK": "read", "AL": "read", "AM": "none",
    },
    "field_technician": {
        "AA": "read", "AB": "read", "AC": "post", "AD": "read", "AE": "read",
        "AF": "read", "AG": "none", "AH": "none", "AI": "none", "AJ": "post",
        "AK": "read", "AL": "none", "AM": "none",
    },
    "viewer": {
        "AA": "read", "AB": "read", "AC": "read", "AD": "read", "AE": "read",
        "AF": "read", "AG": "read", "AH": "read", "AI": "none", "AJ": "read",
        "AK": "read", "AL": "none", "AM": "none",
    },
    "auditor": {
        "AA": "read", "AB": "read", "AC": "read", "AD": "read", "AE": "read",
        "AF": "read", "AG": "read", "AH": "read", "AI": "read", "AJ": "read",
        "AK": "read", "AL": "read", "AM": "read",
    },
    "requester": {
        "AA": "read_self", "AB": "none", "AC": "none", "AD": "none", "AE": "none",
        "AF": "none", "AG": "none", "AH": "none", "AI": "post_self", "AJ": "post_self",
        "AK": "read", "AL": "none", "AM": "none",
    },
}

role_names = {
    "company_admin": ("Company Admin", "Admin Perusahaan"),
    "area_manager": ("Area Manager", "Manajer Area"),
    "noc_operator": ("NOC Operator", "Operator NOC"),
    "field_technician": ("Field Technician", "Teknisi Lapangan"),
    "viewer": ("Viewer", "Pengamat"),
    "auditor": ("Auditor", "Auditor"),
    "requester": ("Requester", "Pemohon"),
}

platform_roles = {
    "platform_owner": {
        "name_en": "Platform Owner", "name_id": "Pemilik Platform", "scope": "global",
        "permissions": ["AM:read", "AM:post", "AB:post", "AM08:read", "AM08:post"],
        "limits": "AB:post applies only to company lifecycle and the first admin; business data requires impersonation.",
    },
    "platform_support": {
        "name_en": "Platform Support", "name_id": "Dukungan Platform", "scope": "global",
        "permissions": ["AA:read", "AL:read", "AM:read"],
        "limits": "Cannot change company business data.",
    },
    "platform_security": {
        "name_en": "Platform Security", "name_id": "Keamanan Platform", "scope": "global",
        "permissions": ["AL:read", "AL04:post", "AL05:post", "AM:read"],
        "limits": "Cannot change company business configuration or start impersonation.",
    },
}

# Submodules whose permission is guarded by a submodule code instead of the module code.
SUB_PERMISSION_CODES = {
    "AB02", "AB03", "AB04", "AB05", "AB06",
    "AD06", "AD07", "AE06",
    "AF04", "AF05", "AG04", "AH04", "AH05",
    "AI02", "AI05", "AL04", "AL05",
    "AM02", "AM03", "AM08",
}

permission_codes = set()
for _, _, _, read, post, *_ in subs:
    permission_codes.add(read)
    if post:
        permission_codes.add(post)
for role in platform_roles.values():
    permission_codes.update(role["permissions"])

data = {
    "version": "0.6.0",
    "status": "approved",
    "source": "osc_docs/security/matriks-izin.md",
    "generated_from": ["osc_docs/security/matriks-izin.md", "osc_docs/product/peta-modul.md"],
    "model": {
        "actions": ["read", "post"],
        "post_includes_read": True,
        "permission_format": ["<module>:<action>", "<submodule>:<action>"],
        "scope_types": ["global", "company", "area", "self", "public", "user", "internal"],
        "approval_levels": ["none", "policy", "required", "dual_control"],
        "sensitivity_levels": ["normal", "high", "critical"],
    },
    "modules": [
        {"code": code, "name_en": en, "name_id": idn, "api_prefix": api, "ui_prefix": ui}
        for code, en, idn, api, ui in modules
    ],
    "system_roles": {
        code: {
            "name_en": role_names[code][0],
            "name_id": role_names[code][1],
            "module_grants": module_grants[code],
            "notes": {
                "company_admin": ["Cannot approve own requests.", "Cannot remove the last admin.", "No global platform data."],
                "area_manager": ["Area and descendants only.", "Cannot manage roles, HRIS, or platform credentials."],
                "noc_operator": ["May plan and execute after approval.", "Cannot approve own requests."],
                "field_technician": ["Assets and tickets in the assigned area.", "No bulk export or audit access."],
                "viewer": ["Read-only.", "Audit requires explicit AL:read."],
                "auditor": ["Reads audit and access reviews.", "Does not write business data."],
                "requester": ["Self-service only.", "Cannot browse the directory or shared assets."],
            }[code],
        }
        for code in role_names
    },
    "platform_roles": platform_roles,
    "submodules": [
        {
            "code": code,
            "module": code[:2],
            "name_en": en,
            "name_id": idn,
            "permissions": {"read": read, "post": post},
            "scope": scope,
            "sensitivity": sensitivity,
            "approval": approval,
            "sensitive_roles": roles,
            "note": note or None,
            "sensitive_permission_replaces_module": code in SUB_PERMISSION_CODES,
            "platform_only": code == "AM08",
        }
        for code, en, idn, read, post, scope, sensitivity, approval, roles, note in subs
    ],
    "sensitive_submodules": [
        {
            "code": code, "read": read, "post": post, "approval": approval,
            "roles": roles, "sensitivity": sensitivity,
        }
        for code, _, _, read, post, _, sensitivity, approval, roles, _ in subs
        if code in SUB_PERMISSION_CODES
    ],
    "self_service": [
        {"method": "GET", "path": "/api/v1/auth/me", "scope": "self", "permission": "session:self"},
        {"method": "PATCH", "path": "/api/v1/auth/me", "scope": "self", "permission": "session:self"},
        {"method": "GET", "path": "/api/v1/auth/sessions", "scope": "self", "permission": "session:self"},
        {"method": "POST", "path": "/api/v1/auth/sessions/{id}/revoke", "scope": "self", "permission": "session:self"},
        {"method": "POST", "path": "/api/v1/auth/mfa/enroll", "scope": "self", "permission": "session:self"},
        {"method": "POST", "path": "/api/v1/auth/mfa/verify", "scope": "self", "permission": "session:self"},
        {"method": "GET", "path": "/api/v1/assets/mine", "scope": "self", "permission": "session:self"},
        {"method": "PATCH", "path": "/api/v1/content/preferences", "scope": "self", "permission": "AK:post"},
        {"method": "GET", "path": "/api/v1/service-desk/tickets/mine", "scope": "self", "permission": "AJ:read"},
        {"method": "GET", "path": "/api/v1/access/requests/mine", "scope": "self", "permission": "AI:post"},
    ],
    "permission_codes": sorted(permission_codes),
}

assert len(subs) == 76, len(subs)
assert len({s[0] for s in subs}) == 76
assert len(SUB_PERMISSION_CODES) == 20
assert {s[0] for s in subs if s[3].startswith(s[0])} == SUB_PERMISSION_CODES
assert len(data["sensitive_submodules"]) == 20

OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT} ({len(subs)} submodules, {len(permission_codes)} permission codes)")
