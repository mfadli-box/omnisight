import { clientGateways } from '@/infrastructure/api/gateways'
import { TicketsClient } from '@/presentation/components/tickets/tickets-client'

export default function TicketsPage() {
  return <TicketsClient gateway={clientGateways().itam} />
}
