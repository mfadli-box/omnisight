import { z } from "zod";
import { loginUserSchema } from "@/validations/auth.schema";
import { companyContextSchema, companySchema, navigationSchema, switchContextSchema } from "@/validations/tenant.schema";

const errorSchema = z.object({ error: z.object({ message: z.string(), code: z.string() }) });
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: "no-store", credentials: "same-origin" });
  if (!response.ok) {
    const parsed = errorSchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      parsed.data?.error.message || "Permintaan tidak dapat diproses.",
      response.status, parsed.data?.error.code,
    );
  }
  return response;
}

async function parse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const result = schema.safeParse(await response.json().catch(() => null));
  if (!result.success) throw new ApiError("Format respons layanan tidak valid.", 502);
  return result.data;
}

export function apiResponse(path: string, init?: RequestInit) {
  return request(`/api/proxy/${path}`, init);
}

export async function apiData<T>(path: string, schema: z.ZodType<T>, init?: RequestInit) {
  const response = await apiResponse(path, init);
  return (await parse(response, z.object({ data: schema }))).data;
}

export function jsonRequest(method: string, body: object): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

async function auth<T>(path: string, schema: z.ZodType<T>, payload: object) {
  return (await parse(await request(`/api/auth/${path}`, jsonRequest("POST", payload)), z.object({ data: schema }))).data;
}

export const workspaceApi = {
  companies: (signal: AbortSignal) => apiData("public/companies", z.array(companySchema), { signal }),
  contexts: (signal?: AbortSignal) => apiData("me/contexts", z.array(companyContextSchema), { signal }),
  async navigation(signal?: AbortSignal) {
    return parse(await request("/api/me/navigation", { signal }), navigationSchema);
  },
  login: (input: object) => auth("login", z.object({ mfa_required: z.boolean(), user: loginUserSchema }), input),
  verify: (input: object) => auth("mfa-verify", z.object({ authenticated: z.literal(true) }), input),
  switchContext: (input: z.infer<typeof switchContextSchema>) => auth("switch-company", switchContextSchema, input),
  resetRequest: (input: object) => auth("reset-request", z.object({ accepted: z.literal(true) }), input),
  resetConfirm: (input: object) => auth("reset-confirm", z.object({ reset: z.literal(true) }), input),
  logout: () => request("/api/auth/logout", { method: "POST" }),
};

export function message(error: unknown) {
  return error instanceof Error ? error.message : "Layanan sedang tidak tersedia.";
}

export async function download(response: Response, filename: string) {
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
