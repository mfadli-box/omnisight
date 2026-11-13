/**
 * Entitas Wave 2 (kontrak `osc_docs/rest/contracts/w2.openapi.yaml`):
 * Agent Enrollment, Uptime/Status Pages, Docker Stack & Nginx Control Plane,
 * dan event SSE live logs. Secret (hmac_secret) tidak pernah tiba di UI —
 * hanya token enrollment yang ditampilkan SEKALI.
 */

// ---------- Agent Enrollment ----------
export const NODE_TYPES = [
  'HOST',
  'NETWORK',
  'VIRTUAL',
  'CONTAINER',
  'RACK_MOUNTED',
  'SERVICE',
] as const
export type NodeType = (typeof NODE_TYPES)[number]

/** Respons `POST /agents/enrollment-tokens` — token plaintext ditampilkan sekali. */
export interface EnrollmentTokenIssued {
  id: string
  token: string
  node_type: string
  expires_at: string
}

// ---------- Docker Stack Control Plane ----------
export type HostStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN'

export interface DockerHostRef {
  id: string
  name: string
  status: HostStatus
  docker_version: string | null
  container_count: number | null
  last_seen_at: string | null
}

export type DriftStatus = 'IN_SYNC' | 'DRIFTED' | 'UNKNOWN'
export type StackCommand = 'up' | 'down' | 'pull' | 'restart'

export interface ComposeStack {
  id: string
  docker_host_id: string
  host_name: string
  name: string
  working_dir: string
  compose_content: string | null
  drift_status: DriftStatus
  backup_object_key: string | null
  last_deployed_at: string | null
  last_synced_at: string | null
  last_error: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Respons 202 dispatch — antrean `activity_logs` dieksekusi agent infra_control. */
export interface StackDispatch {
  dispatch_ref: string
  command: string
  stack_id: string
}

// ---------- Nginx Control Plane ----------
export interface NginxNodeRef {
  id: string
  name: string
  status: HostStatus
  nginx_version: string | null
  last_seen_at: string | null
}

export type VhostStatus = 'DRAFT' | 'TESTING' | 'APPLIED' | 'FAILED' | 'ROLLED_BACK'

export interface NginxVhost {
  id: string
  nginx_node_id: string
  node_name: string
  server_name: string
  listen_port: number
  status: VhostStatus
  config_content: string | null
  ssl_cert_path: string | null
  ssl_key_path: string | null
  backup_object_key: string | null
  last_error: string | null
  validated_at: string | null
  applied_at: string | null
  created_at: string
  updated_at: string
}

/** Respons 202 dispatch `test_reload` (agent menjalankan `nginx -t && reload`). */
export interface VhostDispatch {
  dispatch_ref: string
  command: string
  vhost_id: string
}

// ---------- Uptime & Status Pages ----------
export type MonitorType = 'HTTP' | 'HTTPS' | 'TCP' | 'ICMP' | 'DNS' | 'KEYWORD' | 'PUSH'

export interface UptimeMonitor {
  id: string
  name: string
  type: string
  target: string
  config: Record<string, unknown> | null
  interval_seconds: number
  retries: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StatusPageRow {
  id: string
  slug: string
  title: string
  description: string | null
  is_published: boolean
  created_at: string
  updated_at: string
}

/** Monitor rollup dari endpoint publik `GET /status-pages/{slug}` (proyeksi aman). */
export interface PublicMonitorRollup {
  id: string
  name: string
  type: string
  status: string | null
  ping_ms: number | null
  message: string | null
  uptime_pct_24h: number | null
}

export interface PublicStatusPage {
  id: string
  slug: string
  title: string
  description: string | null
  is_published: boolean
  monitors: PublicMonitorRollup[]
}

// ---------- SSE Live Logs ----------
export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]
export type LogScope = 'docker_stack' | 'nginx_vhost'

/** Event `event: log` dari `GET /infra/logs/stream` (SSE). */
export interface SseLogEvent {
  ts: string
  scope: string
  reference: string
  company_id: string
  level: string
  source: string
  message: string
}
