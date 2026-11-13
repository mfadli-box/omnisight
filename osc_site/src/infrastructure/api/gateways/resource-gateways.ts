/** Gateway Studio + DCIM/IPAM + Files (implementasi port domain, via BFF). */

import type { AddressRow, PrefixRow, RackRow } from '@/domain/entities/net'
import type { CollectionMeta, DynamicItem, FieldMeta, FileAssetMeta } from '@/domain/entities/studio'
import type { AddressCreateInput, INetGateway, PrefixCreateInput } from '@/domain/gateways/net'
import type { IStudioGateway } from '@/domain/gateways/studio'
import type { IFileGateway } from '@/domain/gateways/files'
import { apiJson, jsonInit, proxyFetch, toClientError } from '@/infrastructure/api/client'
import {
  addressListSchema,
  collectionListSchema,
  fieldListSchema,
  fileListSchema,
  fileMetaSchema,
  itemListSchema,
  prefixListSchema,
  rackListSchema,
} from '@/infrastructure/api/schemas'

export class StudioGateway implements IStudioGateway {
  async listCollections(): Promise<CollectionMeta[]> {
    return apiJson('/v1/collections', collectionListSchema)
  }

  async createCollection(input: { collection: string; icon?: string; note?: string }): Promise<void> {
    const res = await proxyFetch('/v1/collections', jsonInit('POST', input))
    if (!res.ok) throw await toClientError(res)
  }

  async listFields(collection: string): Promise<FieldMeta[]> {
    return apiJson(`/v1/collections/${encodeURIComponent(collection)}/fields`, fieldListSchema)
  }

  async listItems(collection: string, limit = 50, offset = 0): Promise<DynamicItem[]> {
    return apiJson(
      `/v1/items/${encodeURIComponent(collection)}?limit=${limit}&offset=${offset}`,
      itemListSchema,
    )
  }

  async createItem(collection: string, data: Record<string, unknown>): Promise<void> {
    const res = await proxyFetch(
      `/v1/items/${encodeURIComponent(collection)}`,
      jsonInit('POST', { data }),
    )
    if (!res.ok) throw await toClientError(res)
  }
}

export class NetGateway implements INetGateway {
  async listRacks(): Promise<RackRow[]> {
    return apiJson('/v1/dcim/racks', rackListSchema)
  }

  async listPrefixes(): Promise<PrefixRow[]> {
    return apiJson('/v1/ipam/prefixes', prefixListSchema)
  }

  async createPrefix(input: PrefixCreateInput): Promise<PrefixRow> {
    const res = await proxyFetch('/v1/ipam/prefixes', jsonInit('POST', input))
    if (!res.ok) throw await toClientError(res)
    const body = (await res.json()) as { data?: unknown }
    // POST mengembalikan objek prefix baru; fallback: refresh list oleh caller.
    const parsed = prefixListSchema.safeParse([body.data ?? body])
    return parsed.success
      ? parsed.data[0]
      : { ...input, id: '', vlan_id: null, status: input.status ?? 'ACTIVE', is_pool: input.is_pool ?? false }
  }

  async listAddresses(): Promise<AddressRow[]> {
    return apiJson('/v1/ipam/addresses', addressListSchema)
  }

  async createAddress(input: AddressCreateInput): Promise<AddressRow> {
    const res = await proxyFetch('/v1/ipam/addresses', jsonInit('POST', input))
    if (!res.ok) throw await toClientError(res)
    const body = (await res.json()) as { data?: unknown }
    const parsed = addressListSchema.safeParse([body.data ?? body])
    return parsed.success
      ? parsed.data[0]
      : {
          ...input,
          id: '',
          status: input.status ?? 'ACTIVE',
          is_gateway: input.is_gateway ?? false,
          dns_name: input.dns_name ?? null,
          interface_id: input.interface_id ?? null,
        }
  }
}

export class FileGateway implements IFileGateway {
  async listFiles(): Promise<FileAssetMeta[]> {
    return apiJson('/v1/files', fileListSchema)
  }

  async getFile(id: string): Promise<FileAssetMeta> {
    return apiJson(`/v1/files/${encodeURIComponent(id)}`, fileMetaSchema)
  }
}
