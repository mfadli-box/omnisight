import { z } from "zod";
import { apiData, apiResponse, jsonRequest } from "./api";
import {
  opsJobSchema, opsOutputSchema, opsResultSchema, stackActionSchema, stackCreateSchema, stackSchema,
  terminalNodeSchema, terminalRequestSchema,
} from "@/validations/ops.schema";

export const opsApi = {
  stacks: (after?: string, signal?: AbortSignal) =>
    apiData(after ? `stacks?after=${encodeURIComponent(after)}` : "stacks", z.array(stackSchema), { signal }),
  stack: (id: string, signal: AbortSignal) => apiData(`stacks/${id}`, stackSchema, { signal }),
  create: (input: z.infer<typeof stackCreateSchema>) =>
    apiData("stacks", stackSchema, jsonRequest("POST", input)),
  action: (id: string, input: z.infer<typeof stackActionSchema>, signal: AbortSignal) =>
    apiData(`stacks/${id}/action`, opsJobSchema, { ...jsonRequest("POST", input), signal }),
  nodes: (after?: string, signal?: AbortSignal) => apiData(
    after ? `pam/terminal/nodes?after=${encodeURIComponent(after)}` : "pam/terminal/nodes",
    z.array(terminalNodeSchema), { signal },
  ),
  terminal: (input: z.infer<typeof terminalRequestSchema>, signal: AbortSignal) =>
    apiData("pam/terminal", opsJobSchema, { ...jsonRequest("POST", input), signal }),
};

export async function streamOps(
  path: string, job: z.infer<typeof opsJobSchema>, signal: AbortSignal, onOutput: (text: string) => void,
) {
  let cursor = 0;
  const deadline = Math.max(Date.now(), Date.parse(job.expires_at)) + 15_000;
  do {
    const headers = cursor ? { "last-event-id": String(cursor) } : undefined;
    const response = await apiResponse(path, { headers, signal });
    const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
    if (!reader) throw new Error("Aliran log tidak tersedia.");
    try {
      let remainder = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const packets = (remainder + value).split("\n\n");
        remainder = packets.pop() ?? "";
        for (const packet of packets) {
          const lines = packet.split("\n");
          const type = field(lines, "event:");
          const data = field(lines, "data:");
          if (type === "closed") throw new Error("Akses log berakhir.");
          if (type === "done") return opsResultSchema.parse(data);
          if (type === "output") {
            const id = Number(field(lines, "id:"));
            if (!Number.isInteger(id) || id < 1 || id > 128) throw new Error("Urutan log tidak valid.");
            if (id <= cursor) continue;
            const result = opsOutputSchema.parse(JSON.parse(data));
            onOutput(result.output);
            cursor = id;
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } while (Date.now() < deadline && !signal.aborted);
  return "expired";
}

function field(lines: string[], name: string) {
  return lines.find((line) => line.startsWith(name))?.slice(name.length).trimStart() ?? "";
}
