import { companySchema, Login, resultSchema } from "@/validations/auth.schema";

export async function loadCompanies(signal: AbortSignal) {
  const res = await fetch("/api/proxy/auth/companies", { cache: "no-store", signal });
  if (!res.ok) throw new Error("Daftar perusahaan gagal dimuat.");
  return companySchema.array().parse(await res.json());
}
export async function authenticate(input: Login | { otp: string; attempt_id: string }) {
  const verify = "otp" in input;
  const res = await fetch("/api/proxy/auth/" + (verify ? "mfa/verify" : "login"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }).catch(() => { throw new Error("Koneksi terputus. Silakan coba lagi."); });
  if (res.status === 429) throw new Error("Terlalu banyak percobaan. Coba lagi dalam satu menit.");
  if (res.status === 401) throw new Error(verify ? "Kode salah atau sudah kedaluwarsa. Coba lagi atau ulangi login." : "Perusahaan, nama pengguna, atau kata sandi salah.");
  if (!res.ok) throw new Error("Layanan autentikasi sedang bermasalah. Silakan coba lagi.");
  return resultSchema.parse(await res.json());
}
