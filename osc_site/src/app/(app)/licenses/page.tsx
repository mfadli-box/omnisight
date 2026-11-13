import { clientGateways } from '@/infrastructure/api/gateways'
import { LicensesClient } from '@/presentation/components/licenses/licenses-client'

export default function LicensesPage() {
  return <LicensesClient gateway={clientGateways().itam} />
}
