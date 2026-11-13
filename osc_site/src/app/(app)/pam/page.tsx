import { PamClient } from '@/presentation/components/pam/pam-client'

/**
 * PAM Bastion & Web SSH Terminal — route menu Wave 3 (`pam.bastion`):
 * server target vault, Step-Up OTP / aktivasi MFA, terminal xterm.js via
 * pam_bastion_gateway (ticket ephemeral), dan Session Replay Viewer.
 */
export default function PamPage() {
  return <PamClient />
}
