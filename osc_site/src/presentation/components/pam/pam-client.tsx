'use client'

/**
 * PAM Bastion & Web SSH Terminal.
 *  - Daftar server target (akun vault, tanpa secret).
 *  - Alur otorisasi: authorize → 403 MFA_REQUIRED_FOR_PAM → prompt aktivasi
 *    MFA; 403 PAM_STEP_UP_REQUIRED → modal Step-Up OTP (input-otp) → ulang
 *    authorize dengan `otp`; sukses → terminal xterm (ticket ephemeral).
 *  - Riwayat sesi + Session Replay Viewer.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Play, RefreshCw, ShieldAlert, TerminalSquare, Video } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import type { PamAccount, PamAuthorizeOutcome, PamSession } from '@/domain/entities/w3'
import { clientGateways } from '@/infrastructure/api/gateways'
import {
  PAM_STATUS_VARIANT,
  formatDateTime,
  formatDuration,
} from '@/application/usecases/w3'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/presentation/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/presentation/components/ui/alert'
import { Badge } from '@/presentation/components/ui/badge'
import { Button } from '@/presentation/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/presentation/components/ui/card'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/presentation/components/ui/input-otp'
import { Label } from '@/presentation/components/ui/label'
import { Skeleton } from '@/presentation/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs'
import { PamReplayViewer } from '@/presentation/components/pam/pam-replay-viewer'
import { PamTerminal } from '@/presentation/components/pam/pam-terminal'

interface AuthorizedSession {
  sessionId: string
  ticket: string
  targetLabel: string
}

export function PamClient() {
  const gateway = clientGateways().pam

  const [accounts, setAccounts] = useState<PamAccount[] | null>(null)
  const [sessions, setSessions] = useState<PamSession[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [stepUp, setStepUp] = useState<{ account: PamAccount; message: string } | null>(null)
  const [otp, setOtp] = useState('')
  const [mfaPrompt, setMfaPrompt] = useState<string | null>(null)
  const [authorizing, setAuthorizing] = useState<string | null>(null)
  const [terminal, setTerminal] = useState<AuthorizedSession | null>(null)
  const [replaySession, setReplaySession] = useState<PamSession | null>(null)

  const reload = useCallback(async () => {
    setLoadError(null)
    try {
      const [acc, ses] = await Promise.all([gateway.listAccounts(), gateway.listSessions()])
      setAccounts(acc)
      setSessions(ses)
    } catch (err) {
      setAccounts([])
      setSessions([])
      setLoadError(
        err instanceof ApiClientError
          ? `${err.message} (${err.code})`
          : 'Gagal memuat data PAM.',
      )
    }
  }, [gateway])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleOutcome(outcome: PamAuthorizeOutcome, account: PamAccount) {
    switch (outcome.kind) {
      case 'authorized': {
        setStepUp(null)
        setOtp('')
        toast.success(`Sesi diotorisasi — ticket berlaku ${outcome.data.ticket_ttl_seconds}s`)
        setTerminal({
          sessionId: outcome.data.session_id,
          ticket: outcome.data.ticket,
          targetLabel: `${outcome.data.account.username}@${account.asset_name ?? account.label}:${account.port}`,
        })
        void reload()
        break
      }
      case 'mfa_required':
        setStepUp(null)
        setMfaPrompt(outcome.message)
        break
      case 'step_up_required':
        setStepUp({
          account,
          message: outcome.message || 'Verifikasi MFA terakhir di luar window — masukkan OTP.',
        })
        break
      case 'policy_denied':
        toast.error(`Policy menolak sesi: ${outcome.message}`)
        break
      case 'error':
        toast.error(outcome.error.message, { description: `Kode: ${outcome.error.code}` })
        break
    }
  }

  async function authorize(account: PamAccount, otpValue?: string) {
    setAuthorizing(account.id)
    try {
      const outcome = await gateway.authorize({
        account_id: account.id,
        otp: otpValue,
        reason: 'Web SSH via PAM Bastion UI',
      })
      await handleOutcome(outcome, account)
    } finally {
      setAuthorizing(null)
    }
  }

  async function submitStepUp() {
    if (!stepUp || otp.length < 6) return
    await authorize(stepUp.account, otp)
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Gagal memuat</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Server Target PAM
          </CardTitle>
          <CardDescription>
            Akun vault (secret terenkripsi Envelope di server). Akses sesi wajib MFA aktif +
            step-up OTP bila verifikasi terakhir &gt; window policy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts === null ? (
            <Skeleton className="h-32 w-full" />
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada akun vault pada company aktif.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Akun</TableHead>
                  <TableHead>Policy</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.label}</TableCell>
                    <TableCell>{account.asset_name ?? account.asset_id}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {account.username}:{account.port} ({account.account_type})
                    </TableCell>
                    <TableCell>{account.policy_name ?? <Badge variant="outline">tanpa policy</Badge>}</TableCell>
                    <TableCell>
                      <Badge variant={account.is_active ? 'default' : 'outline'}>
                        {account.is_active ? 'aktif' : 'nonaktif'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        disabled={!account.is_active || authorizing !== null}
                        onClick={() => void authorize(account)}
                      >
                        <Play className="mr-1 h-3 w-3" />
                        {authorizing === account.id ? 'Memproses…' : 'Buka Sesi'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="history">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="history">Riwayat Sesi</TabsTrigger>
            <TabsTrigger value="replay">Session Replay</TabsTrigger>
          </TabsList>
          <Button size="sm" variant="ghost" onClick={() => void reload()}>
            <RefreshCw className="mr-1 h-3 w-3" /> Muat ulang
          </Button>
        </div>
        <TabsContent value="history">
          <Card>
            <CardContent className="pt-6">
              {sessions === null ? (
                <Skeleton className="h-32 w-full" />
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada sesi PAM.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Akun</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>IP Sumber</TableHead>
                      <TableHead>Durasi</TableHead>
                      <TableHead>Rekaman</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell className="text-xs">{formatDateTime(session.created_at)}</TableCell>
                        <TableCell>{session.account_label}</TableCell>
                        <TableCell>
                          <Badge variant={PAM_STATUS_VARIANT[session.status]}>{session.status}</Badge>
                          {session.denied_reason && (
                            <span className="block text-xs text-muted-foreground">{session.denied_reason}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{session.source_ip ?? '—'}</TableCell>
                        <TableCell>{formatDuration(session.duration_seconds)}</TableCell>
                        <TableCell>
                          {session.recording_object_key ? (
                            <Button size="sm" variant="outline" onClick={() => setReplaySession(session)}>
                              <Video className="mr-1 h-3 w-3" /> Putar
                            </Button>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="replay">
          <Card>
            <CardHeader>
              <CardTitle>Session Replay Viewer</CardTitle>
              <CardDescription>
                Pilih sesi dengan rekaman pada tab Riwayat Sesi, lalu putar di sini. Rekaman
                immutable di bucket privat RustFS.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {replaySession ? (
                <PamReplayViewer sessionId={replaySession.id} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Belum ada sesi yang dipilih untuk diputar.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Step-Up OTP */}
      <Dialog open={stepUp !== null} onOpenChange={(open) => !open && setStepUp(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TerminalSquare className="h-4 w-4" /> Step-Up OTP Verification
            </DialogTitle>
            <DialogDescription>
              {stepUp?.message ??
                'Verifikasi MFA terakhir di luar window policy. Masukkan kode TOTP untuk melanjutkan.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kode OTP (6 digit)</Label>
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button className="w-full" disabled={otp.length < 6} onClick={() => void submitStepUp()}>
              Verifikasi & Buka Sesi
            </Button>
            <p className="text-xs text-muted-foreground">
              5 kegagalan OTP dalam 15 menit mengunci akses PAM sementara (rate-limit server).
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Prompt aktivasi MFA */}
      <Dialog open={mfaPrompt !== null} onOpenChange={(open: boolean) => !open && setMfaPrompt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> MFA Wajib untuk PAM
            </DialogTitle>
            <DialogDescription>
              {mfaPrompt ??
                'Akses bastion menolak sesi tanpa MFA (tanpa kecuali). Aktifkan TOTP pada Profil Keamanan terlebih dahulu.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMfaPrompt(null)}>
              Nanti
            </Button>
            <a
              href="/profile/security"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Aktifkan MFA
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminal Web SSH */}
      <Dialog open={terminal !== null} onOpenChange={(open) => !open && setTerminal(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TerminalSquare className="h-4 w-4" /> Web SSH — {terminal?.targetLabel}
            </DialogTitle>
            <DialogDescription>
              Ticket ephemeral sekali-pakai (TTL pendek). Seluruh sesi direkam untuk audit.
            </DialogDescription>
          </DialogHeader>
          {terminal && (
            <PamTerminal
              sessionId={terminal.sessionId}
              ticket={terminal.ticket}
              targetLabel={terminal.targetLabel}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
