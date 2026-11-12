'use client'

/**
 * Excel Export (streaming) — GET /api/proxy/v1/assets/export dialirkan
 * passthrough oleh proxy lalu dibungkus Blob di browser; URL object di-revoke
 * setelah anchor diklik. Filename disanitasi dari Content-Disposition.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { FileDown } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import { clientGateways } from '@/infrastructure/api/gateways'
import { Button } from '@/presentation/components/ui/button'

export function ExcelExportButton() {
  const gateway = clientGateways().excel
  const [busy, setBusy] = useState(false)

  async function onExport() {
    setBusy(true)
    let objectUrl: string | null = null
    try {
      const { blob, filename } = await gateway.exportAssets()
      objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      toast.success(`Export dimulai: ${filename}`)
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Export gagal',
      )
    } finally {
      if (objectUrl !== null) {
        // revoke setelah event loop berikutnya agar unduhan sempat dimulai.
        setTimeout(() => URL.revokeObjectURL(objectUrl as string), 10_000)
      }
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void onExport()} disabled={busy}>
      <FileDown className="h-4 w-4" /> {busy ? 'Menyiapkan…' : 'Export Excel'}
    </Button>
  )
}
