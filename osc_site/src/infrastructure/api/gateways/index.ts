/**
 * Service locator ringan (client-side): singleton gateway untuk feature
 * components. Satu instance dipakai bersama agar konsisten & mudah di-mock.
 */

import { AuthGateway } from '@/infrastructure/api/gateways/auth-gateway'
import { ItamGateway, ExcelGateway } from '@/infrastructure/api/gateways/itam-gateway'
import { FileGateway, NetGateway, StudioGateway } from '@/infrastructure/api/gateways/resource-gateways'

let instance: ClientGateways | null = null

export interface ClientGateways {
  auth: AuthGateway
  itam: ItamGateway
  excel: ExcelGateway
  studio: StudioGateway
  net: NetGateway
  files: FileGateway
}

export function clientGateways(): ClientGateways {
  if (!instance) {
    instance = {
      auth: new AuthGateway(),
      itam: new ItamGateway(),
      excel: new ExcelGateway(),
      studio: new StudioGateway(),
      net: new NetGateway(),
      files: new FileGateway(),
    }
  }
  return instance
}
