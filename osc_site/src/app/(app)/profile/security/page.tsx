import { SecurityProfileClient } from '@/presentation/components/security/security-profile-client'

/** Profil Keamanan — route statis selalu diizinkan (di luar menu DB). */
export default function ProfileSecurityPage() {
  return <SecurityProfileClient displayName="Operator" />
}
