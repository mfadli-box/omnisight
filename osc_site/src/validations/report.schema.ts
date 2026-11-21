import { z } from "zod";

export const reportTables = {
  osc_agent_node: "Node agent",
  osc_sop_document: "Dokumen SOP",
  osc_pam_session: "Sesi PAM",
  osc_activity_log: "Log aktivitas",
} as const;
export const reportSchema = z.strictObject({
  table_name: z.enum(["osc_agent_node", "osc_sop_document", "osc_pam_session", "osc_activity_log"]),
});
