import { clientGateways } from '@/infrastructure/api/gateways'
import { StudioClient } from '@/presentation/components/studio/studio-client'

export default function StudioPage() {
  return <StudioClient gateway={clientGateways().studio} />
}
