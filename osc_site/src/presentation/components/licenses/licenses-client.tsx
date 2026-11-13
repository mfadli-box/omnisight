'use client'

/** Software Licenses — tabel read-only (kunci tidak pernah diekspos upstream). */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import type { SoftwareLicenseRow } from '@/domain/entities/itam'
import type { IItamGateway } from '@/domain/gateways/itam'
import { Badge } from '@/presentation/components/ui/badge'
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

export function LicensesClient({ gateway }: { gateway: IItamGateway }) {
  const [licenses, setLicenses] = useState<SoftwareLicenseRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    gateway
      .listLicenses({ limit: 100 })
      .then((rows) => {
        if (!cancelled) setLicenses(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLicenses([])
          toast.error(err instanceof ApiClientError ? err.message : 'Gagal memuat lisensi')
        }
      })
    return () => {
      cancelled = true
    }
  }, [gateway])

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Software Licenses</h1>
        <p className="text-sm text-muted-foreground">
          `license_key` tidak pernah dikirim upstream — hanya flag `has_key` + pemakaian seat.
        </p>
      </div>

      {licenses === null ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Kunci</TableHead>
                <TableHead className="w-56">Seat</TableHead>
                <TableHead>Kedaluwarsa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Belum ada lisensi terdaftar.
                  </TableCell>
                </TableRow>
              )}
              {licenses.map((license) => {
                const pct = license.seat_total > 0 ? Math.round((license.seat_used / license.seat_total) * 100) : 0
                return (
                  <TableRow key={license.id}>
                    <TableCell className="font-medium">{license.name}</TableCell>
                    <TableCell>
                      {license.has_key ? (
                        <Badge variant="secondary">
                          <KeyRound className="mr-1 h-3 w-3" /> tersimpan
                        </Badge>
                      ) : (
                        <Badge variant="outline">tanpa kunci</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Progress value={pct} />
                        <span className="text-xs text-muted-foreground">
                          {license.seat_used}/{license.seat_total} ({pct}%)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{license.expires_at ?? '-'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
