import type { Metadata } from "next";
import ForgotMfaPanel from "@/components/features/auth/forgot-mfa-panel";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Pemulihan MFA" };
export default function ForgotMfaPage() {
  return <main className="grid min-h-dvh place-items-center px-4 py-10">
    <Card className="w-full max-w-lg p-7 sm:p-10"><ForgotMfaPanel /></Card>
  </main>;
}
