import { apiData } from "@/services/api";
import { idSchema } from "@/validations/tenant.schema";
import { nodeHistorySchema } from "@/validations/telemetry.schema";

export function nodeHistory(nodeId: string, signal: AbortSignal) {
  return apiData(`nodes/${idSchema.parse(nodeId)}/metrics`, nodeHistorySchema, { signal });
}
