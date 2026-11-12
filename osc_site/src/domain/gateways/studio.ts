/** Port Studio (koleksi dinamis). */

import type { CollectionMeta, DynamicItem, FieldMeta } from '../entities/studio'

export interface IStudioGateway {
  listCollections(): Promise<CollectionMeta[]>
  createCollection(input: { collection: string; icon?: string; note?: string }): Promise<void>
  listFields(collection: string): Promise<FieldMeta[]>
  listItems(collection: string, limit?: number, offset?: number): Promise<DynamicItem[]>
  createItem(collection: string, data: Record<string, unknown>): Promise<void>
}
