import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1] / "technical" / "contracts"
errors = json.loads((BASE / "kode-error.json").read_text(encoding="utf-8"))

backend_en = {
    "error": {row["code"]: row["default_message_en"] for row in errors["global"] + errors["module"]},
    "validation": {row["code"]: row["default_message_en"] for row in errors["field"]},
}
backend_id = {
    "error": {row["code"]: row["default_message_id"] for row in errors["global"] + errors["module"]},
    "validation": {row["code"]: row["default_message_id"] for row in errors["field"]},
}

common_en = {
    "appName": "OmniSight",
    "loading": "Loading...",
    "retry": "Try again",
    "cancel": "Cancel",
    "save": "Save",
    "create": "Create",
    "edit": "Edit",
    "delete": "Delete",
    "confirm": "Confirm",
    "close": "Close",
    "search": "Search",
    "filter": "Filter",
    "reset": "Reset",
    "actions": "Actions",
    "status": "Status",
    "empty": "No data",
    "requestId": "Request ID",
    "language": "Language",
    "english": "English",
    "indonesian": "Indonesian",
    "yes": "Yes",
    "no": "No",
    "back": "Back",
    "next": "Next",
    "previous": "Previous",
    "export": "Export",
    "download": "Download",
    "upload": "Upload",
    "approve": "Approve",
    "reject": "Reject",
    "reason": "Reason",
    "required": "Required",
    "optional": "Optional",
    "readOnly": "Read only",
    "copy": "Copy",
    "copied": "Copied",
    "show": "Show",
    "hide": "Hide",
}
common_id = {
    "appName": "OmniSight",
    "loading": "Memuat...",
    "retry": "Coba lagi",
    "cancel": "Batal",
    "save": "Simpan",
    "create": "Buat",
    "edit": "Ubah",
    "delete": "Hapus",
    "confirm": "Konfirmasi",
    "close": "Tutup",
    "search": "Cari",
    "filter": "Filter",
    "reset": "Atur ulang",
    "actions": "Aksi",
    "status": "Status",
    "empty": "Tidak ada data",
    "requestId": "ID Permintaan",
    "language": "Bahasa",
    "english": "Inggris",
    "indonesian": "Indonesia",
    "yes": "Ya",
    "no": "Tidak",
    "back": "Kembali",
    "next": "Berikutnya",
    "previous": "Sebelumnya",
    "export": "Ekspor",
    "download": "Unduh",
    "upload": "Unggah",
    "approve": "Setujui",
    "reject": "Tolak",
    "reason": "Alasan",
    "required": "Wajib",
    "optional": "Opsional",
    "readOnly": "Hanya baca",
    "copy": "Salin",
    "copied": "Tersalin",
    "show": "Tampilkan",
    "hide": "Sembunyikan",
}

nav_en = {
    "dashboard": "Dashboard",
    "identity": "Identity",
    "assets": "Assets",
    "network": "Network",
    "monitoring": "Monitoring",
    "containers": "Containers",
    "edge": "Edge",
    "backups": "Backups",
    "access": "Secure Access",
    "serviceDesk": "Service Desk",
    "content": "Content",
    "audit": "Audit",
    "settings": "Settings",
    "profile": "Profile",
    "security": "Account Security",
    "notifications": "Notifications",
    "search": "Global Search",
    "help": "Help",
    "company": "Company",
    "area": "Area",
}
nav_id = {
    "dashboard": "Dashboard",
    "identity": "Identitas",
    "assets": "Aset",
    "network": "Jaringan",
    "monitoring": "Monitoring",
    "containers": "Container",
    "edge": "Edge",
    "backups": "Backup",
    "access": "Akses Aman",
    "serviceDesk": "Layanan",
    "content": "Konten",
    "audit": "Audit",
    "settings": "Pengaturan",
    "profile": "Profil",
    "security": "Keamanan Akun",
    "notifications": "Notifikasi",
    "search": "Pencarian Global",
    "help": "Bantuan",
    "company": "Perusahaan",
    "area": "Area",
}

auth_en = {
    "signIn": "Sign in",
    "signInHris": "Sign in with HRIS",
    "email": "Email",
    "identifier": "Employee email or ID",
    "password": "Password",
    "company": "Company",
    "selectCompany": "Select company",
    "selectArea": "Select area",
    "mfaTitle": "Multi-factor authentication",
    "mfaCode": "Authentication code",
    "verify": "Verify",
    "signOut": "Sign out",
    "sessionExpired": "Your session has expired. Please sign in again.",
    "accessDeniedTitle": "Access denied",
    "accessDeniedBody": "You do not have access to this page. Contact an administrator if you need access.",
    "notFoundTitle": "Not found",
    "notFoundBody": "The requested data was not found.",
    "impersonationBanner": "You are viewing this account as a platform administrator.",
}
auth_id = {
    "signIn": "Masuk",
    "signInHris": "Masuk dengan HRIS",
    "email": "Email",
    "identifier": "Email atau ID karyawan",
    "password": "Kata sandi",
    "company": "Perusahaan",
    "selectCompany": "Pilih perusahaan",
    "selectArea": "Pilih area",
    "mfaTitle": "Autentikasi multi-faktor",
    "mfaCode": "Kode autentikasi",
    "verify": "Verifikasi",
    "signOut": "Keluar",
    "sessionExpired": "Sesi Anda sudah berakhir. Silakan masuk lagi.",
    "accessDeniedTitle": "Akses ditolak",
    "accessDeniedBody": "Anda tidak memiliki akses ke halaman ini. Hubungi administrator jika membutuhkan akses.",
    "notFoundTitle": "Tidak ditemukan",
    "notFoundBody": "Data yang diminta tidak ditemukan.",
    "impersonationBanner": "Anda melihat akun ini sebagai administrator platform.",
}

states_en = {
    "loading": "Loading data...",
    "empty": "No data yet.",
    "errorTitle": "Unable to load data",
    "errorBody": "Something went wrong. Try again or contact an administrator with the request ID.",
    "forbidden": "You do not have access to this page.",
    "notFound": "The requested data was not found.",
    "conflict": "The data has changed. Reload and try again.",
    "rateLimited": "Too many requests. Please wait before trying again.",
    "dependency": "A supporting service is unavailable. Try again later.",
    "unauthorized": "Your session is invalid or has expired. Please sign in again.",
    "validation": "Check the highlighted fields and try again.",
    "saved": "Changes saved.",
    "created": "Data created.",
    "deleted": "Data deleted.",
    "pendingApproval": "Waiting for approval.",
    "readOnly": "You can view this data but cannot change it.",
}
states_id = {
    "loading": "Memuat data...",
    "empty": "Belum ada data.",
    "errorTitle": "Data gagal dimuat",
    "errorBody": "Terjadi kesalahan. Coba lagi atau hubungi administrator dengan ID permintaan.",
    "forbidden": "Anda tidak memiliki akses ke halaman ini.",
    "notFound": "Data yang diminta tidak ditemukan.",
    "conflict": "Data telah berubah. Muat ulang lalu coba lagi.",
    "rateLimited": "Terlalu banyak permintaan. Tunggu sebelum mencoba lagi.",
    "dependency": "Layanan pendukung tidak tersedia. Coba lagi nanti.",
    "unauthorized": "Sesi Anda tidak valid atau sudah berakhir. Silakan masuk lagi.",
    "validation": "Periksa field yang ditandai lalu coba lagi.",
    "saved": "Perubahan tersimpan.",
    "created": "Data dibuat.",
    "deleted": "Data dihapus.",
    "pendingApproval": "Menunggu persetujuan.",
    "readOnly": "Anda dapat melihat data ini tetapi tidak dapat mengubahnya.",
}

modules_en = {
    "AA": "Dashboard",
    "AB": "Identity, Organization, and Access",
    "AC": "Asset Management",
    "AD": "Network and IPAM",
    "AE": "Infrastructure Monitoring",
    "AF": "Container Operations",
    "AG": "Edge, Domain, and Certificates",
    "AH": "Backup and Configuration",
    "AI": "Secure Access",
    "AJ": "Service Desk and Contracts",
    "AK": "Content and Notifications",
    "AL": "Audit and Security",
    "AM": "Platform Settings",
}
modules_id = {
    "AA": "Dashboard",
    "AB": "Identitas, Organisasi, dan Akses",
    "AC": "Manajemen Aset",
    "AD": "Jaringan dan IPAM",
    "AE": "Monitoring Infrastruktur",
    "AF": "Operasi Container",
    "AG": "Edge, Domain, dan Sertifikat",
    "AH": "Backup dan Konfigurasi",
    "AI": "Akses Aman",
    "AJ": "Layanan dan Kontrak",
    "AK": "Konten dan Notifikasi",
    "AL": "Audit dan Keamanan",
    "AM": "Pengaturan Platform",
}

frontend_en = {
    "common": common_en,
    "nav": nav_en,
    "auth": auth_en,
    "states": states_en,
    "modules": modules_en,
}
frontend_id = {
    "common": common_id,
    "nav": nav_id,
    "auth": auth_id,
    "states": states_id,
    "modules": modules_id,
}

def write(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path}")

write(BASE / "locales/backend/en.json", backend_en)
write(BASE / "locales/backend/id.json", backend_id)
write(BASE / "locales/frontend/en.json", frontend_en)
write(BASE / "locales/frontend/id.json", frontend_id)

def keys(d, prefix=""):
    out = set()
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out |= keys(v, key)
        else:
            out.add(key)
    return out

for name, pair in (("backend", (backend_en, backend_id)), ("frontend", (frontend_en, frontend_id))):
    a, b = keys(pair[0]), keys(pair[1])
    assert a == b, (name, sorted(a - b), sorted(b - a))
    print(f"{name} locale parity: {len(a)} keys")
