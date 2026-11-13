/** Port file RustFS (metadata + presigned URL; biner dialirkan via proxy). */

import type { FileAssetMeta } from '../entities/studio'

export interface IFileGateway {
  listFiles(): Promise<FileAssetMeta[]>
  getFile(id: string): Promise<FileAssetMeta>
}
