'use client'

/**
 * Profil Keamanan User — aktivasi/nonaktifkan TOTP MFA.
 *  - Setup: QR code (data URL dari `otpauth://` via `qrcode`), secret base32,
 *    10 backup code plaintext (HANYA respons ini — simpan sekarang).
 *  - Enable: InputOTP 6 digit → `mfa_enabled = true`.
 *  - Disable: password + OTP aktif (doubleCheckPassword upstream).
 *  - Reset via email ditangani di halaman login (endpoint publik).
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { ShieldCheck, ShieldOff } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import type { MfaSetupData } from '@/domain/entities/auth'
import { clientGateways } from '@/infrastructure/api/gateways'
import { mfaDisableFormSchema, otpSchema } from '@/infrastructure/validation/forms'
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/presentation/components/ui/input-otp'
import { Label } from '@/presentation/components/ui/label'

export function SecurityProfileClient({ displayName }: { displayName: string }) {
  const gateway = clientGateways().auth

  const [setup, setSetup] = useState<MfaSetupData | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [enabledBusy, setEnabledBusy] = useState(false)

  // Disable form
  const [password, setPassword] = useState('')
  const [disableOtp, setDisableOtp] = useState('')
  const [disableBusy, setDisableBusy] = useState(false)

  useEffect(() => {
    if (setup === null) return
    QRCode.toDataURL(setup.otpauthUrl, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(null))
  }, [setup])

  async function onSetup(): Promise<void> {
    try {
      const data = await gateway.mfaSetup()
      setSetup(data)
      toast.info('Secret TOTP dibuat', {
        description: 'Scan QR lalu konfirmasi OTP untuk mengaktifkan MFA.',
      })
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'CONFLICT'
          ? 'MFA sudah aktif (409)'
          : error instanceof ApiClientError
            ? error.message
            : 'Gagal memulai setup MFA',
      )
    }
  }

  async function onEnable(event: React.FormEvent) {
    event.preventDefault()
    const parsed = otpSchema.safeParse(otp)
    if (!parsed.success) {
      toast.error('Kode harus 6 digit')
      return
    }
    setEnabledBusy(true)
    try {
      await gateway.mfaEnable(parsed.data)
      toast.success('MFA aktif', {
        description: 'Login berikutnya akan meminta kode authenticator.',
      })
      setSetup(null)
      setOtp('')
      setQrDataUrl(null)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'OTP salah')
    } finally {
      setEnabledBusy(false)
    }
  }

  async function onDisable(event: React.FormEvent) {
    event.preventDefault()
    const parsed = mfaDisableFormSchema.safeParse({ password, otp: disableOtp })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Form tidak valid')
      return
    }
    setDisableBusy(true)
    try {
      await gateway.mfaDisable(parsed.data)
      toast.success('MFA dinonaktifkan')
      setPassword('')
      setDisableOtp('')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Gagal menonaktifkan MFA')
    } finally {
      setDisableBusy(false)
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Profil Keamanan</h1>
        <p className="text-sm text-muted-foreground">
          TOTP MFA untuk {displayName} — secret disimpan terenkripsi Envelope AES-256-GCM di upstream.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Aktivasi */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Aktivasi TOTP MFA
            </CardTitle>
            <CardDescription>
              Secret 160-bit + 10 backup code (hash Argon2id). `mfa_enabled` baru `true`
              setelah konfirmasi OTP pertama.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {setup === null ? (
              <Button onClick={() => void onSetup()}>Mulai Setup MFA</Button>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                  {qrDataUrl !== null ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data URL lokal hasil QRCode.toDataURL
                    <img
                      src={qrDataUrl}
                      alt="QR otpauth:// TOTP"
                      width={180}
                      height={180}
                      className="rounded-md border bg-white p-2"
                    />
                  ) : (
                    <div className="flex h-[180px] w-[180px] items-center justify-center rounded-md border text-xs text-muted-foreground">
                      QR tidak tersedia
                    </div>
                  )}
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">Secret (base32):</p>
                    <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                      {setup.secretBase32}
                    </code>
                  </div>
                </div>

                <Alert variant="warning">
                  <AlertTitle>Backup code — tampilkan sekali ini saja</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 grid grid-cols-2 gap-x-4 font-mono text-xs">
                      {setup.backupCodes.map((code) => (
                        <li key={code}>{code}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>

                <form onSubmit={onEnable} className="space-y-3">
                  <Label>Konfirmasi OTP 6 digit</Label>
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
                  <Button type="submit" disabled={enabledBusy}>
                    {enabledBusy ? 'Mengaktifkan…' : 'Aktifkan MFA'}
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nonaktifkan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldOff className="h-5 w-5" /> Nonaktifkan MFA
            </CardTitle>
            <CardDescription>
              Double-check password + OTP aktif (anti pengambilalihan akun).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onDisable} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="mfa-pass">Password saat ini</Label>
                <Input
                  id="mfa-pass"
                  type="password"
                  value={password}
                  maxLength={200}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mfa-otp">OTP aktif</Label>
                <Input
                  id="mfa-otp"
                  inputMode="numeric"
                  value={disableOtp}
                  maxLength={8}
                  onChange={(e) => setDisableOtp(e.target.value)}
                  placeholder="123456"
                  required
                />
              </div>
              <Button type="submit" variant="destructive" disabled={disableBusy}>
                {disableBusy ? 'Memproses…' : 'Nonaktifkan MFA'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
