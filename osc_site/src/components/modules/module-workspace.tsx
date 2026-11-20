"use client";

import { useState } from "react";
import { useNavigation } from "@/components/workspace/navigation-context";
import { Card, CardContent } from "@/components/ui/card";
import { ResourcePanel, selectClass, type Field } from "./resource-panel";
import { AgentStatus, PamSession, ReportPanel, SopAttachment } from "./operations";
import { ConnectorPanel, PrivilegesPanel, UsersPanel } from "./administration";

const modules = {
  CT01: "Control Tower",
  OP01: "PAM Bastion",
  OP02: "Monitoring Agent",
  KB01: "SOP & Dokumen",
  RP01: "Ekspor Excel",
  RP02: "Laporan PDF",
  SA01: "Company, Area & Store",
  SA02: "Pengguna & Akses",
  SA03: "Privilege Menu",
  SA04: "Konektor Eksternal",
} as const;
type ModuleCode = keyof typeof modules;

export default function ModuleWorkspace({ moduleCode }: { moduleCode: string }) {
  const { items, loading, context } = useNavigation();
  if (!Object.hasOwn(modules, moduleCode)) return <h1 className="text-xl font-bold">Modul tidak ditemukan.</h1>;
  if (loading) return <p role="status">Memuat akses modul…</p>;
  if (!items.some((item) => item.module_code === moduleCode)) {
    return <p role="alert">Akun aktif tidak memiliki akses ke {moduleCode}.</p>;
  }
  const code = moduleCode as ModuleCode;
  return <div className="space-y-6">
    <h1 className="font-display text-2xl font-bold sm:text-3xl">{modules[code]}</h1>
    <ModuleContent key={`${code}:${context.company_id}:${context.area_id}`} code={code} companyId={context.company_id} />
  </div>;
}

function ModuleContent({ code, companyId }: { code: ModuleCode; companyId?: string }) {
  switch (code) {
    case "CT01": return <AgentStatus path="nodes" title="Kesehatan node" />;
    case "OP02": return <AgentStatus path="agents/status" title="Heartbeat agent" />;
    case "OP01": return <ResourcePanel title="Target bastion" path="pam/targets" columns={targetColumns} fields={targetFields}
      archiveLabel="Nonaktifkan" rowAction={(row) => <PamSession targetId={row.id} />} />;
    case "KB01": return <ResourcePanel title="Dokumen SOP" path="sop-documents" columns={documentColumns} fields={documentFields}
      archiveLabel="Arsipkan" rowAction={(row) => <SopAttachment documentId={row.id} />} />;
    case "RP01": return <ReportPanel format="xlsx" />;
    case "RP02": return <ReportPanel format="pdf" />;
    case "SA01": return <OrganizationPanel />;
    case "SA02": return <UsersPanel />;
    case "SA03": return <PrivilegesPanel />;
    case "SA04": return companyId ? <ConnectorPanel companyId={companyId} /> : <p>Company aktif belum tersedia.</p>;
  }
}

const targetColumns: Field[] = [
  { key: "display_name", label: "Nama target" }, { key: "target_code", label: "Kode" },
  { key: "hostname", label: "Host" }, { key: "port", label: "Port", type: "number", min: 1, max: 65535 },
  { key: "protocol", label: "Protokol", choices: ["SSH", "RDP", "HTTPS"] },
];

const targetFields: Field[] = [
  ...targetColumns,
  { key: "area_id", label: "UUID area (opsional)", createOnly: true, optional: true },
];

const documentFields: Field[] = [
  { key: "document_code", label: "Kode dokumen" }, { key: "title", label: "Judul" },
  { key: "markdown_content", label: "Isi Markdown", type: "textarea", optional: true },
  { key: "area_id", label: "UUID area (opsional)", createOnly: true, optional: true },
];
const documentColumns = [...documentFields.slice(0, 2), { key: "approval_status", label: "Status" }];

const organization = {
  companies: "Company",
  areas: "Area",
  stores: "Store",
};
const organizationFields: Field[] = [{ key: "code", label: "Kode" }, { key: "name", label: "Nama" }];
const storeFields: Field[] = [
  ...organizationFields,
  { key: "network_ip_cidr", label: "CIDR jaringan" },
  { key: "area_id", label: "UUID area (opsional jika area aktif sudah dipilih)", createOnly: true, optional: true },
];

function OrganizationPanel() {
  const [resource, setResource] = useState<keyof typeof organization>("companies");
  return <>
    <Card><CardContent className="p-4">
      <label className="block max-w-xs space-y-1 text-sm font-medium">Direktori
        <select value={resource} className={selectClass} onChange={(event) => setResource(event.target.value as keyof typeof organization)}>
          {Object.entries(organization).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
    </CardContent></Card>
    <ResourcePanel key={resource} path={resource} title={organization[resource]} columns={resource === "areas" ? [...organizationFields, { key: "id", label: "UUID area" }] : organizationFields}
      fields={resource === "stores" ? storeFields : organizationFields} archiveLabel="Nonaktifkan" />
  </>;
}
