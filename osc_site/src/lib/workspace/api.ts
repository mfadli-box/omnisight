export type Company = { id: string; code: string; name: string };
export type Area = { id: string; name: string };
export type DataRow = { id: string } & Record<string, unknown>;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function apiResponse(path: string, init?: RequestInit) {
  const response = await fetch(`/api/proxy/${path}`, { ...init, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error?.message || "Permintaan tidak dapat diproses.", response.status);
  }
  return response;
}

export async function apiData<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiResponse(path, init);
  const payload = await response.json();
  return payload.data;
}

export function jsonRequest(method: string, body: object): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

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
