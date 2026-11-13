import { clientGateways } from '@/infrastructure/api/gateways'
import { EnrollmentTokenCard } from '@/presentation/components/infra/enrollment-token-card'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/presentation/components/ui/card'

/**
 * Agent Enrollment — route menu `admin.agents` (gate admin di upstream).
 * Token plaintext ditampilkan SEKALI; hmac_secret hanya di respons enroll
 * agent (tidak pernah melewati UI browser).
 */
export default function AdminAgentsPage() {
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Agent Enrollment</h1>
        <p className="text-sm text-muted-foreground">
          Terbitkan one-time enrollment token untuk agent `osc_auto` (host_telemetry,
          network_poller, infra_control). Autentikasi lanjutan: HMAC-SHA256 per-request.
        </p>
      </div>
      <EnrollmentTokenCard gateway={clientGateways().infra} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alur Enrollment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            1. Terbitkan token (TTL 1–72 jam) → token plaintext tampil sekali (DB hanya
            SHA-256).
          </p>
          <p>
            2. Jalankan `osc_auto --enroll &lt;TOKEN&gt; --asset-model &lt;UUID&gt;
            --status-label &lt;UUID&gt;` pada node target → agent menerima
            `agent_id` + `hmac_secret` (ditampilkan sekali, disimpan lokal 0600).
          </p>
          <p>
            3. Agent mengirim telemetri/inventory/logs dengan header
            `X-Agent-Id` + `X-Agent-Timestamp` + `X-Agent-Signature`
            (HMAC-SHA256, window ±30 detik, anti-replay).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
