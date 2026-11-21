import "server-only";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "omnisight_session";
const MFA_COOKIE = "omnisight_mfa_pending";

type JsonRecord = Record<string, unknown>;

export function sessionCookieName() { return SESSION_COOKIE; }
export function mfaCookieName() { return MFA_COOKIE; }

export function setSessionCookie(response: NextResponse, token: string, maxAge = 900) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: Math.max(1, Math.min(900, Math.floor(maxAge))),
  });
  response.cookies.set(MFA_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
}

export function setMfaCookie(response: NextResponse, token: string) {
  response.cookies.set(MFA_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 300,
  });
}

export function clearAuthCookies(response: NextResponse) {
  for (const name of [SESSION_COOKIE, MFA_COOKIE]) {
    response.cookies.set(name, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  }
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN;
  if (!origin) return false;
  try {
    const received = new URL(origin);
    if (origin !== received.origin) return false;
    const target = new URL(expected || request.nextUrl.origin);
    const localHttp = received.protocol === "http:" && ["localhost", "127.0.0.1"].includes(received.hostname);
    return received.origin === target.origin && (received.protocol === "https:" || localHttp);
  } catch {
    return false;
  }
}

export async function backendRequest(path: string, init: RequestInit = {}) {
  const base = process.env.INTERNAL_API_URL || process.env.BACKEND_URL;
  if (!base) throw new Error("BACKEND_UNAVAILABLE");
  const url = new URL(`/baas/v1/${path.replace(/^\/+/, "")}`, base).toString();
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: new Headers(init.headers),
  });
}

export async function backendError(response: Response) {
  const payload = await readJson(response);
  const error = (payload.error as JsonRecord | undefined) || {};
  const code = typeof error.code === "string" ? error.code : "BACKEND_ERROR";
  const messages: Record<string, string> = {
    INVALID_REQUEST: "Periksa kembali data yang dikirim.",
    INVALID_INPUT: "Periksa kembali data yang dikirim.",
    NOT_FOUND: "Data tidak ditemukan dalam konteks aktif.",
    CONFLICT: "Data sudah ada atau perubahan bertentangan dengan data aktif.",
    FORBIDDEN: "Aksi tidak diizinkan untuk akun ini.",
    INVALID_CREDENTIALS: "Username atau password tidak sesuai.",
    INVALID_OTP: "Kode OTP tidak valid. Periksa kode terbaru dari aplikasi authenticator.",
    INVALID_CHALLENGE: "Tantangan sudah kedaluwarsa. Mulai kembali dari login.",
    MFA_RATE_LIMITED: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.",
    COMPANY_UNAVAILABLE: "Company yang dipilih tidak tersedia.",
    UNSUPPORTED_FILE_TYPE: "Format atau isi lampiran tidak didukung.",
    NO_ACTIVE_ACCESS: "Akun tidak memiliki akses aktif ke konteks tersebut.",
    PERMISSION_DENIED: "Aksi tidak diizinkan untuk akun ini.",
    MFA_STEP_UP_REQUIRED: "Verifikasi MFA tambahan diperlukan. Untuk perubahan administrasi, masuk kembali dengan OTP.",
    MFA_REQUIRED_FOR_PAM: "Aktifkan MFA sebelum meminta akses bastion.",
  };
  return { status: response.status, code, message: (Object.hasOwn(messages, code) && messages[code]) || "Layanan belum dapat memproses permintaan." };
}

export async function readJson(response: Response): Promise<JsonRecord> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as JsonRecord : {};
  } catch {
    return {};
  }
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export function tokenHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}

export function tooLarge(request: NextRequest, maxBytes = 16_384) {
  const value = Number(request.headers.get("content-length") || 0);
  return value > maxBytes;
}

export async function readBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

export async function readAuthInput(request: NextRequest) {
  const body = tooLarge(request) ? undefined : await readBody(request, 16_384);
  if (!body) return null;
  const input: unknown = JSON.parse(new TextDecoder().decode(body));
  return input && typeof input === "object" && !Array.isArray(input) ? input as JsonRecord : null;
}
