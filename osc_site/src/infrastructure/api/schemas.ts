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

// ---------- wave 2: infra control plane (w2.openapi.yaml) ----------
export const enrollmentTokenSchema = z.object({
  id: z.string().min(1),
  token: z.string().min(1),
  node_type: z.string().default('HOST'),
  expires_at: z.string(),
})

const hostRefSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']).default('UNKNOWN'),
  docker_version: z.string().nullable().default(null),
  container_count: z.number().nullable().default(null),
  last_seen_at: z.string().nullable().default(null),
})

export const dockerHostListSchema = z
  .union([z.object({ hosts: z.array(hostRefSchema) }), z.array(hostRefSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.hosts))

export const nginxNodeListSchema = z
  .union([
    z.object({
      nodes: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string(),
          status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']).default('UNKNOWN'),
          nginx_version: z.string().nullable().default(null),
          last_seen_at: z.string().nullable().default(null),
        }),
      ),
    }),
    z.array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']).default('UNKNOWN'),
        nginx_version: z.string().nullable().default(null),
        last_seen_at: z.string().nullable().default(null),
      }),
    ),
  ])
  .transform((v) => (Array.isArray(v) ? v : v.nodes))

export const composeStackSchema = z.object({
  id: z.string().min(1),
  docker_host_id: z.string().min(1),
  host_name: z.string().default(''),
  name: z.string(),
  working_dir: z.string(),
  compose_content: z.string().nullable().default(null),
  drift_status: z.enum(['IN_SYNC', 'DRIFTED', 'UNKNOWN']).default('UNKNOWN'),
  backup_object_key: z.string().nullable().default(null),
  last_deployed_at: z.string().nullable().default(null),
  last_synced_at: z.string().nullable().default(null),
  last_error: z.string().nullable().default(null),
  is_active: z.boolean().default(true),
  created_at: z.string().default(''),
  updated_at: z.string().default(''),
})

export const stackListSchema = z
  .union([z.object({ stacks: z.array(composeStackSchema) }), z.array(composeStackSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.stacks))

export const nginxVhostSchema = z.object({
  id: z.string().min(1),
  nginx_node_id: z.string().min(1),
  node_name: z.string().default(''),
  server_name: z.string(),
  listen_port: z.number().default(80),
  status: z
    .enum(['DRAFT', 'TESTING', 'APPLIED', 'FAILED', 'ROLLED_BACK'])
    .default('DRAFT'),
  config_content: z.string().nullable().default(null),
  ssl_cert_path: z.string().nullable().default(null),
  ssl_key_path: z.string().nullable().default(null),
  backup_object_key: z.string().nullable().default(null),
  last_error: z.string().nullable().default(null),
  validated_at: z.string().nullable().default(null),
  applied_at: z.string().nullable().default(null),
  created_at: z.string().default(''),
  updated_at: z.string().default(''),
})

export const vhostListSchema = z
  .union([z.object({ vhosts: z.array(nginxVhostSchema) }), z.array(nginxVhostSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.vhosts))

export const createdIdSchema = z.object({ id: z.string().min(1) })

export const stackDispatchSchema = z.object({
  dispatch_ref: z.string().min(1),
  command: z.string().default(''),
  stack_id: z.string().min(1),
})

export const vhostDispatchSchema = z.object({
  dispatch_ref: z.string().min(1),
  command: z.string().default(''),
  vhost_id: z.string().min(1),
})

export const monitorSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.string().default('HTTP'),
  target: z.string().default(''),
  config: z.record(z.string(), z.unknown()).nullable().default(null),
  interval_seconds: z.number().default(60),
  retries: z.number().default(1),
  is_active: z.boolean().default(true),
  created_at: z.string().default(''),
  updated_at: z.string().default(''),
})

export const monitorListSchema = z
  .union([z.object({ monitors: z.array(monitorSchema) }), z.array(monitorSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.monitors))

export const statusPageSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  description: z.string().nullable().default(null),
  is_published: z.boolean().default(false),
  created_at: z.string().default(''),
  updated_at: z.string().default(''),
})

export const statusPageListSchema = z
  .union([z.object({ pages: z.array(statusPageSchema) }), z.array(statusPageSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.pages))

export const publicStatusPageSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  description: z.string().nullable().default(null),
  is_published: z.boolean().default(false),
  monitors: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        type: z.string().default('HTTP'),
        status: z.string().nullable().default(null),
        ping_ms: z.number().nullable().default(null),
        message: z.string().nullable().default(null),
        uptime_pct_24h: z.number().nullable().default(null),
      }),
    )
    .default([]),
})
