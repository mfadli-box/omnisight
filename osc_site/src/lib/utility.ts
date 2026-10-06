import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { NextResponse } from "next/server";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const storageKey = "OmniSightMemory";

type ProfileUser = {
  id: string;
  username: string;
  email: string;
  fullname: string;
  phone?: string;
  role?: string;
  company_id: string;
  company_name?: string;
  is_admin: boolean;
  is_hris: boolean;
  is_active: boolean;
};

export type SessionData = {
  token: string;
  expires_at: string;
  user_profile: ProfileUser;
};

export const parseSession = (value: string | null): SessionData | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as SessionData;
    if (!parsed?.token || !parsed?.expires_at) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const isSessionExpired = (session: SessionData | null) => {
  if (!session?.expires_at) return true;
  return new Date(session.expires_at).getTime() <= Date.now();
};

export const forceLogout = (router?: { replace: (url: string) => void }) => {
  window.localStorage.removeItem(storageKey);
  try {
    document.cookie = `${storageKey}=; path=/; max-age=0`;
  } catch { }
  if (router) {
    router.replace("/login");
  } else {
    window.location.href = "/login";
  }
};

export const persistSession = (session: SessionData) => {
  const sessionStr = JSON.stringify(session);
  window.localStorage.setItem(storageKey, sessionStr);
  document.cookie = `${storageKey}=${encodeURIComponent(sessionStr)}; path=/; max-age=${60 * 60 * 24}`;
};

export const getInitials = (str: string): string => {
  if (typeof str !== "string" || !str.trim()) return "?";
  return (
    str
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?"
  );
};

export function formatCurrency(
  amount: number,
  opts?: {
    currency?: string;
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    noDecimals?: boolean;
  },
) {
  const {
    currency = "USD",
    locale = "en-US",
    minimumFractionDigits,
    maximumFractionDigits,
    noDecimals,
  } = opts ?? {};
  const formatOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    minimumFractionDigits: noDecimals ? 0 : minimumFractionDigits,
    maximumFractionDigits: noDecimals ? 0 : maximumFractionDigits,
  };
  return new Intl.NumberFormat(locale, formatOptions).format(amount);
}

export const formatDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year   = date.getFullYear();
  const month  = String(date.getMonth() + 1).padStart(2, "0");
  const day    = String(date.getDate()).padStart(2, "0");
  const hour   = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

export const streamToResponse = (response: Response) => {
  if (!response.ok) {
    return handleBackendError(response.status);
  }
  if (!response.body) {
    return NextResponse.json({}, { status: response.status });
  }
  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "X-Accel-Buffering": "no",
    },
  });
};

export const getProxyHeaders = (request: Request) => {
  return {
    Authorization: request.headers.get("authorization") || "",
    Cookie: request.headers.get("cookie") || "",
  };
};

export const handleGlobalError = (error: unknown) => {
  console.error("[API Proxy Error] : ", error);
  return NextResponse.json(
    { error: "Failed to contact the internal service system." }, 
    { status: 504 }
  );
};

const handleBackendError = (status: number) => {
  let message = "An error occurred in the service system.";
  switch (status) {
    case 400:
      message = "The data request format is invalid.";
      break;
    case 401:
      message = "Your session has expired. Please log in again.";
      break;
    case 403:
      message = "You do not have permission to perform this action.";
      break;
    case 404:
      message = "Data or service not found.";
      break;
    case 500:
      message = "The backend service is experiencing internal issues.";
      break;
  }
  return NextResponse.json({ error: message }, { status });
};
