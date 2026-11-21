"use client";

import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: Omit<ComponentProps<typeof BaseInput>, "className"> & { className?: string }) {
  return <BaseInput {...props} className={cn("field-control px-3", className)} />;
}
