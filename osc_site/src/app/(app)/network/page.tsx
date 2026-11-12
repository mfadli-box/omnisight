import { clientGateways } from '@/infrastructure/api/gateways'
import { NetworkClient } from '@/presentation/components/network/network-client'

export default function NetworkPage() {
  return <NetworkClient gateway={clientGateways().net} />
}
