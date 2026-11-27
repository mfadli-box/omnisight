import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loginSchema, verifySchema } from "@/validations/auth.schema";

export const dynamic = "force-dynamic";
type Params = { params: { action: string[] } };
const challengeCookie = "omnisight_mfa";
const path = "/api/proxy/auth";
const companies = z.object({ data: z.array(z.object({
  company_id: z.string().uuid(), company_name: z.string().trim().min(1),
  is_active: z.boolean().optional(),
})) });
const outcome = z.object({ data: z.discriminatedUnion("mfa_required", [
  z.object({ mfa_required: z.literal(true), mfa_challenge_token: z.string().uuid(), warning_flag: z.boolean() }),
  z.object({ mfa_required: z.literal(false), access_token: z.string().min(1), warning_flag: z.boolean() }),
]) });

function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function upstream(endpoint: string, body?: unknown) {
  return fetch(new URL(endpoint, process.env.INTERNAL_API_URL), {
    method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function GET(_req: NextRequest, { params }: Params) {
  if (params.action.join("/") !== "companies") return reply({}, 404);
  try {
    const response = await upstream("/baas/v1/public/companies");
    if (!response.ok) return reply({}, 503);
    const { data } = companies.parse(await response.json());
    return reply(data.filter(c => c.is_active !== false).map(c => ({ id: c.company_id, label: c.company_name })));
  } catch { return reply({}, 503); }
}

export async function POST(req: NextRequest, { params }: Params) {
  const action = params.action.join("/");
  if (action !== "login" && action !== "mfa/verify") return reply({}, 404);
  const origin = process.env.APP_ORIGIN || req.nextUrl.origin;
  if (req.headers.get("origin") !== origin) return reply({}, 403);
  if (!req.headers.get("content-type")?.startsWith("application/json")) return reply({}, 415);
  const input = await req.json().catch(() => null);
  const parsed = (action === "login" ? loginSchema : verifySchema).safeParse(input);
  if (!parsed.success) return reply({}, 400);
  let body: unknown = parsed.data;
  if ("attempt_id" in parsed.data) {
    const [attempt, challenge] = (req.cookies.get(challengeCookie)?.value ?? "").split(".");
    if (attempt !== parsed.data.attempt_id) return reply({}, 401);
    const token = z.string().uuid().safeParse(challenge);
    if (!token.success) return reply({}, 401);
    body = { otp: parsed.data.otp, mfa_challenge_token: token.data };
  }
  try {
    const response = await upstream("/api/v1/auth/" + action, body);
    if (!response.ok) return reply({}, response.status >= 500 ? 503 : response.status);
    const { data } = outcome.parse(await response.json());
    if (action === "mfa/verify" && data.mfa_required) return reply({}, 502);
    const attempt = data.mfa_required ? crypto.randomUUID() : undefined;
    const result = reply({ attempt_id: attempt, mfa_required: data.mfa_required, warning_flag: data.warning_flag });
    const options = { httpOnly: true, sameSite: "strict" as const, secure: origin.startsWith("https://") };
    if (data.mfa_required) {
      result.cookies.set(challengeCookie, attempt + "." + data.mfa_challenge_token, { ...options, path, maxAge: 300 });
    } else {
      result.cookies.set(challengeCookie, "", { ...options, path, maxAge: 0 });
      result.cookies.set("omnisight_session", data.access_token, { ...options, path: "/", maxAge: 3600 });
    }
    return result;
  } catch { return reply({}, 503); }
}
