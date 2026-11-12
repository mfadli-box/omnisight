/**
 * Port (interface) milik domain/ — diimplementasikan infrastructure/.
 * Browser/komponen TIDAK PERNAH memanggil Rust API langsung.
 */

import type { ApiHealthSnapshot } from './entities'

export interface IBackendGateway {
  /** Cek kesehatan backend via BFF proxy; `null` bila tidak terjangkau. */
  apiHealth(): Promise<ApiHealthSnapshot | null>
}
