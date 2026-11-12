/**
 * Liveness osc_site — target healthcheck Docker compose.
 * Sengaja TIDAK mengecek backend (health `osc_rest` punya endpoint sendiri).
 */

export const dynamic = 'force-dynamic'

export function GET(): Response {
  return Response.json({ status: 'ok', service: 'osc_site' })
}
