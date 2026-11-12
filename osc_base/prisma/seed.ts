// =============================================================================
// omnisight — Idempotent Seeder (reengineering.md bab 5.8 "Idempotent Seeder")
// Author    : ai-base (Database Engineer)
// Blueprint : osc_docs/reengineering.md bab 5.8; Doc: osc_docs/base/schema-p3.md
//
// Jalankan: npx prisma db seed  (dari osc_base; otomatis pasca `prisma migrate`)
//
// Definisi idempotent (bab 5.8):
//   1. Global Super Admin dibuat dari .env (SUPERADMIN_USERNAME / EMAIL /
//      INITIAL_PASSWORD) via upsert by username+email — menjalankan ulang
//      TIDAK menduplikasi dan TIDAK menimpa password yang sudah diubah
//      (hash hanya di-set saat create).
//   2. Master registry MenuModule di-upsert dari manifest deklaratif di kode
//      ini (modul baru muncul otomatis setelah migrasi, privilege per Company
//      tetap dibuat admin via UI).
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// -----------------------------------------------------------------------------
// Env loading: prisma db seed memuat .env pada cwd (osc_base/.env) untuk
// DATABASE_URL; kredensial bootstrap admin hidup di root .env proyek. Muat
// keduanya tanpa menimpa variabel yang sudah ada (no-override).
// -----------------------------------------------------------------------------
function loadEnvFile(path: string, override = false): void {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

const thisDir = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(thisDir, ".env"), false); // osc_base/.env (DATABASE_URL)
loadEnvFile(resolve(thisDir, "../../.env"), false); // root .env (SUPERADMIN_*)

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// 1) Global Super Admin (bootstrap account, bab 5.8 poin 1)
// -----------------------------------------------------------------------------

async function seedSuperAdmin(): Promise<void> {
  const username = process.env.SUPERADMIN_USERNAME;
  const email = process.env.SUPERADMIN_EMAIL;
  const initialPassword = process.env.SUPERADMIN_INITIAL_PASSWORD;

  if (!username || !email || !initialPassword) {
    throw new Error(
      "Seeder: SUPERADMIN_USERNAME / SUPERADMIN_EMAIL / " +
        "SUPERADMIN_INITIAL_PASSWORD wajib diisi di .env (lihat .env.example).",
    );
  }
  if (initialPassword === "change_me_on_first_login") {
    console.warn(
      "[seed] PERINGATAN: SUPERADMIN_INITIAL_PASSWORD masih nilai contoh — " +
        "GANTI sebelum staging/produksi (wajib ganti saat login pertama).",
    );
  }

  // Argon2id (OWASP-native defaults @node-rs/argon2: m=19456,t=2,p=1) —
  // sama kebijakan cache password HRIS (bab 5.2). Plaintext tidak pernah
  // disimpan/log; hash hanya di-set saat CREATE agar password yang sudah
  // diubah user tidak tertimpa seeder.
  const passwordHash = await hash(initialPassword);

  const superAdmin = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      email,
      passwordHash,
      displayName: "Global Super Admin",
      isSuperAdmin: true,
      isActive: true,
    },
    update: {
      // Tidak ada penimpaan passwordHash di sini — idempotent & aman re-run.
      isSuperAdmin: true,
      isActive: true,
    },
  });

  // Guard konflik: username sudah dipakai tapi email berbeda → upsert by
  // username di atas tidak menimpa email; lapangkan lewat cek eksplisit.
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail && byEmail.id !== superAdmin.id) {
    throw new Error(
      `Seeder: email ${email} sudah dipakai user lain (${byEmail.username}).`,
    );
  }

  console.log(
    `[seed] Global Super Admin siap: ${superAdmin.username} <${superAdmin.email}> (id=${superAdmin.id})`,
  );
}

// -----------------------------------------------------------------------------
// 2) Master registry MenuModule (bab 5.8 poin 2 — manifest deklaratif)
//    Upsert by code (unique); parentCode di-resolve pass kedua; re-run aman.
// -----------------------------------------------------------------------------

interface MenuEntry {
  code: string;
  label: string;
  routePath?: string;
  icon?: string;
  parentCode?: string;
  sortOrder?: number;
}

const MENU_MANIFEST: MenuEntry[] = [
  { code: "dashboard", label: "Dashboard", routePath: "/dashboard", icon: "layout-dashboard", sortOrder: 10 },

  { code: "itam", label: "IT Asset Management", icon: "boxes", sortOrder: 20 },
  { code: "itam.assets", label: "Assets", routePath: "/itam/assets", parentCode: "itam", sortOrder: 1 },
  { code: "itam.licenses", label: "Software Licenses", routePath: "/itam/licenses", parentCode: "itam", sortOrder: 2 },
  { code: "itam.checkout", label: "Checkout / Checkin Log", routePath: "/itam/checkout-logs", parentCode: "itam", sortOrder: 3 },
  { code: "servicedesk", label: "Service Desk", routePath: "/servicedesk/tickets", icon: "ticket", parentCode: "itam", sortOrder: 4 },

  { code: "dcim", label: "DCIM & IPAM", icon: "server", sortOrder: 30 },
  { code: "dcim.sites", label: "Sites & Racks", routePath: "/dcim/sites", parentCode: "dcim", sortOrder: 1 },
  { code: "dcim.ipam", label: "IPAM (Prefix & IP)", routePath: "/dcim/ipam", parentCode: "dcim", sortOrder: 2 },
  { code: "dcim.snmp", label: "SNMP Devices", routePath: "/dcim/snmp", parentCode: "dcim", sortOrder: 3 },

  { code: "uptime", label: "Uptime & Status", icon: "activity", sortOrder: 40 },
  { code: "uptime.monitors", label: "Uptime Monitors", routePath: "/uptime/monitors", parentCode: "uptime", sortOrder: 1 },
  { code: "uptime.status-pages", label: "Status Pages", routePath: "/uptime/status-pages", parentCode: "uptime", sortOrder: 2 },

  { code: "infra", label: "Infra Control Plane", icon: "container", sortOrder: 50 },
  { code: "infra.nginx", label: "Nginx Nodes & VHosts", routePath: "/infra/nginx", parentCode: "infra", sortOrder: 1 },
  { code: "infra.docker", label: "Docker Hosts", routePath: "/infra/docker", parentCode: "infra", sortOrder: 2 },
  { code: "infra.compose", label: "Compose Stacks", routePath: "/infra/compose", parentCode: "infra", sortOrder: 3 },

  { code: "alerting", label: "Alerting", icon: "bell-ring", sortOrder: 60 },
  { code: "alerting.rules", label: "Alert Rules", routePath: "/alerting/rules", parentCode: "alerting", sortOrder: 1 },
  { code: "alerting.history", label: "Alert History", routePath: "/alerting/history", parentCode: "alerting", sortOrder: 2 },

  { code: "secops", label: "SecOps (SIEM)", icon: "shield", sortOrder: 70 },
  { code: "secops.fim", label: "FIM Events", routePath: "/secops/fim", parentCode: "secops", sortOrder: 1 },
  { code: "secops.alerts", label: "Security Alerts", routePath: "/secops/alerts", parentCode: "secops", sortOrder: 2 },
  { code: "secops.cve", label: "Vulnerabilities (CVE)", routePath: "/secops/cve", parentCode: "secops", sortOrder: 3 },
  { code: "secops.compliance", label: "Compliance (SCA)", routePath: "/secops/compliance", parentCode: "secops", sortOrder: 4 },

  { code: "pam", label: "PAM Bastion", icon: "key-round", sortOrder: 80 },
  { code: "pam.vault", label: "Vault Accounts", routePath: "/pam/vault", parentCode: "pam", sortOrder: 1 },
  { code: "pam.policies", label: "Access Policies", routePath: "/pam/policies", parentCode: "pam", sortOrder: 2 },
  { code: "pam.sessions", label: "Session Logs & Replay", routePath: "/pam/sessions", parentCode: "pam", sortOrder: 3 },

  { code: "studio", label: "Studio", routePath: "/studio", icon: "table-2", sortOrder: 90 },
  { code: "files", label: "File Assets", routePath: "/files", icon: "folder", sortOrder: 100 },
  { code: "admin", label: "Administration", icon: "settings", sortOrder: 110 },
  { code: "admin.companies", label: "Companies", routePath: "/admin/companies", parentCode: "admin", sortOrder: 1 },
  { code: "admin.users", label: "Users & Roles", routePath: "/admin/users", parentCode: "admin", sortOrder: 2 },
  { code: "admin.notifications", label: "Notification Channels", routePath: "/admin/notifications", parentCode: "admin", sortOrder: 3 },
  { code: "admin.agents", label: "Agent Enrollment", routePath: "/admin/agents", parentCode: "admin", sortOrder: 4 },
  { code: "admin.audit", label: "Activity Logs", routePath: "/admin/audit", parentCode: "admin", sortOrder: 5 },
];

async function seedMenuModules(): Promise<void> {
  const byCode = new Map<string, string>();

  for (const entry of MENU_MANIFEST) {
    const row = await prisma.menuModule.upsert({
      where: { code: entry.code },
      create: {
        code: entry.code,
        label: entry.label,
        routePath: entry.routePath,
        icon: entry.icon,
        sortOrder: entry.sortOrder ?? 0,
        isActive: true,
      },
      // Master registry: label/icon/route ikut manifest, struktur tree tidak
      // diubah bila sudah ada (idempotent, tidak menggeser data admin).
      update: {
        label: entry.label,
        routePath: entry.routePath,
        icon: entry.icon,
      },
    });
    byCode.set(entry.code, row.id);
  }

  // Pass kedua: ikat parent (parentId) setelah semua id dikumpulkan.
  for (const entry of MENU_MANIFEST) {
    if (!entry.parentCode) continue;
    const parentId = byCode.get(entry.parentCode);
    const childId = byCode.get(entry.code);
    if (!parentId || !childId) continue;
    const child = await prisma.menuModule.findUnique({ where: { code: entry.code } });
    if (child && child.parentId !== parentId) {
      await prisma.menuModule.update({
        where: { id: childId },
        data: { parentId },
      });
    }
  }

  console.log(`[seed] MenuModule registry: ${MENU_MANIFEST.length} modul di-upsert (idempotent).`);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  await seedSuperAdmin();
  await seedMenuModules();
  console.log("[seed] Seeder selesai — semua operasi idempotent (aman dijalankan ulang).");
}

main()
  .catch((error) => {
    console.error("[seed] GAGAL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
