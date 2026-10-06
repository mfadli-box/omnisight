import { clientApi } from "@/lib/client-api";

export interface SYS02PasswordChange {
  old_password: string;
  new_password: string;
}

export function changePassword(body: SYS02PasswordChange): Promise<{ message?: string }> {
  return clientApi<{ message?: string }>("/SYS02/password", { method: "PUT", body });
}
