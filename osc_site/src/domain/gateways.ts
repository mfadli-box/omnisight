/**
 * Port (interface) milik domain/ — diimplementasikan infrastructure/.
 * Browser/komponen TIDAK PERNAH memanggil Rust API langsung.
 */

import type { ApiHealthSnapshot } from './entities'

export interface IBackendGateway {
  /** Cek kesehatan backend via BFF proxy; `null` bila tidak terjangkau. */
  apiHealth(): Promise<ApiHealthSnapshot | null>
}

export type {
  IAuthGateway,
  IMeGateway,
} from './gateways/auth'
export type { IItamGateway } from './gateways/itam'
export type { INetGateway } from './gateways/net'
export type { IStudioGateway } from './gateways/studio'
export type { IFileGateway } from './gateways/files'
export type { IExcelGateway, ImportProgress } from './gateways/excel'
