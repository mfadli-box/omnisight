/**
 * Use case: probe kesehatan backend.
 * Dipakai status page/dashboard pada fase berikutnya; dipisah dari UI agar
 * testable dan bebas React.
 */

import type { ApiHealthSnapshot } from '@/domain/entities'
import type { IBackendGateway } from '@/domain/gateways'

export async function pingBackend(
  gateway: IBackendGateway,
): Promise<ApiHealthSnapshot | null> {
  return gateway.apiHealth()
}
