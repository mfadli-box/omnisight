import { clientGateways } from '@/infrastructure/api/gateways'
import { DockerStudioClient } from '@/presentation/components/infra/docker-studio-client'

/**
 * Docker Stack & Container Studio — route menu `infra.compose`.
 */
export default function InfraComposePage() {
  return <DockerStudioClient gateway={clientGateways().infra} />
}
