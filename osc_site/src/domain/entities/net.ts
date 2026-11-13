/** Entitas DCIM/IPAM (NetBox-style, tenant-guarded per company aktif). */

export interface RackRow {
  id: string
  name: string
  site_id: string | null
  u_total: number
  u_used: number
}

export const PREFIX_STATUSES = ['ACTIVE', 'RESERVED', 'CONTAINER', 'DEPRECATED'] as const
export type PrefixStatus = (typeof PREFIX_STATUSES)[number]

export interface PrefixRow {
  id: string
  prefix: string
  status: PrefixStatus
  is_pool: boolean
  vlan_id: string | null
}

export const ADDRESS_STATUSES = ['ACTIVE', 'RESERVED', 'DEPRECATED', 'DHCP', 'SLAAC'] as const
export type AddressStatus = (typeof ADDRESS_STATUSES)[number]

export interface AddressRow {
  id: string
  address: string
  status: AddressStatus
  is_gateway: boolean
  dns_name: string | null
  interface_id: string | null
}
