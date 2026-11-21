"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiData, jsonRequest, message } from "@/services/api";
import { grantSchema, menuSchema, permissionSchema } from "@/validations/resource.schema";
import { idSchema, moduleCodeSchema } from "@/validations/tenant.schema";
import { Feedback, FormField } from "../shared/form-feedback";
import { ResourcePanel, type Field } from "../shared/resource-panel";

const flags = [
  ["can_view", "Lihat"], ["can_create", "Buat"], ["can_update", "Ubah"], ["can_delete", "Hapus"],
] as const;
type Grant = z.infer<typeof grantSchema>;
type Menu = z.infer<typeof menuSchema>;
const menusSchema = z.array(menuSchema);
const roleFields: Field[] = [{ key: "role_code", label: "Kode role", max: 48 }, { key: "role_name", label: "Nama role", max: 120 }];
const permissionFormSchema = permissionSchema.extend({ role_id: idSchema, module_code: moduleCodeSchema });

export function MenuPrivileges() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [moduleCode, setModuleCode] = useState("");
  const [roleId, setRoleId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const menu = menus.find((item) => item.module_code === moduleCode);
  const validRole = idSchema.safeParse(roleId);

  useEffect(() => {
    const controller = new AbortController();
    apiData("company-menus", menusSchema, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setMenus(data); })
      .catch((failure) => { if (!controller.signal.aborted) setLoadError(message(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  function updateGrant(code: string, updated: Grant) {
    setMenus((items) => items.map((item) => item.module_code === code
      ? { ...item, role_grants: [...item.role_grants.filter((old) => old.role_id !== updated.role_id), updated] } : item));
  }

  return <div className="space-y-4">
    <ResourcePanel title="Role" path="roles" columns={[...roleFields, { key: "id", label: "UUID role" }]} fields={roleFields} createOnly
      rowAction={(role) => <Button variant="outline" size="sm" onClick={() => setRoleId(String(role.id))}>Pilih role</Button>} />
    <Card>
      <CardHeader><CardTitle>Privilege menu per role</CardTitle><CardDescription>Perubahan memerlukan MFA terbaru dan mengikuti entitlement company.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {loading && <p role="status">Memuat daftar menu…</p>}
        {loadError && <><Feedback error={loadError} /><Button variant="outline" onClick={() => {
          setLoadError(""); setLoading(true); setRevision((count) => count + 1);
        }}>Coba lagi</Button></>}
        {!loading && !loadError && menus.length === 0 && <p className="text-sm text-muted">Belum ada menu dalam konteks ini.</p>}
        {!loading && !loadError && menus.length > 0 && <>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Modul</p>
            <Select label="Modul" value={moduleCode} onChange={setModuleCode} options={[
              { value: "", label: "Pilih modul", disabled: true },
              ...menus.map((item) => ({ value: item.module_code, label: `${item.module_code} · ${item.title}` })),
            ]} />
          </div>
          <FormField label="UUID role" error={roleId && !validRole.success ? "Masukkan UUID role yang valid." : undefined}>
            <Input value={roleId} maxLength={36} aria-invalid={!!roleId && !validRole.success} onChange={(event) => setRoleId(event.target.value.trim().toLowerCase())} />
          </FormField>
          {menu && !menu.is_enabled && <p className="text-sm">Modul dinonaktifkan untuk company ini.</p>}
          {menu?.is_enabled && validRole.success && <GrantForm key={`${moduleCode}:${roleId}`} roleId={validRole.data} menu={menu} onSave={updateGrant} />}
        </>}
      </CardContent>
    </Card>
    <ResourcePanel title="Log audit" path="audit-logs" readOnly columns={[
      { key: "occurred_at", label: "Waktu (UTC)" }, { key: "action", label: "Aksi" },
      { key: "outcome", label: "Hasil" }, { key: "target_id", label: "ID target" },
    ]} />
  </div>;
}

function GrantForm({ roleId, menu, onSave }: { roleId: string; menu: Menu; onSave: (code: string, grant: Grant) => void }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const grant = menu.role_grants.find((item) => item.role_id === roleId);
  const form = useForm<z.infer<typeof permissionFormSchema>>({
    resolver: zodResolver(permissionFormSchema),
    defaultValues: {
      role_id: roleId, module_code: menu.module_code,
      can_view: !!grant?.can_view && menu.can_view, can_create: !!grant?.can_create && menu.can_create,
      can_update: !!grant?.can_update && menu.can_update, can_delete: !!grant?.can_delete && menu.can_delete,
    },
  });
  const busy = form.formState.isSubmitting;
  const save = form.handleSubmit(async ({ role_id, module_code, ...flags }) => {
    setError(""); setNotice("");
    try {
      const updated = await apiData(`company-menus/${encodeURIComponent(role_id)}/${module_code}`, grantSchema, jsonRequest("PUT", flags));
      onSave(module_code, updated);
      setNotice("Privilege disimpan.");
    } catch (failure) { setError(message(failure)); }
  });

  return <form onSubmit={save} className="space-y-3">
    <fieldset className="flex flex-wrap gap-4" disabled={busy}>
      <legend className="mb-2 text-sm font-semibold">Hak akses</legend>
      {flags.map(([name, label]) => <label key={name} className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-primary" {...form.register(name)} disabled={!menu[name]} />{label}
      </label>)}
    </fieldset>
    <Feedback error={error} notice={notice} />
    <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan privilege"}</Button>
  </form>;
}
