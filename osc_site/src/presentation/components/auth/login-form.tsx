'use client'

/**
 * Login Dual-Mode + MFA (shadcn/ui):
 *  - Dropdown company ("Local / Global Login" = '' → label Username,
 *    company HRIS → label "HRIS ID").
 *  - Respons `mfa_required: true` → transisi otomatis ke InputOTP 6 digit
 *    + tombol "Gunakan Backup Code / Reset MFA".
 *  - Reset MFA: dialog reset-request (username+email) → reset-confirm
 *    (username+token) — anti-enumeration, respons identik.
 *  - Token tidak pernah disentuh browser: proxy BFF memindahkannya ke
 *    cookie HttpOnly dan menstrip token dari body.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { KeyRound, LifeBuoy } from 'lucide-react'

import { identityLabel, INITIAL_LOGIN_STATE, submitCredentials, submitMfaChallenge } from '@/application/usecases/login'
import { ApiClientError } from '@/domain/errors'
import type { CompanyPublic } from '@/domain/entities/auth'
import { clientGateways } from '@/infrastructure/api/gateways'
import { loginFormSchema, backupCodeSchema, otpSchema } from '@/infrastructure/validation/forms'
import { Alert, AlertDescription, AlertTitle } from '@/presentation/components/ui/alert'
import { Button } from '@/presentation/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/presentation/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/presentation/components/ui/dialog'
import { Input } from '@/presentation/components/ui/input'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/presentation/components/ui/input-otp'
import { Label } from '@/presentation/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select'

const LOCAL_COMPANY = '' // nilai '' = default access / Local Login
const LOCAL_LABEL = 'Local / Global Login'

export function LoginForm({ initialCompanies }: { initialCompanies: CompanyPublic[] }) {
  const router = useRouter()
  const gateway = clientGateways().auth

  const [companies, setCompanies] = useState<CompanyPublic[]>(initialCompanies)
  const [companyId, setCompanyId] = useState<string>(LOCAL_COMPANY)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'credentials' | 'mfa'>(INITIAL_LOGIN_STATE.step === 'credentials' ? 'credentials' : 'mfa')
  const [mode, setMode] = useState<'otp' | 'backup'>('otp')
  const [otp, setOtp] = useState('')
  const [backupCode, setBackupCode] = useState('')
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // Refresh daftar company bila belum tersedia (publik, tanpa auth).
  useEffect(() => {
    if (companies.length > 0) return
    gateway
      .companies()
      .then(setCompanies)
      .catch(() => {
        // Biarkan hanya opsi Local Login — dropdown tetap berfungsi.
      })
  }, [companies.length, gateway])

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) ?? null,
    [companies, companyId],
  )
  const identityLabelText = identityLabel(selectedCompany?.hris_enabled ?? false)

  async function onCredentialsSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const parsed = loginFormSchema.safeParse({ company_id: companyId, username, password })
    if (!parsed.success) {
      setError({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Input tidak valid' })
      return
    }
    setBusy(true)
    try {
      const { outcome, state } = await submitCredentials(gateway, parsed.data)
      if (outcome.mfa_required) {
        setStep('mfa')
        setMode('otp')
        toast.info('MFA diperlukan', { description: 'Masukkan kode 6 digit dari aplikasi authenticator Anda.' })
      } else {
        toast.success(`Selamat datang, ${outcome.user.display_name ?? outcome.user.username}`)
        router.replace('/dashboard')
        router.refresh()
      }
      void state
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError({ code: err.code, message: err.message })
      } else {
        setError({ code: 'UNKNOWN', message: 'Terjadi kesalahan tak terduga' })
      }
    } finally {
      setBusy(false)
    }
  }

  async function onMfaSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const value = mode === 'otp' ? otp : backupCode
    const parsed =
      mode === 'otp' ? otpSchema.safeParse(value) : backupCodeSchema.safeParse(value)
    if (!parsed.success) {
      setError({
        code: 'VALIDATION_ERROR',
        message: mode === 'otp' ? 'Kode harus 6 digit' : 'Backup code tidak valid',
      })
      return
    }
    setBusy(true)
    try {
      await submitMfaChallenge(
        gateway,
        mode === 'otp' ? { otp: value } : { backup_code: value.trim() },
      )
      toast.success('Verifikasi MFA berhasil')
      router.replace('/dashboard')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError({ code: err.code, message: err.message })
      } else {
        setError({ code: 'UNKNOWN', message: 'Verifikasi gagal' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Masuk</CardTitle>
        <CardDescription>
          Login dual-mode: pilih company untuk HRIS, atau Local / Global Login.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error !== null && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>{error.code}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {step === 'credentials' ? (
          <form onSubmit={onCredentialsSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger id="company">
                  <SelectValue placeholder="Pilih company" />
                </SelectTrigger>
                <SelectContent>
                  {/* Opsi default: nilai kosong = default access / Local Login */}
                  <SelectItem value={LOCAL_COMPANY}>{LOCAL_LABEL}</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name} {company.hris_enabled ? '(HRIS)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">{identityLabelText}</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={identityLabelText === 'HRIS ID' ? 'employee.example' : 'username'}
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={200}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Memproses…' : 'Masuk'}
            </Button>
          </form>
        ) : (
          <form onSubmit={onMfaSubmit} className="space-y-4" noValidate>
            <div className="space-y-2 text-center">
              <Label>Verifikasi MFA</Label>
              {mode === 'otp' ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Masukkan kode 6 digit dari aplikasi authenticator.
                  </p>
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
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Masukkan salah satu backup code (sekali pakai — MFA akan di-reset otomatis).
                  </p>
                  <Input
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value)}
                    placeholder="XXXX-XXXX"
                    maxLength={32}
                  />
                </>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              <KeyRound className="h-4 w-4" />
              {busy ? 'Memverifikasi…' : 'Verifikasi'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setMode(mode === 'otp' ? 'backup' : 'otp')}
            >
              {mode === 'otp' ? 'Gunakan Backup Code' : 'Gunakan OTP Authenticator'}
            </Button>
            <MfaResetDialog defaultUsername={username} />
            <Button
              type="button"
              variant="link"
              className="w-full text-muted-foreground"
              onClick={() => {
                setStep('credentials')
                setError(null)
              }}
            >
              Kembali ke login
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

/** Reset MFA via email: reset-request → reset-confirm (publik). */
function MfaResetDialog({ defaultUsername }: { defaultUsername: string }) {
  const gateway = clientGateways().auth
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'request' | 'confirm'>('request')
  const [username, setUsername] = useState(defaultUsername)
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onRequest(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await gateway.mfaResetRequest(username, email)
      setPhase('confirm')
      setMessage('Token reset dikirim ke email (TTL 10 menit). Periksa inbox Anda.')
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : 'Permintaan gagal')
    } finally {
      setBusy(false)
    }
  }

  async function onConfirm(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await gateway.mfaResetConfirm(username, token)
      setMessage('MFA berhasil di-reset & seluruh sesi dicabut. Silakan login kembali.')
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : 'Konfirmasi gagal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="w-full text-muted-foreground">
          <LifeBuoy className="mr-1 h-4 w-4" /> Reset MFA (via email)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset MFA</DialogTitle>
          <DialogDescription>
            Token sekali pakai (TTL 10 menit). Respons selalu identik untuk akun asing
            (anti user-enumeration). Setelah reset, seluruh sesi aktif dicabut.
          </DialogDescription>
        </DialogHeader>
        {phase === 'request' ? (
          <form onSubmit={onRequest} className="space-y-3">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required maxLength={100} />
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email terdaftar" type="email" required />
            <DialogFooter>
              <Button type="submit" disabled={busy}>{busy ? 'Mengirim…' : 'Minta token reset'}</Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={onConfirm} className="space-y-3">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required maxLength={100} />
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token dari email" required maxLength={200} />
            <DialogFooter>
              <Button type="submit" disabled={busy}>{busy ? 'Memproses…' : 'Konfirmasi reset'}</Button>
            </DialogFooter>
          </form>
        )}
        {message !== null && <p className="text-sm text-muted-foreground">{message}</p>}
      </DialogContent>
    </Dialog>
  )
}
