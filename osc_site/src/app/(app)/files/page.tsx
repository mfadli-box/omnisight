import { clientGateways } from '@/infrastructure/api/gateways'
import { FilesClient } from '@/presentation/components/files/files-client'

export default function FilesPage() {
  return <FilesClient gateway={clientGateways().files} />
}
