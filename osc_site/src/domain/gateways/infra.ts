/** Port Infra Control Plane Wave 2 (Docker/Nginx/Enrollment/Uptime). */

import type {
  ComposeStack,
  DockerHostRef,
  EnrollmentTokenIssued,
  NginxNodeRef,
  NginxVhost,
  NodeType,
  PublicStatusPage,
  StackCommand,
  StackDispatch,
  StatusPageRow,
  UptimeMonitor,
  VhostDispatch,
} from '../entities/infra'

export interface StackCreateInput {
  docker_host_id: string
  name: string
  working_dir: string
  compose_content: string
  env?: string
}

export interface StackUpdateInput {
  name?: string
  working_dir?: string
  compose_content?: string
  env?: string
  is_active?: boolean
}

export interface VhostCreateInput {
  nginx_node_id: string
  server_name: string
  listen_port: number
  config_content: string
  ssl_cert_path?: string
  ssl_key_path?: string
}

export interface VhostUpdateInput {
  server_name?: string
  listen_port?: number
  config_content?: string
  ssl_cert_path?: string
  ssl_key_path?: string
}

export interface IInfraGateway {
  // Agent Enrollment (admin; token plaintext ditampilkan SEKALI)
  issueEnrollmentToken(nodeType: NodeType, ttlHours: number): Promise<EnrollmentTokenIssued>

  // Docker Stack Control Plane
  listDockerHosts(): Promise<DockerHostRef[]>
  listStacks(): Promise<ComposeStack[]>
  getStack(id: string): Promise<ComposeStack>
  createStack(input: StackCreateInput): Promise<{ id: string }>
  updateStack(id: string, input: StackUpdateInput): Promise<ComposeStack>
  deleteStack(id: string): Promise<void>
  dispatchStack(id: string, command: StackCommand): Promise<StackDispatch>

  // Nginx Reverse Proxy Control Plane
  listNginxNodes(): Promise<NginxNodeRef[]>
  listVhosts(): Promise<NginxVhost[]>
  getVhost(id: string): Promise<NginxVhost>
  createVhost(input: VhostCreateInput): Promise<{ id: string }>
  updateVhost(id: string, input: VhostUpdateInput): Promise<NginxVhost>
  deleteVhost(id: string): Promise<void>
  dispatchVhost(id: string): Promise<VhostDispatch>

  // Uptime & Status Pages (NOC dashboard + sumber expiry SSL cert)
  listMonitors(): Promise<UptimeMonitor[]>
  listStatusPages(): Promise<StatusPageRow[]>
  getPublicStatusPage(slug: string): Promise<PublicStatusPage>
}
