import { getOne } from "@/lib/grid";

export interface SYS01Profile {
  id: string;
  username: string;
  email: string;
  fullname: string;
  phone?: string | null;
  role: string;
  job: string;
  company_id: string;
  company_name: string;
  is_admin: boolean;
  is_hris: boolean;
  is_active: boolean;
  companies: Array<{
    company_id: string;
    code: string;
    name: string;
  }>;
}

export function fetchProfile(): Promise<SYS01Profile> {
  return getOne<SYS01Profile>("/SYS01/profile");
}
