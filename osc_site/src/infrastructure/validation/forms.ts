/**
 * Skema validasi Zod untuk form (client + server boundary) — sumber kebenaran
 * tunggal; kontrak mengikuti `w1.openapi.yaml` (LoginRequest, AssetCreate,
 * tickets, prefixes, addresses, collections).
 */

import { z } from 'zod'

export const loginFormSchema = z.object({
  company_id: z.string(), // '' = Local / Global Login
  username: z.string().trim().min(1, 'Wajib diisi').max(100),
  password: z.string().min(1, 'Wajib diisi').max(200),
})
export type LoginFormValues = z.infer<typeof loginFormSchema>

export const otpSchema = z.string().regex(/^\d{6}$/, 'Harus 6 digit')
export const backupCodeSchema = z
  .string()
  .trim()
  .min(4, 'Backup code tidak valid')
  .max(32)

export const mfaResetRequestSchema = z.object({
  username: z.string().trim().min(1).max(100),
  email: z.string().trim().email('Email tidak valid'),
})

export const mfaResetConfirmSchema = z.object({
  username: z.string().trim().min(1).max(100),
  token: z.string().trim().min(1, 'Token wajib diisi').max(200),
})

const uuid = z.string().uuid('UUID tidak valid')
const optionalUuid = z.union([z.string().uuid(), z.literal('')]).optional()

export const assetCreateFormSchema = z.object({
  name: z.string().trim().min(1, 'Wajib diisi').max(150),
  asset_tag: z.string().trim().min(1, 'Wajib diisi').max(100),
  node_type: z.enum(['HOST', 'NETWORK', 'VIRTUAL', 'CONTAINER', 'RACK_MOUNTED', 'SERVICE']),
  status: z.enum(['ACTIVE', 'PLANNED', 'STAGED', 'OFFLINE', 'FAILED', 'DECOMMISSIONED']),
  hostname: z.string().trim().max(255).optional(),
  mgmt_ip: z
    .string()
    .trim()
    .max(64)
    .refine((v) => v.length === 0 || /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(v), 'IP tidak valid')
    .optional(),
  serial_number: z.string().trim().max(255).optional(),
  asset_model_id: optionalUuid,
  status_label_id: optionalUuid,
  purchase_cost: z.number().min(0).max(1e13).optional(),
  notes: z.string().max(2000).optional(),
})
export type AssetCreateFormValues = z.infer<typeof assetCreateFormSchema>

export const checkoutFormSchema = z.object({
  target_user_id: optionalUuid,
  expected_checkin_at: z.string().max(40).optional(),
})
export type CheckoutFormValues = z.infer<typeof checkoutFormSchema>

export const ticketCreateFormSchema = z.object({
  title: z.string().trim().min(1, 'Wajib diisi').max(300),
  description: z.string().max(5000).optional(),
  ticket_type: z.enum(['INCIDENT', 'REQUEST']),
  priority: z.enum(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
  assignee_user_id: optionalUuid,
  due_at: z.string().max(40).optional(),
})
export type TicketCreateFormValues = z.infer<typeof ticketCreateFormSchema>

export const prefixFormSchema = z.object({
  prefix: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, 'Format CIDR IPv4: 10.10.0.0/24'),
  status: z.enum(['ACTIVE', 'RESERVED', 'CONTAINER', 'DEPRECATED']),
  is_pool: z.boolean(),
})
export type PrefixFormValues = z.infer<typeof prefixFormSchema>

export const addressFormSchema = z.object({
  address: z.string().trim().min(1, 'Wajib diisi').max(64),
  status: z.enum(['ACTIVE', 'RESERVED', 'DEPRECATED', 'DHCP', 'SLAAC']),
  dns_name: z.string().trim().max(255).optional(),
})
export type AddressFormValues = z.infer<typeof addressFormSchema>

export const collectionFormSchema = z.object({
  collection: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,49}$/, 'Huruf kecil/angka/underscore, awal huruf, maks 50'),
  icon: z.string().trim().max(64).optional(),
  note: z.string().trim().max(500).optional(),
})
export type CollectionFormValues = z.infer<typeof collectionFormSchema>

export const mfaDisableFormSchema = z.object({
  password: z.string().min(1, 'Wajib diisi').max(200),
  otp: otpSchema,
})
export type MfaDisableFormValues = z.infer<typeof mfaDisableFormSchema>
