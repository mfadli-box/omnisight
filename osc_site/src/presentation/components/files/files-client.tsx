'use client'

/**
 * RustFS Files — daftar metadata + upload multipart (passthrough stream
 * ≤ 25 MB) + unduh via presigned URL (TTL 300 s, tanpa URL permanen).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, ExternalLink, Upload } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import type { FileAssetMeta } from '@/domain/entities/studio'
import type { IFileGateway } from '@/domain/gateways/files'
import { clientGateways } from '@/infrastructure/api/gateways'
import { apiUploadWithProgress } from '@/infrastructure/api/client'
import { Button } from '@/presentation/components/ui/button'
import { Progress } from '@/presentation/components/ui/progress'
import { Skeleton } from '@/presentation/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table'

const FILE_MAX_BYTES = 25 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function FilesClient({ gateway }: { gateway: IFileGateway }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FileAssetMeta[] | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    gateway
      .listFiles()
      .then((rows) => {
        if (!cancelled) setFiles(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFiles([])
          toast.error(err instanceof ApiClientError ? err.message : 'Gagal memuat file')
        }
      })
    return () => {
      cancelled = true
    }
  }, [gateway, reloadKey])

  async function onUpload(file: File) {
    if (file.size > FILE_MAX_BYTES) {
      toast.error('File melebihi 25 MB (batas upstream)')
      return
    }
    setPercent(0)
    try {
      await apiUploadWithProgress('/v1/files', file, setPercent)
      toast.success('File terunggah ke RustFS')
      reload()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'PAYLOAD_TOO_LARGE'
          ? 'File terlalu besar (413)'
          : error instanceof ApiClientError
            ? error.message
            : 'Upload gagal',
      )
    } finally {
      setPercent(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function onDownload(id: string) {
    try {
      // Metadata berisi presigned URL TTL 300 detik (tidak ada URL permanen).
      const meta = await gateway.getFile(id)
      const url = meta.presigned_url
      if (!url) {
        toast.info('Presigned URL tidak tersedia — hubungi administrator.')
        return
      }
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.rel = 'noreferrer'
      anchor.target = '_blank'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Gagal mengambil tautan')
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">File RustFS</h1>
          <p className="text-sm text-muted-foreground">
            Object key acak `{`{company_id}/{uuidv7}{ext}`}` — anti path traversal; SHA-256 tercatat.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {percent !== null && <Progress value={percent} className="w-40" />}
          <label className="inline-flex">
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onUpload(file)
              }}
            />
            <span className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              <Upload className="h-4 w-4" /> Upload
            </span>
          </label>
        </div>
      </div>

      {files === null ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Ukuran</TableHead>
                <TableHead>SHA-256</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Belum ada file.
                  </TableCell>
                </TableRow>
              )}
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="max-w-[260px] truncate">{file.file_name}</TableCell>
                  <TableCell className="text-xs">{file.content_type}</TableCell>
                  <TableCell className="text-xs">{formatBytes(file.size_bytes)}</TableCell>
                  <TableCell className="max-w-[140px] truncate font-mono text-[10px]">
                    {file.sha256 ?? '-'}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => void onDownload(file.id)}>
                      <Download className="h-3.5 w-3.5" /> Presigned
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

/** Ekspor gateway singleton untuk halaman files (server tidak dipakai). */
export const filesGatewayRef = () => clientGateways().files
