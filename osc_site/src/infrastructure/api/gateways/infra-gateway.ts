/**
 * Gateway Infra Control Plane Wave 2 — implementasi port `IInfraGateway`
 * via BFF proxy (`/api/proxy/v1/...`, cookie HttpOnly → Bearer server-side).
 * Seluruh respons upstream divalidasi Zod (`infrastructure/api/schemas.ts`).
 */

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
} from '@/domain/entities/infra'
import type {
  IInfraGateway,
  StackCreateInput,
  StackUpdateInput,
  VhostCreateInput,
  VhostUpdateInput,
} from '@/domain/gateways/infra'
import { apiJson, jsonInit, proxyFetch, toClientError } from '@/infrastructure/api/client'
import {
  composeStackSchema,
  createdIdSchema,
  dockerHostListSchema,
  enrollmentTokenSchema,
  monitorListSchema,
  nginxNodeListSchema,
  nginxVhostSchema,
  publicStatusPageSchema,
  stackDispatchSchema,
  stackListSchema,
  statusPageListSchema,
  vhostDispatchSchema,
  vhostListSchema,
} from '@/infrastructure/api/schemas'

export class InfraGateway implements IInfraGateway {
  // ---------- Agent Enrollment ----------
  async issueEnrollmentToken(nodeType: NodeType, ttlHours: number): Promise<EnrollmentTokenIssued> {
    return apiJson(
      '/v1/agents/enrollment-tokens',
      enrollmentTokenSchema,
      jsonInit('POST', { node_type: nodeType, ttl_hours: ttlHours }),
    )
  }

  // ---------- Docker Stack Control Plane ----------
  async listDockerHosts(): Promise<DockerHostRef[]> {
    return apiJson('/v1/docker/hosts', dockerHostListSchema)
  }

  async listStacks(): Promise<ComposeStack[]> {
    return apiJson('/v1/docker/stacks', stackListSchema)
  }

  async getStack(id: string): Promise<ComposeStack> {
    return apiJson(`/v1/docker/stacks/${encodeURIComponent(id)}`, composeStackSchema)
  }

  async createStack(input: StackCreateInput): Promise<{ id: string }> {
    return apiJson('/v1/docker/stacks', createdIdSchema, jsonInit('POST', input))
  }

  async updateStack(id: string, input: StackUpdateInput): Promise<ComposeStack> {
    return apiJson(
      `/v1/docker/stacks/${encodeURIComponent(id)}`,
      composeStackSchema,
      jsonInit('PUT', input),
    )
  }

  async deleteStack(id: string): Promise<void> {
    const res = await proxyFetch(`/v1/docker/stacks/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw await toClientError(res)
  }

  async dispatchStack(id: string, command: StackCommand): Promise<StackDispatch> {
    return apiJson(
      `/v1/docker/stacks/${encodeURIComponent(id)}/dispatch`,
      stackDispatchSchema,
      jsonInit('POST', { command }),
    )
  }

  // ---------- Nginx Reverse Proxy Control Plane ----------
  async listNginxNodes(): Promise<NginxNodeRef[]> {
    return apiJson('/v1/nginx/nodes', nginxNodeListSchema)
  }

  async listVhosts(): Promise<NginxVhost[]> {
    return apiJson('/v1/nginx/vhosts', vhostListSchema)
  }

  async getVhost(id: string): Promise<NginxVhost> {
    return apiJson(`/v1/nginx/vhosts/${encodeURIComponent(id)}`, nginxVhostSchema)
  }

  async createVhost(input: VhostCreateInput): Promise<{ id: string }> {
    return apiJson('/v1/nginx/vhosts', createdIdSchema, jsonInit('POST', input))
  }

  async updateVhost(id: string, input: VhostUpdateInput): Promise<NginxVhost> {
    return apiJson(
      `/v1/nginx/vhosts/${encodeURIComponent(id)}`,
      nginxVhostSchema,
      jsonInit('PUT', input),
    )
  }

  async deleteVhost(id: string): Promise<void> {
    const res = await proxyFetch(`/v1/nginx/vhosts/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw await toClientError(res)
  }

  async dispatchVhost(id: string): Promise<VhostDispatch> {
    return apiJson(
      `/v1/nginx/vhosts/${encodeURIComponent(id)}/dispatch`,
      vhostDispatchSchema,
      jsonInit('POST', {}),
    )
  }

  // ---------- Uptime & Status Pages ----------
  async listMonitors(): Promise<UptimeMonitor[]> {
    return apiJson('/v1/monitors', monitorListSchema)
  }

  async listStatusPages(): Promise<StatusPageRow[]> {
    return apiJson('/v1/status-pages', statusPageListSchema)
  }

  async getPublicStatusPage(slug: string): Promise<PublicStatusPage> {
    return apiJson(`/v1/status-pages/${encodeURIComponent(slug)}`, publicStatusPageSchema)
  }
}
