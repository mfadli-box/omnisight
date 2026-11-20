import type { Metadata } from "next";
import ForgotMfaPanel from "@/components/auth/forgot-mfa-panel";

export const metadata: Metadata = { title: "Pemulihan MFA" };
export default function ForgotMfaPage() { return <main className="grid min-h-screen place-items-center bg-[#eff4f2] px-4 py-10"><div className="w-full max-w-lg rounded-[2rem] border border-white bg-white p-7 shadow-xl sm:p-10"><ForgotMfaPanel /></div></main>; }
