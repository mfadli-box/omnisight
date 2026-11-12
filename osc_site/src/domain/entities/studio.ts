/** Entitas Studio (koleksi dinamis Directus-style) & file RustFS. */

export interface CollectionMeta {
  collection: string
  icon: string | null
  note: string | null
}

export interface FieldMeta {
  field: string
  is_required: boolean
  special: string | null
}

/** Item koleksi dinamis — kolom JSONB `data` + audit. */
export interface DynamicItem {
  id: string
  company_id: string
  data: Record<string, unknown>
  created_at: string
}

/** Metadata `file_assets` (objek RustFS; akses via presigned URL TTL 300 s). */
export interface FileAssetMeta {
  id: string
  file_name: string
  content_type: string
  size_bytes: number
  sha256: string | null
  created_at: string
  presigned_url?: string | null
}
