/** Port DCIM/IPAM. */

import type { AddressRow, PrefixRow, RackRow } from '../entities/net'

export interface PrefixCreateInput {
  prefix: string
  status?: 'ACTIVE' | 'RESERVED' | 'CONTAINER' | 'DEPRECATED'
  is_pool?: boolean
}

export interface AddressCreateInput {
  address: string
  status?: 'ACTIVE' | 'RESERVED' | 'DEPRECATED' | 'DHCP' | 'SLAAC'
  is_gateway?: boolean
  dns_name?: string
  prefix_id?: string
  interface_id?: string
}

export interface INetGateway {
  listRacks(): Promise<RackRow[]>
  listPrefixes(): Promise<PrefixRow[]>
  createPrefix(input: PrefixCreateInput): Promise<PrefixRow>
  listAddresses(): Promise<AddressRow[]>
  createAddress(input: AddressCreateInput): Promise<AddressRow>
}
