'use client'

/**
 * Generator Agent Enrollment Token (Wave 2, admin-gated).
 * Token plaintext hex-64 DITAMPILKAN SEKALI (DB hanya SHA-256) — komponen
 * menampilkan Alert sekali-tampil + perintah enroll agent siap salin.
 * Gated oleh menu privilege `admin.agents` (can_create) Company aktif.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound } from 'lucide-react'

import type { EnrollmentTokenIssued, NodeType } from '@/domain/entities/infra'
import { NODE_TYPES } from '@/domain/entities/infra'
import type { IInfraGateway } from '@/domain/gateways/infra'
import { ApiClientError } from '@/domain/errors'
import { enrollmentTokenFormSchema } from '@/infrastructure/validation/forms'
import { formatDateTime, menuPrivilege } from '@/application/usecases/infra'
import { Alert, AlertDescription, AlertTitle } from '@/presentation/components/ui/alert'
import { Button } from '@/presentation/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/presentation/components/ui/card'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select'
import { useNavigationContext } from '@/presentation/hooks/navigation-context'

export function EnrollmentTokenCard({ gateway }: { gateway: IInfraGateway }) {
  // Privilege dihitung dari pohon menu Company aktif (`/me/navigation`):
  // form hanya tampil bila menu `admin.agents` punya can_create.
  const { navigation } = useNavigationContext()
  const canCreate = useMemo(
    () => menuPrivilege(navigation.menus, 'admin.agents').can_create,
    [navigation.menus],
  )
  const [nodeType, setNodeType] = useState<NodeType>('HOST')
  const [ttlHours, setTtlHours] = useState('24')
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<EnrollmentTokenIssued | null>(null)

  async function onIssue(event: React.FormEvent) {
    event.preventDefault()
    const ttl = Number.parseInt(ttlHours, 10)
    const parsed = enrollmentTokenFormSchema.safeParse({
      node_type: nodeType,
      ttl_hours: Number.isNaN(ttl) ? -1 : ttl,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
      return
    }
    setBusy(true)
    try {
      const token = await gateway.issueEnrollmentToken(parsed.data.node_type, parsed.data.ttl_hours)
      setIssued(token)
      toast.success('Token enrollment diterbitkan')
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'FORBIDDEN'
          ? 'Hanya admin (role *admin*) yang boleh menerbitkan token'
          : error instanceof ApiClientError
            ? error.message
            : 'Gagal menerbitkan token',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Agent Enrollment Token
        </CardTitle>
        <CardDescription>
          One-time token terikat company aktif (TTL 1–72 jam). Token disimpan
          sebagai SHA-256 — plaintext hanya tampil di sini, sekali.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canCreate ? (
          <form onSubmit={onIssue} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="et-node">Node Type</Label>
              <Select value={nodeType} onValueChange={(v) => setNodeType(v as NodeType)}>
                <SelectTrigger id="et-node" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NODE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-ttl">TTL (jam)</Label>
              <Input
                id="et-ttl"
                type="number"
                min={1}
                max={72}
                value={ttlHours}
                onChange={(e) => setTtlHours(e.target.value)}
                className="w-24"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Menerbitkan…' : 'Terbitkan Token'}
            </Button>
          </form>
        ) : (
          <Alert>
            <AlertTitle>Butuh privilege menu</AlertTitle>
            <AlertDescription>
              Penerbitan token hanya untuk menu <code className="text-xs">admin.agents</code>{' '}
              dengan privilege <em>create</em> pada company aktif.
            </AlertDescription>
          </Alert>
        )}

        {issued && (
          <Alert>
            <AlertTitle>
              Token baru (berlaku s.d. {formatDateTime(issued.expires_at)})
            </AlertTitle>
            <AlertDescription className="space-y-2">
              <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs select-all">
                {issued.token}
              </code>
              <p className="text-xs text-muted-foreground">
                Salin sekarang — token ini tidak akan ditampilkan lagi. Jalankan pada
                node target:
              </p>
              <code className="block overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs select-all">
                osc_auto --enroll {issued.token} --asset-model &lt;UUID&gt; --status-label &lt;UUID&gt;
              </code>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
