'use client'

/**
 * Excel Import Modal (shadcn/ui):
 *  - Validasi klien: ekstensi .xlsx/.xls, MIME allowlist, maks 10 MB.
 *  - Upload multipart via XHR → event progress → Progress bar real-time
 *    (proxy meneruskan stream tanpa buffering ke osc_rest / calamine).
 *  - Ringkasan hasil + tabel error per baris (Row #, Column, Kode, Pesan)
 *    dari laporan validasi upstream (cap 100 baris).
 */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileUp, Table2 } from 'lucide-react'

import { runImport } from '@/application/usecases/excel'
import { DomainError } from '@/domain/errors'
import type { ImportRowError } from '@/domain/entities/itam'
import { clientGateways } from '@/infrastructure/api/gateways'
import { Alert, AlertDescription, AlertTitle } from '@/presentation/components/ui/alert'
import { Button } from '@/presentation/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/presentation/components/ui/dialog'
import { Progress } from '@/presentation/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table'

type Phase = 'idle' | 'validating' | 'uploading' | 'processing' | 'done'

export function ExcelImportModal({ onImported }: { onImported?: () => void }) {
  const gateway = clientGateways().excel
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [percent, setPercent] = useState(0)
  const [summary, setSummary] = useState<{ inserted: number; error_count: number } | null>(null)
  const [errors, setErrors] = useState<ImportRowError[]>([])
  const [clientError, setClientError] = useState<string | null>(null)

  function reset() {
    setFile(null)
    setPhase('idle')
    setPercent(0)
    setSummary(null)
    setErrors([])
    setClientError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function onStart() {
    if (!file) return
    setClientError(null)
    setPhase('validating')
    try {
      setPhase('uploading')
      const summary = await runImport(gateway, file, (pct) => {
        setPercent(pct)
        if (pct >= 100) setPhase('processing')
      })
      setSummary({ inserted: summary.inserted, error_count: summary.error_count })
      setErrors(summary.errors)
      setPhase('done')
      toast.success(`Import selesai: ${summary.inserted} baris berhasil`)
      onImported?.()
    } catch (err) {
      if (err instanceof DomainError) {
        setClientError(err.message)
      } else {
        setClientError(err instanceof Error ? err.message : 'Import gagal')
      }
      setPhase('idle')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileUp className="h-4 w-4" /> Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Aset dari Excel</DialogTitle>
          <DialogDescription>
            Workbook .xlsx/.xls maks 10 MB. Kolom wajib: <code>asset_tag</code>,{' '}
            <code>name</code>. Unduh export sebagai referensi header.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="block w-full cursor-pointer rounded-md border border-input bg-transparent p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-secondary-foreground"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          {file !== null && (
            <p className="text-xs text-muted-foreground">
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}

          {phase !== 'idle' && phase !== 'done' && (
            <div className="space-y-1">
              <Progress value={percent} />
              <p className="text-xs text-muted-foreground">
                {phase === 'uploading' && `Mengunggah… ${percent}%`}
                {phase === 'processing' && 'Server memproses workbook (calamine)…'}
                {phase === 'validating' && 'Memvalidasi file…'}
              </p>
            </div>
          )}

          {clientError !== null && (
            <Alert variant="destructive">
              <AlertTitle>Validasi gagal</AlertTitle>
              <AlertDescription>{clientError}</AlertDescription>
            </Alert>
          )}

          {summary !== null && (
            <Alert variant={summary.error_count > 0 ? 'warning' : 'success'}>
              <AlertTitle>
                {summary.inserted} baris diimport, {summary.error_count} error
              </AlertTitle>
              <AlertDescription>
                {summary.error_count > 0
                  ? 'Perbaiki baris berikut lalu unggah ulang (maks 100 error ditampilkan).'
                  : 'Semua baris valid dan tersimpan.'}
              </AlertDescription>
            </Alert>
          )}

          {errors.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Baris</TableHead>
                    <TableHead>Kolom</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Pesan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((rowError, i) => (
                    <TableRow key={`${rowError.row_number}-${i}`}>
                      <TableCell className="font-mono text-xs">{rowError.row_number}</TableCell>
                      <TableCell className="font-mono text-xs">{rowError.column ?? '-'}</TableCell>
                      <TableCell>
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs text-destructive">
                          {rowError.code}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{rowError.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={reset} disabled={phase === 'uploading'}>
            <Table2 className="h-4 w-4" /> Reset
          </Button>
          <Button onClick={() => void onStart()} disabled={!file || (phase !== 'idle' && phase !== 'done')}>
            {phase === 'uploading' || phase === 'processing' ? 'Memproses…' : 'Mulai Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
