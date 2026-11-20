import type { Metadata } from "next";
import ModuleWorkspace from "@/components/modules/module-workspace";

const titles: Record<string, string> = {
  CT01: "Executive & SRE Control Tower", OP01: "PAM Bastion", OP02: "Monitoring & Agent Jobs",
  KB01: "SOP Knowledge Base", RP01: "Database Excel Exporter", RP02: "PDF Report Generator",
  SA01: "Company & Area", SA02: "User & Access", SA03: "Menu Privilege", SA04: "External Connectors",
};
type Props = { params: Promise<{ module_code: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module_code } = await params;
  return { title: titles[module_code] || "Module" };
}
export default async function ModulePage({ params }: Props) {
  const { module_code } = await params;
  return <ModuleWorkspace moduleCode={module_code.toUpperCase()} />;
}
