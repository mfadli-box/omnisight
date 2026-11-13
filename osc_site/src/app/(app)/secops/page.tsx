import { SecOpsClient } from '@/presentation/components/secops/secops-client'

/**
 * SecOps & Vulnerability Center — route menu Wave 3 (`secops`):
 * dashboard security alerts (severity & MITRE), FIM change logs, CVE per asset.
 */
export default function SecOpsPage() {
  return <SecOpsClient />
}
