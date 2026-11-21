import { z } from "zod";
import { apiData, jsonRequest } from "./api";
import { containerActionSchema, containerSchema, sbomSchema } from "@/validations/container.schema";
import { opsJobSchema } from "@/validations/ops.schema";

export const containerApi = {
  list: (signal: AbortSignal) => apiData("containers", z.array(containerSchema), { signal }),
  sbom: (signal: AbortSignal) => apiData("security/sbom", z.array(sbomSchema), { signal }),
  action: (id: string, input: z.infer<typeof containerActionSchema>) =>
    apiData(`containers/${id}/action`, opsJobSchema, jsonRequest("POST", containerActionSchema.parse(input))),
};
