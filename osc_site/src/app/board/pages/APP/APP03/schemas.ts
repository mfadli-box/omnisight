import { z } from "zod";

export const PRIVILEGE_LEVELS = ["HIDE", "VIEW", "BOOK", "POST"] as const;

export const userSchema = z.object({
  username: z.string().min(1, "Username is required"),
  email: z.string().min(1, "Email is required").email("Invalid email"),
  password: z.string().optional(),
  fullname: z.string().min(1, "Full name is required"),
  phone: z.string().optional(),
  company_id: z.string().min(1, "Company is required"),
  employee_id: z.string().optional(),
  location_id: z.string().optional(),
  department_id: z.string().optional(),
  division_id: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  job: z.string().optional(),
  key: z.string().optional(),
  is_admin: z.boolean(),
  is_hris: z.boolean(),
  is_active: z.boolean(),
});
export type UserFormValues = z.infer<typeof userSchema>;

export const userCompanySchema = z.object({
  company_id: z.string().min(1, "Company is required"),
  is_active: z.boolean(),
});
export type UserCompanyValues = z.infer<typeof userCompanySchema>;

export const userPrivilegeSchema = z.object({
  module_id: z.string().min(1, "Module is required"),
  level: z.enum(PRIVILEGE_LEVELS),
});
export type UserPrivilegeValues = z.infer<typeof userPrivilegeSchema>;

export const userAreaSchema = z.object({
  company_id: z.string().min(1, "Company is required"),
  company_area_id: z.string().min(1, "Area is required"),
  is_active: z.boolean(),
});
export type UserAreaValues = z.infer<typeof userAreaSchema>;