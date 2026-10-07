import { z } from "zod";

export const companySchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  valuta: z.string().min(1, "Valuta is required"),
  vat_id: z.string().optional(),
  reg_no: z.string().optional(),
  address: z.string().optional(),
  tax_office: z.string().optional(),
  hris_link: z.string().optional(),
  is_active: z.boolean(),
});

export type CompanyFormValues = z.infer<typeof companySchema>;

export const companyModuleSchema = z.object({
  module_id: z.string().min(1, "Module is required"),
  is_active: z.boolean(),
});
export type CompanyModuleValues = z.infer<typeof companyModuleSchema>;

export const companyAreaSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  is_active: z.boolean(),
});
export type CompanyAreaValues = z.infer<typeof companyAreaSchema>;
