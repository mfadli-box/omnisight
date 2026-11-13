/** Port ITAM (aset, lisensi, tiket). */

import type {
  Asset,
  AssetNodeType,
  AssetStatus,
  ImportRowError,
  SoftwareLicenseRow,
  TicketPriority,
  TicketRow,
  TicketType,
} from '../entities/itam'

export interface AssetListQuery {
  filter?: string
  limit?: number
  offset?: number
}

export interface AssetCreateInput {
  name: string
  asset_tag: string
  node_type: AssetNodeType
  status: AssetStatus
  hostname?: string
  mgmt_ip?: string
  serial_number?: string
  asset_model_id?: string
  status_label_id?: string
  purchase_cost?: number
  notes?: string
}

export interface CheckoutInput {
  target_user_id?: string
  target_location_id?: string
  expected_checkin_at?: string
}

export interface TicketCreateInput {
  title: string
  description?: string
  ticket_type: TicketType
  priority: TicketPriority
  assignee_user_id?: string
  asset_id?: string
  due_at?: string
}

export interface IItamGateway {
  listAssets(query?: AssetListQuery): Promise<Asset[]>
  createAsset(input: AssetCreateInput): Promise<Asset>
  checkoutAsset(id: string, input: CheckoutInput): Promise<void>
  checkinAsset(id: string): Promise<void>
  listLicenses(query?: AssetListQuery): Promise<SoftwareLicenseRow[]>
  listTickets(query?: AssetListQuery): Promise<TicketRow[]>
  createTicket(input: TicketCreateInput): Promise<TicketRow>
  /** Ringkasan import — error baris dikembalikan terstruktur (cap 100). */
  importAssets(file: File, onProgress?: (pct: number) => void): Promise<{ inserted: number; error_count: number; errors: ImportRowError[] }>
}
