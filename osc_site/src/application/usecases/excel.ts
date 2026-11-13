/**
 * Use case: workflow Excel import/export aset.
 * Validasi klien (ekstensi, MIME, ukuran) SEBELUM upload dimulai.
 */

import { DomainError } from '@/domain/errors'
import type { ImportRowError } from '@/domain/entities/itam'
import type { IExcelGateway, ImportProgress } from '@/domain/gateways/excel'

export const EXCEL_ALLOWED_EXTENSIONS = ['.xlsx', '.xls'] as const
export const EXCEL_ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // beberapa OS tidak mendaftarkan MIME xlsx
])
export const EXCEL_MAX_BYTES = 10 * 1024 * 1024 // 10 MB (batas upstream osc_rest)

/** Validasi klien file import — lempar DomainError bila tidak lolos. */
export function validateImportFile(file: File): void {
  const lower = file.name.toLowerCase()
  const extOk = EXCEL_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))
  if (!extOk) {
    throw new DomainError(
      `Ekstensi file harus ${EXCEL_ALLOWED_EXTENSIONS.join(' atau ')}`,
    )
  }
  if (file.type.length > 0 && !EXCEL_ALLOWED_MIME.has(file.type)) {
    throw new DomainError('Tipe MIME file tidak dikenali sebagai workbook Excel')
  }
  if (file.size > EXCEL_MAX_BYTES) {
    throw new DomainError(
      `Ukuran file melebihi batas ${Math.round(EXCEL_MAX_BYTES / 1024 / 1024)} MB`,
    )
  }
  if (file.size === 0) {
    throw new DomainError('File kosong')
  }
}

export interface ImportRunResult {
  inserted: number
  error_count: number
  errors: ImportRowError[]
}

/** Jalankan import dengan validasi pra-upload + progres. */
export async function runImport(
  gateway: IExcelGateway,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ImportRunResult> {
  validateImportFile(file)
  const summary = await gateway.importAssets(file, onProgress)
  return {
    inserted: summary.inserted,
    error_count: summary.error_count,
    errors: summary.errors,
  }
}
