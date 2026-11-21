"use client";

import { Tabs as Primitive } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Tabs = Primitive.Root;
export const TabsPanel = Primitive.Panel;

export function TabsList({ className, ...props }: Omit<ComponentProps<typeof Primitive.List>, "className"> & { className?: string }) {
  return <Primitive.List className={cn("inline-flex max-w-full gap-1 rounded-lg border border-border bg-surface p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: Omit<ComponentProps<typeof Primitive.Tab>, "className"> & { className?: string }) {
  return <Primitive.Tab className={cn("rounded-md px-3 py-2 text-sm font-medium text-muted outline-primary data-active:bg-card data-active:text-foreground data-active:shadow-sm", className)} {...props} />;
}
