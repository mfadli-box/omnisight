/**
 * Gateway ITAM + Excel (implementasi port domain) — client-side via BFF proxy.
 * Import multipart & export binary dialirkan passthrough (tanpa buffering
 * penuh di proxy) dengan progres upload dari event XHR.
 */

import { z } from 'zod'

import type { Asset, ImportRowError, SoftwareLicenseRow, TicketRow } from '@/domain/entities/itam'
import type { AssetCreateInput, AssetListQuery, CheckoutInput, IItamGateway, TicketCreateInput } from '@/domain/gateways/itam'
import { ApiClientError } from '@/domain/errors'
import { apiJson, apiUploadWithProgress, downloadBinary, jsonInit, proxyFetch, toClientError } from '@/infrastructure/api/client'
import {
  assetListSchema,
  importSummarySchema,
  licenseListSchema,
  ticketListSchema,
} from '@/infrastructure/api/schemas'

function queryToString(query?: AssetListQuery): string {
  if (!query) return ''
  const params = new URLSearchParams()
  if (query.filter) params.set('filter', query.filter)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.offset) params.set('offset', String(query.offset))
  const s = params.toString()
  return s.length > 0 ? `?${s}` : ''
}

export class ItamGateway implements IItamGateway {
  async listAssets(query?: AssetListQuery): Promise<Asset[]> {
    return apiJson(`/v1/assets${queryToString(query)}`, assetListSchema)
  }

  async createAsset(input: AssetCreateInput): Promise<Asset> {
    return apiJson('/v1/assets', assetSchemaSingle, jsonInit('POST', input))
  }

  async checkoutAsset(id: string, input: CheckoutInput): Promise<void> {
    const res = await proxyFetch(`/v1/assets/${id}/checkout`, jsonInit('POST', input))
    if (!res.ok) throw await toClientError(res)
  }

  async checkinAsset(id: string): Promise<void> {
    const res = await proxyFetch(`/v1/assets/${id}/checkin`, { method: 'POST' })
    if (!res.ok) throw await toClientError(res)
  }

  async listLicenses(query?: AssetListQuery): Promise<SoftwareLicenseRow[]> {
    return apiJson(`/v1/licenses${queryToString(query)}`, licenseListSchema)
  }

  async listTickets(query?: AssetListQuery): Promise<TicketRow[]> {
    return apiJson(`/v1/tickets${queryToString(query)}`, ticketListSchema)
  }

  async createTicket(input: TicketCreateInput): Promise<TicketRow> {
    return apiJson('/v1/tickets', ticketSingle, jsonInit('POST', input))
  }

  async importAssets(
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<{ inserted: number; error_count: number; errors: ImportRowError[] }> {
    const body = (await apiUploadWithProgress('/v1/assets/import', file, onProgress)) as
      | { data?: unknown }
      | null
    const parsed = importSummarySchema.safeParse(body?.data ?? body ?? {})
    if (!parsed.success) {
      throw new ApiClientError('RESPONSE_INVALID', 'Ringkasan import tidak dikenali', 200)
    }
    return parsed.data
  }
}

export class ExcelGateway {
  async importAssets(
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<{ inserted: number; error_count: number; errors: ImportRowError[] }> {
    const body = (await apiUploadWithProgress('/v1/assets/import', file, onProgress)) as
      | { data?: unknown }
      | null
    const parsed = importSummarySchema.safeParse(body?.data ?? body ?? {})
    if (!parsed.success) {
      throw new ApiClientError('RESPONSE_INVALID', 'Ringkasan import tidak dikenali', 200)
    }
    return parsed.data
  }

  async exportAssets(): Promise<{ blob: Blob; filename: string }> {
    return downloadBinary('/v1/assets/export', 'assets-export.xlsx')
  }
}

// Skema single-item dipisah agar transform list tidak dipakai ulang.
export const assetSchemaSingle = z.object({
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

export const ticketSingle = z.object({
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
