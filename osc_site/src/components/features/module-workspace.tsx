"use client";

import { useNavigation } from "@/components/layout/navigation-context";
import { useWorkspaceStore } from "@/stores/workspace";
import { ControlTower } from "./ct01/control-tower";
import { SopDocuments } from "./kb01/sop-documents";
import { PamBastion } from "./op01/pam-bastion";
import { AgentMonitoring } from "./op02/agent-monitoring";
import { ExcelExport } from "./rp01/excel-export";
import { PdfReports } from "./rp02/pdf-reports";
import { Organization } from "./sa01/organization";
import { UserAccess } from "./sa02/user-access";
import { MenuPrivileges } from "./sa03/menu-privileges";
import { ExternalConnectors } from "./sa04/external-connectors";

const modules = {
  CT01: ControlTower, OP01: PamBastion, OP02: AgentMonitoring, KB01: SopDocuments,
  RP01: ExcelExport, RP02: PdfReports, SA01: Organization, SA02: UserAccess, SA03: MenuPrivileges,
  SA04: ({ companyId }: { companyId: string | null }) =>
    companyId ? <ExternalConnectors companyId={companyId} /> : <p>Company aktif belum tersedia.</p>,
};

export default function ModuleWorkspace({ moduleCode }: { moduleCode: string }) {
  const { items, loading } = useNavigation();
  const companyId = useWorkspaceStore((state) => state.activeCompany);
  const areaId = useWorkspaceStore((state) => state.activeArea);
  if (!Object.hasOwn(modules, moduleCode)) return <h1 className="text-xl font-semibold">Modul tidak ditemukan.</h1>;
  if (loading) return <p role="status" className="text-sm text-muted">Memuat akses modul…</p>;
  const item = items.find((candidate) => candidate.module_code === moduleCode);
  if (!item) return <p role="alert">Akun aktif tidak memiliki akses ke {moduleCode}.</p>;
  const Component = modules[moduleCode as keyof typeof modules];
  return <div className="space-y-6">
    <h1 className="font-display text-3xl tracking-tight sm:text-4xl">{item.module_name}</h1>
    <Component key={`${moduleCode}:${companyId}:${areaId}`} companyId={companyId} />
  </div>;
}
