"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiData, jsonRequest, message, type DataRow } from "@/lib/workspace/api";
import { Feedback, ResourcePanel, selectClass, type Field } from "./resource-panel";

const userFields: Field[] = [
  { key: "username", label: "Username", createOnly: true, max: 128 },
  { key: "full_name", label: "Nama lengkap", max: 200 },
  { key: "email", label: "Email", type: "email", optional: true, max: 320 },
  { key: "password", label: "Password awal", type: "password", createOnly: true, min: 12, max: 1024 },
  { key: "role_id", label: "UUID role", createOnly: true },
  { key: "area_id", label: "UUID area (opsional)", createOnly: true, optional: true },
];

export function UsersPanel() {
  return <ResourcePanel title="Akun pengguna" path="users" columns={userFields.slice(0, 3)} fields={userFields}
    archiveLabel="Cabut akses" rowAction={(row) => <ResetMfa row={row} />} />;
}

function ResetMfa({ row }: { row: DataRow }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reset() {
    setBusy(true);
    setError("");
    try {
      await apiData(`users/${row.id}/mfa/reset`, { method: "POST" });
      setNotice("MFA pengguna telah direset.");
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open={open} onOpenChange={(next) => {
    if (busy) return;
    setOpen(next);
    setError("");
    setNotice("");
  }}>
    <DialogTrigger asChild><Button size="sm" variant="outline">Reset MFA</Button></DialogTrigger>
    <DialogContent className="space-y-4">
      <DialogTitle className="font-semibold">Reset MFA pengguna</DialogTitle>
      <DialogDescription className="text-sm text-slate-600">Reset faktor autentikasi dan akhiri sesi aktif untuk {String(row.username)}.</DialogDescription>
      <Feedback error={error} notice={notice} />
      {!notice && <Button variant="danger" disabled={busy} onClick={() => void reset()}>{busy ? "Memproses…" : "Konfirmasi reset"}</Button>}
    </DialogContent>
  </Dialog>;
}

const flags = [
  ["can_view", "Lihat"], ["can_create", "Buat"], ["can_update", "Ubah"], ["can_delete", "Hapus"],
] as const;
type Flag = (typeof flags)[number][0];
type Grant = { role_id: string } & Record<Flag, boolean>;
type Menu = { module_code: string; title: string; is_enabled: boolean; role_grants: Grant[] } & Record<Flag, boolean>;
const roleFields: Field[] = [{ key: "role_code", label: "Kode role", max: 48 }, { key: "role_name", label: "Nama role", max: 120 }];

export function PrivilegesPanel() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [moduleCode, setModuleCode] = useState("");
  const [roleId, setRoleId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiData<Menu[]>("company-menus", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setMenus(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(message(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  const menu = menus.find((item) => item.module_code === moduleCode);
  const grant = menu?.role_grants.find((item) => item.role_id === roleId);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(flags.map(([name]) => [name, form.has(name)]));
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const updated = await apiData<Grant>(`company-menus/${encodeURIComponent(roleId.trim())}/${moduleCode}`, jsonRequest("PUT", payload));
      setMenus((items) => items.map((item) => item.module_code === moduleCode
        ? { ...item, role_grants: [...item.role_grants.filter((old) => old.role_id !== updated.role_id), updated] } : item));
      setNotice("Privilege disimpan.");
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4">
    <ResourcePanel title="Role" path="roles" columns={[...roleFields, { key: "id", label: "UUID role" }]} fields={roleFields} createOnly
      rowAction={(role) => <Button variant="outline" size="sm" disabled={busy} onClick={() => {
        setRoleId(role.id); setError(""); setNotice("");
      }}>Pilih role</Button>} />
    <Card>
      <CardHeader><CardTitle>Privilege menu per role</CardTitle><CardDescription>Perubahan memerlukan MFA terbaru dan mengikuti entitlement company.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {loading && <p role="status">Memuat daftar menu…</p>}
        {loadError && <><Feedback error={loadError} /><Button variant="outline" onClick={() => {
          setLoadError(""); setLoading(true); setRevision((count) => count + 1);
        }}>Coba lagi</Button></>}
        {!loading && !loadError && menus.length === 0 && <p>Belum ada menu dalam konteks ini.</p>}
        {!loading && !loadError && menus.length > 0 && <>
          <label className="block space-y-1 text-sm">Modul
            <select className={selectClass} value={moduleCode} disabled={busy} onChange={(event) => {
              setModuleCode(event.target.value); setError(""); setNotice("");
            }}>
              <option value="">Pilih modul</option>
              {menus.map((item) => <option key={item.module_code} value={item.module_code}>{item.module_code} · {item.title}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm">UUID role
            <Input value={roleId} maxLength={36} disabled={busy} onChange={(event) => {
              setRoleId(event.target.value.trim().toLowerCase()); setError(""); setNotice("");
            }} />
          </label>
          {menu && !menu.is_enabled && <p className="text-sm">Modul dinonaktifkan untuk company ini.</p>}
          {menu?.is_enabled && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(roleId) &&
            <form onSubmit={save} key={`${moduleCode}:${roleId}`} className="space-y-3">
              <fieldset className="flex flex-wrap gap-4" disabled={busy}>
                <legend className="mb-2 text-sm font-semibold">Hak akses</legend>
                {flags.map(([name, label]) => <label key={name} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={name} defaultChecked={grant?.[name] && menu[name]} disabled={!menu[name]} />{label}
                </label>)}
              </fieldset>
              <Button disabled={busy}>Simpan privilege</Button>
            </form>}
        </>}
        <Feedback error={error} notice={notice} />
      </CardContent>
    </Card>
    <ResourcePanel title="Log audit" path="audit-logs" readOnly columns={[
      { key: "occurred_at", label: "Waktu (UTC)" }, { key: "action", label: "Aksi" },
      { key: "outcome", label: "Hasil" }, { key: "target_id", label: "ID target" },
    ]} />
  </div>;
}

type Connector = { auth_provider: "LOCAL" | "HRIS_ASMX"; configured: boolean; hris_cache_ttl_hours: number };

export function ConnectorPanel({ companyId }: { companyId: string }) {
  const [connector, setConnector] = useState<Connector | null>(null);
  const [provider, setProvider] = useState<Connector["auth_provider"]>("LOCAL");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const path = `companies/${companyId}/connector`;

  useEffect(() => {
    const controller = new AbortController();
    apiData<Connector>(path, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setConnector(data);
        setProvider(data.auth_provider);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(message(error));
      });
    return () => controller.abort();
  }, [path, revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiData<Connector>(path, jsonRequest("PATCH", {
        auth_provider: provider,
        hris_cache_ttl_hours: Number(form.get("ttl")),
        ...(provider === "HRIS_ASMX" && { hris_login_url: String(form.get("url")).trim() }),
      }));
      setConnector(result);
      setProvider(result.auth_provider);
      element.reset();
      setNotice("Konfigurasi konektor disimpan.");
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return <Card className="max-w-2xl">
    <CardHeader><CardTitle>Provider autentikasi</CardTitle><CardDescription>Backend memeriksa allowlist host dan MFA terbaru sebelum menyimpan perubahan.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {loadError && <><Feedback error={loadError} /><Button variant="outline" onClick={() => { setLoadError(""); setRevision((count) => count + 1); }}>Coba lagi</Button></>}
      {!connector && !loadError && <p role="status">Memuat konfigurasi…</p>}
      {connector && <form onSubmit={save} key={revision} className="space-y-4">
        <p className="text-sm">Provider aktif {connector.auth_provider}{connector.configured ? " · Endpoint HRIS terkonfigurasi" : ""}</p>
        <label className="block space-y-1 text-sm">Provider
          <select className={selectClass} value={provider} disabled={busy} onChange={(event) => setProvider(event.target.value as Connector["auth_provider"])}>
            <option value="LOCAL">Local Account</option><option value="HRIS_ASMX">HRIS ASMX</option>
          </select>
        </label>
        {provider === "HRIS_ASMX" && <label className="block space-y-1 text-sm">Template URL login HRIS
          <Input name="url" required maxLength={2048} disabled={busy} autoComplete="off" />
        </label>}
        <label className="block space-y-1 text-sm">TTL cache HRIS (jam)
          <Input name="ttl" type="number" min={1} max={8760} defaultValue={connector.hris_cache_ttl_hours} disabled={busy} required />
        </label>
        <Feedback error={error} notice={notice} />
        <Button disabled={busy}>{busy ? "Menyimpan…" : "Simpan konfigurasi"}</Button>
      </form>}
    </CardContent>
  </Card>;
}
