"use client";

import { ReactNode } from "react";
import { ErrorBoundary } from "@/uix/error-boundary";

export function BoardErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
