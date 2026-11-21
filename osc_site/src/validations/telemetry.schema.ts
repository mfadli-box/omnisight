import { z } from "zod";
import { idSchema } from "./tenant.schema";

const counter = z.number().nonnegative();
const label = z.string().min(1);
const diskSchema = z.strictObject({ mount: label, used_bytes: counter, total_bytes: z.number().positive() })
  .refine((disk) => disk.used_bytes <= disk.total_bytes);
const diskIOSchema = z.strictObject({ device: label, read_bytes: counter, write_bytes: counter });
const networkSchema = z.strictObject({ interface: label, rx_bytes: counter, tx_bytes: counter });
const smartSchema = z.strictObject({ device: label, model: z.string(), passed: z.boolean().nullable() });
const containerSchema = z.strictObject({
  id: label, name: label, cpu_pct: counter, memory: z.string(), network: z.string(), block_io: z.string(),
});

const nodeMetricSchema = z.strictObject({
  node_id: idSchema, company_id: idSchema, area_id: idSchema, store_id: idSchema,
  recorded_at: z.iso.datetime({ offset: true }),
  cpu_pct: z.number().min(0).max(100),
  ram_used_mb: counter, ram_total_mb: z.number().positive(),
  disk_json: z.array(diskSchema).min(1).max(64),
  disk_io_json: z.array(diskIOSchema).max(64),
  net_json: z.array(networkSchema).max(64),
  load_avg: z.tuple([counter, counter, counter]).nullable(),
  temp_c: z.number().min(-273.15).max(250).nullable(),
  smart_json: z.array(smartSchema).max(64),
  containers_json: z.array(containerSchema).max(64),
}).refine((sample) => sample.ram_used_mb <= sample.ram_total_mb);

export const nodeHistorySchema = z.array(nodeMetricSchema).max(200);
export type NodeMetric = z.infer<typeof nodeMetricSchema>;
