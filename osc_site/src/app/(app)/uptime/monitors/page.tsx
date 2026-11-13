import { clientGateways } from '@/infrastructure/api/gateways'
import { NocDashboardClient } from '@/presentation/components/infra/noc-dashboard-client'

/**
 * NOC Command Center Dashboard — route menu `uptime.monitors` (privilege
 * Company aktif diverifikasi RouteGuard + upstream RBAC granular).
 */
export default function UptimeMonitorsPage() {
  const gateways = clientGateways()
  return <NocDashboardClient gateway={gateways.infra} studio={gateways.studio} />
}
