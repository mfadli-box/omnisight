import { clientGateways } from '@/infrastructure/api/gateways'
import { NginxStudioClient } from '@/presentation/components/infra/nginx-studio-client'

/**
 * Nginx Reverse Proxy Studio — route menu `infra.nginx`.
 */
export default function InfraNginxPage() {
  return <NginxStudioClient gateway={clientGateways().infra} />
}
