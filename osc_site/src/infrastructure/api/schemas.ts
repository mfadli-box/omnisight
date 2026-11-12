/**
 * Skema Zod respons upstream (kontrak w1.openapi.yaml) — dipakai gateway
 * infrastructure untuk memvalidasi `data` sebelum masuk domain entities.
 */

import { z } from 'zod'

// ---------- auth ----------
export const companyPublicSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  code: z.string(),
  hris_enabled: z.boolean(),
})

export const userSummarySchema = z.object({
  id: z.string().min(1),
  username: z.string(),
  email: z.string(),
  display_name: z.string().nullable().default(null),
  mfa_enabled: z.boolean(),
  is_super_admin: z.boolean(),
  last_hris_sync_at: z.string().nullable().default(null),
})

export const loginOutcomeSchema = z.union([
  z.object({
    mfa_required: z.literal(false),
    user: userSummarySchema,
    active_company_id: z.string().nullable().default(null),
    offline_cache: z.boolean().default(false),
  }),
  z.object({
    mfa_required: z.literal(true),
  }),
])

export const sessionIssuedSchema = z.object({
  access_token: z.string().optional(), // distrip proxy — boleh absent
  session_id: z.string().optional(),
  active_company_id: z.string().nullable().default(null),
  active_role_id: z.string().nullable().default(null),
  mfa_reset_via_backup: z.boolean().default(false),
})

export const menuNodeSchema: z.ZodType<{
  id: string
  code: string
  label: string
  route_path: string | null
  icon: string | null
  sort_order: number
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  children: import('@/domain/entities/auth').MenuNode[]
}> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    code: z.string(),
    label: z.string(),
    route_path: z.string().nullable().default(null),
    icon: z.string().nullable().default(null),
    sort_order: z.number().default(0),
    can_create: z.boolean().default(false),
    can_update: z.boolean().default(false),
    can_delete: z.boolean().default(false),
    children: z.array(menuNodeSchema).default([]),
  }),
)

export const navigationSchema = z.object({
  active_company_id: z.string().nullable().default(null),
  companies: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        code: z.string(),
        hris_enabled: z.boolean().default(false),
        role_id: z.string().nullable().default(null),
        role_name: z.string().nullable().default(null),
        is_default: z.boolean().default(false),
        is_active_company: z.boolean().default(false),
      }),
    )
    .default([]),
  menus: z.array(menuNodeSchema).default([]),
})

export const mfaSetupSchema = z.object({
  secret_base32: z.string().min(1),
  otpauth_url: z.string().min(1),
  backup_codes: z.array(z.string()).max(10),
})

// ---------- itam ----------
const assetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  asset_tag: z.string(),
  node_type: z
    .enum(['HOST', 'NETWORK', 'VIRTUAL', 'CONTAINER', 'RACK_MOUNTED', 'SERVICE'])
    .default('HOST'),
  status: z
    .enum(['ACTIVE', 'PLANNED', 'STAGED', 'OFFLINE', 'FAILED', 'DECOMMISSIONED'])
    .default('ACTIVE'),
  hostname: z.string().nullable().default(null),
  mgmt_ip: z.string().nullable().default(null),
  serial_number: z.string().nullable().default(null),
  assigned_to_user_id: z.string().nullable().default(null),
  checked_out_at: z.string().nullable().default(null),
  expected_checkin_at: z.string().nullable().default(null),
  created_at: z.string().default(''),
})

export const assetListSchema = z
  .union([z.object({ assets: z.array(assetSchema) }), z.array(assetSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.assets))

export const licenseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  license_key: z.string().nullable().default(null),
  has_key: z.boolean().default(false),
  seat_total: z.number().default(0),
  seat_used: z.number().default(0),
  expires_at: z.string().nullable().default(null),
})

export const licenseListSchema = z
  .union([z.object({ licenses: z.array(licenseSchema) }), z.array(licenseSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.licenses))

export const ticketSchema = z.object({
  id: z.string().min(1),
  code: z.string(),
  title: z.string(),
  ticket_type: z.enum(['INCIDENT', 'REQUEST']).default('INCIDENT'),
  priority: z
    .enum(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'])
    .default('MEDIUM'),
  status: z.number().default(0),
  created_at: z.string().default(''),
  due_at: z.string().nullable().default(null),
})

export const ticketListSchema = z
  .union([z.object({ tickets: z.array(ticketSchema) }), z.array(ticketSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.tickets))

export const importSummarySchema = z.object({
  inserted: z.number().default(0),
  error_count: z.number().default(0),
  errors: z
    .array(
      z.object({
        row_number: z.number(),
        column: z.string().nullable().default(null),
        code: z.string(),
        message: z.string(),
      }),
    )
    .default([]),
})

// ---------- net ----------
export const rackListSchema = z
  .union([
    z.object({
      racks: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string(),
          site_id: z.string().nullable().default(null),
          u_total: z.number().default(0),
          u_used: z.number().default(0),
        }),
      ),
    }),
    z.array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        site_id: z.string().nullable().default(null),
        u_total: z.number().default(0),
        u_used: z.number().default(0),
      }),
    ),
  ])
  .transform((v) => (Array.isArray(v) ? v : v.racks))

const prefixSchema = z.object({
  id: z.string().min(1),
  prefix: z.string(),
  status: z.enum(['ACTIVE', 'RESERVED', 'CONTAINER', 'DEPRECATED']).default('ACTIVE'),
  is_pool: z.boolean().default(false),
  vlan_id: z.string().nullable().default(null),
})

export const prefixListSchema = z
  .union([z.object({ prefixes: z.array(prefixSchema) }), z.array(prefixSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.prefixes))

const addressSchema = z.object({
  id: z.string().min(1),
  address: z.string(),
  status: z
    .enum(['ACTIVE', 'RESERVED', 'DEPRECATED', 'DHCP', 'SLAAC'])
    .default('ACTIVE'),
  is_gateway: z.boolean().default(false),
  dns_name: z.string().nullable().default(null),
  interface_id: z.string().nullable().default(null),
})

export const addressListSchema = z
  .union([z.object({ addresses: z.array(addressSchema) }), z.array(addressSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.addresses))

// ---------- studio & files ----------
export const collectionListSchema = z
  .union([
    z.object({
      collections: z.array(
        z.object({
          collection: z.string().min(1),
          icon: z.string().nullable().default(null),
          note: z.string().nullable().default(null),
        }),
      ),
    }),
    z.array(
      z.object({
        collection: z.string().min(1),
        icon: z.string().nullable().default(null),
        note: z.string().nullable().default(null),
      }),
    ),
  ])
  .transform((v) => (Array.isArray(v) ? v : v.collections))

export const fieldListSchema = z
  .union([
    z.object({
      fields: z.array(
        z.object({
          field: z.string().min(1),
          is_required: z.boolean().default(false),
          special: z.string().nullable().default(null),
        }),
      ),
    }),
    z.array(
      z.object({
        field: z.string().min(1),
        is_required: z.boolean().default(false),
        special: z.string().nullable().default(null),
      }),
    ),
  ])
  .transform((v) => (Array.isArray(v) ? v : v.fields))

export const itemListSchema = z
  .union([
    z.object({
      items: z.array(
        z.object({
          id: z.string().min(1),
          company_id: z.string().default(''),
          data: z.record(z.string(), z.unknown()).default({}),
          created_at: z.string().default(''),
        }),
      ),
    }),
    z.array(
      z.object({
        id: z.string().min(1),
        company_id: z.string().default(''),
        data: z.record(z.string(), z.unknown()).default({}),
        created_at: z.string().default(''),
      }),
    ),
  ])
  .transform((v) => (Array.isArray(v) ? v : v.items))

export const fileListSchema = z
  .union([
    z.object({
      files: z.array(
        z.object({
          id: z.string().min(1),
          file_name: z.string(),
          content_type: z.string().default('application/octet-stream'),
          size_bytes: z.number().default(0),
          sha256: z.string().nullable().default(null),
          created_at: z.string().default(''),
        }),
      ),
    }),
    z.array(
      z.object({
        id: z.string().min(1),
        file_name: z.string(),
        content_type: z.string().default('application/octet-stream'),
        size_bytes: z.number().default(0),
        sha256: z.string().nullable().default(null),
        created_at: z.string().default(''),
      }),
    ),
  ])
  .transform((v) => (Array.isArray(v) ? v : v.files))

export const fileMetaSchema = z.object({
  id: z.string().min(1),
  file_name: z.string(),
  content_type: z.string().default('application/octet-stream'),
  size_bytes: z.number().default(0),
  sha256: z.string().nullable().default(null),
  created_at: z.string().default(''),
  presigned_url: z.string().nullable().default(null),
})
