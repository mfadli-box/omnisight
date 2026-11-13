import { clientGateways } from '@/infrastructure/api/gateways'
import { AssetsClient } from '@/presentation/components/assets/assets-client'

/** Manajemen Aset — client component menerima gateway via props (DI ringan). */
export default function AssetsPage() {
  return <AssetsClient gateway={clientGateways().itam} />
}
