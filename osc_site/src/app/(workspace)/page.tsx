"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNavigation } from "@/components/layout/navigation-context";

export default function WorkspaceHome() {
  const { items, loading } = useNavigation();
  const router = useRouter();
  const first = items.find((item) => item.module_code === "CT01") || items[0];

  useEffect(() => {
    if (!loading && first) router.replace(`/${first.module_code}`);
  }, [first, loading, router]);

  return <p role="status">{loading || first ? "Memuat workspace…" : "Belum ada modul yang dapat diakses."}</p>;
}
