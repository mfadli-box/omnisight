'use client'

/**
 * Notification Channel Settings — SMTP Email, Telegram & Webhook per company.
 * Config disimpan terenkripsi di server (Envelope AES-256-GCM); UI hanya
 * menampilkan ringkasan `has_*` — password/bot token/secret tidak pernah
 * dikembalikan upstream.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BellRing, Mail, Send, Webhook } from 'lucide-react'

import { ApiClientError } from '@/domain/errors'
import type { ChannelType, NotificationChannel } from '@/domain/entities/w3'
import { clientGateways } from '@/infrastructure/api/gateways'
import {
  CHANNEL_LABELS,
  EVENT_FILTER_PRESETS,
  buildChannelConfig,
  formatDateTime,
} from '@/application/usecases/w3'
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
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import { Skeleton } from '@/presentation/components/ui/skeleton'
import { Switch } from '@/presentation/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs'

const CHANNEL_TYPES: ChannelType[] = ['SMTP_EMAIL', 'TELEGRAM', 'WEBHOOK']

/** Form field per tipe channel — secret memakai type=password. */
const FIELDS: Record<ChannelType, { key: string; label: string; secret?: boolean; placeholder?: string }[]> = {
  SMTP_EMAIL: [
    { key: 'host', label: 'SMTP Host', placeholder: 'smtp.corp.local' },
    { key: 'port', label: 'Port', placeholder: '587' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', secret: true },
    { key: 'from_email', label: 'From Email', placeholder: 'noreply@corp.local' },
  ],
  TELEGRAM: [
    { key: 'bot_token', label: 'Bot Token', secret: true },
    { key: 'chat_id', label: 'Chat ID', placeholder: '-1001234567890' },
  ],
  WEBHOOK: [
    { key: 'url', label: 'Webhook URL', placeholder: 'https://hooks.example.com/omnisight' },
    { key: 'secret', label: 'Signing Secret (HMAC, opsional)', secret: true },
  ],
}

export function NotificationsClient() {
  const gateway = clientGateways().notifications

  const [channels, setChannels] = useState<NotificationChannel[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string | boolean>>({ use_tls: true })
  const [eventFilter, setEventFilter] = useState<string[]>([])
  const [saving, setSaving] = useState<ChannelType | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      setChannels(await gateway.listChannels())
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? `${err.message} (${err.code})`
          : 'Gagal memuat channel notifikasi.',
      )
    }
  }, [gateway])

  useEffect(() => {
    void reload()
  }, [reload])

  function channelByType(type: ChannelType): NotificationChannel | undefined {
    return channels?.find((c) => c.type === type)
  }

  function toggleFilter(event: string) {
    setEventFilter((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    )
  }

  async function save(type: ChannelType) {
    setSaving(type)
    try {
      const existing = channelByType(type)
      const config = buildChannelConfig(type, form)
      if (existing) {
        // PUT full config — secret kosong diabaikan upstream (has_* tetap).
        await gateway.updateChannel(existing.id, { config, event_filter: eventFilter })
        toast.success(`${CHANNEL_LABELS[type]} diperbarui`)
      } else {
        await gateway.createChannel({ channel_type: type, config, event_filter: eventFilter })
        toast.success(`${CHANNEL_LABELS[type]} dibuat`)
      }
      setForm({ use_tls: true })
      setEventFilter([])
      await reload()
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : `Gagal menyimpan ${CHANNEL_LABELS[type]}.`,
      )
    } finally {
      setSaving(null)
    }
  }

  async function toggleActive(channel: NotificationChannel) {
    try {
      await gateway.updateChannel(channel.id, { is_active: !channel.is_active })
      await reload()
    } catch {
      toast.error('Gagal mengubah status channel.')
    }
  }

  async function remove(channel: NotificationChannel) {
    try {
      await gateway.deleteChannel(channel.id)
      toast.success(`${CHANNEL_LABELS[channel.type]} dihapus (soft delete)`)
      await reload()
    } catch {
      toast.error('Gagal menghapus channel.')
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <BellRing className="h-4 w-4" />
          <AlertTitle>Gagal memuat</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="SMTP_EMAIL">
        <TabsList>
          {CHANNEL_TYPES.map((type) => (
            <TabsTrigger key={type} value={type}>
              {type === 'SMTP_EMAIL' && <Mail className="mr-1 h-3 w-3" />}
              {type === 'TELEGRAM' && <Send className="mr-1 h-3 w-3" />}
              {type === 'WEBHOOK' && <Webhook className="mr-1 h-3 w-3" />}
              {CHANNEL_LABELS[type]}
            </TabsTrigger>
          ))}
        </TabsList>

        {CHANNEL_TYPES.map((type) => {
          const existing = channels === null ? undefined : channelByType(type)
          return (
            <TabsContent key={type} value={type}>
              <Card>
                <CardHeader>
                  <CardTitle>{CHANNEL_LABELS[type]}</CardTitle>
                  <CardDescription>
                    Satu channel per tipe per company. Config disimpan terenkripsi; secret hanya
                    ditandai boolean.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {channels === null ? (
                    <Skeleton className="h-32 w-full" />
                  ) : existing ? (
                    <div className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant={existing.is_active ? 'default' : 'outline'}>
                          {existing.is_active ? 'aktif' : 'nonaktif'}
                        </Badge>
                        <Switch checked={existing.is_active} onCheckedChange={() => void toggleActive(existing)} />
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={() => void remove(existing)}
                        >
                          Hapus
                        </Button>
                      </div>
                      <ExistingSummary channel={existing} />
                      <p className="text-xs text-muted-foreground">
                        Dibuat {formatDateTime(existing.created_at)} · diperbarui{' '}
                        {formatDateTime(existing.updated_at)}
                      </p>
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    {FIELDS[type].map((field) => (
                      <div key={field.key} className="space-y-1">
                        <Label htmlFor={`${type}-${field.key}`}>{field.label}</Label>
                        <Input
                          id={`${type}-${field.key}`}
                          type={field.secret ? 'password' : 'text'}
                          placeholder={field.placeholder}
                          value={String(form[field.key] ?? '')}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          autoComplete={field.secret ? 'new-password' : 'off'}
                        />
                      </div>
                    ))}
                    {type === 'SMTP_EMAIL' && (
                      <div className="flex items-center gap-2 md:col-span-2">
                        <Switch
                          id="smtp-tls"
                          checked={Boolean(form.use_tls)}
                          onCheckedChange={(v) => setForm((prev) => ({ ...prev, use_tls: v }))}
                        />
                        <Label htmlFor="smtp-tls">Gunakan TLS (STARTTLS)</Label>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Event Filter (opsional)</Label>
                    <div className="flex flex-wrap gap-2">
                      {EVENT_FILTER_PRESETS.map((event) => (
                        <Badge
                          key={event}
                          variant={eventFilter.includes(event) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => toggleFilter(event)}
                        >
                          {event}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Button onClick={() => void save(type)} disabled={saving !== null}>
                    {existing ? 'Perbarui Channel' : 'Buat Channel'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

/** Ringkasan channel ter-mask (has_* boolean) — tanpa nilai secret. */
function ExistingSummary({ channel }: { channel: NotificationChannel }) {
  const c = channel.config
  const items: string[] = []
  if (c.host) items.push(`host: ${c.host}${c.port ? `:${c.port}` : ''}`)
  if (c.from_email) items.push(`from: ${c.from_email}`)
  if (c.has_password) items.push('password tersimpan ✓')
  if (c.chat_id) items.push(`chat: ${c.chat_id}`)
  if (c.has_bot_token) items.push('bot token tersimpan ✓')
  if (c.url) items.push(`url: ${c.url}`)
  if (c.has_secret) items.push('signing secret tersimpan ✓')
  return (
    <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
      {channel.event_filter.length > 0 && <li>filter: {channel.event_filter.join(', ')}</li>}
    </ul>
  )
}
