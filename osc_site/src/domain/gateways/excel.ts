/** Port Excel streaming (import multipart + export binary stream). */

import type { ImportRowError } from '../entities/itam'

export interface ImportProgress {
  /** 0..100. */
  percent: number
}

export interface IExcelGateway {
  /**
   * Upload .xlsx ke `POST /assets/import` (passthrough stream via BFF).
   * `onProgress` dilaporkan dari event progress XHR upload (0..100).
   */
  importAssets(
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<{ inserted: number; error_count: number; errors: ImportRowError[] }>

  /**
   * Export aset `.xlsx` — binary stream dibungkus menjadi Blob untuk
   * unduhan (URL object di-revoke pemanggil).
   */
  exportAssets(): Promise<{ blob: Blob; filename: string }>
}
