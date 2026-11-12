/** Entitas ITAM (aset, lisensi, tiket) + model error baris Excel. */

export const ASSET_NODE_TYPES = [
  'HOST',
  'NETWORK',
  'VIRTUAL',
  'CONTAINER',
  'RACK_MOUNTED',
  'SERVICE',
] as const
export type AssetNodeType = (typeof ASSET_NODE_TYPES)[number]

export const ASSET_STATUSES = [
  'ACTIVE',
  'PLANNED',
  'STAGED',
  'OFFLINE',
  'FAILED',
  'DECOMMISSIONED',
] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

export interface Asset {
  id: string
  name: string
  asset_tag: string
  node_type: AssetNodeType
  status: AssetStatus
  hostname: string | null
  mgmt_ip: string | null
  serial_number: string | null
  assigned_to_user_id: string | null
  checked_out_at: string | null
  expected_checkin_at: string | null
  created_at: string
}

/** Lisensi — `license_key` TIDAK pernah diekspos upstream (hanya `has_key`). */
export interface SoftwareLicenseRow {
  id: string
  name: string
  license_key: string | null
  has_key: boolean
  seat_total: number
  seat_used: number
  expires_at: string | null
}

export const TICKET_TYPES = ['INCIDENT', 'REQUEST'] as const
export type TicketType = (typeof TICKET_TYPES)[number]

export const TICKET_PRIORITIES = [
  'VERY_LOW',
  'LOW',
  'MEDIUM',
  'HIGH',
  'VERY_HIGH',
] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export interface TicketRow {
  id: string
  code: string
  title: string
  ticket_type: TicketType
  priority: TicketPriority
  status: number
  created_at: string
  due_at: string | null
}

/** Error validasi satu baris Excel dari `POST /assets/import`. */
export interface ImportRowError {
  row_number: number
  column: string | null
  code: string
  message: string
}

/** Ringkasan import aset. */
export interface ImportSummary {
  inserted: number
  error_count: number
  errors: ImportRowError[]
}
