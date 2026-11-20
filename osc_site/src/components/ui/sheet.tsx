"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export function SheetContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
    <DialogPrimitive.Content className={cn("fixed inset-y-0 left-0 z-50 flex h-full w-[min(86vw,340px)] flex-col border-r border-slate-200 bg-white p-0 shadow-2xl outline-none", className)} {...props}>
      <DialogPrimitive.Title className="sr-only">Navigasi OmniSight</DialogPrimitive.Title>{children}<DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Tutup menu"><X className="size-4" /></DialogPrimitive.Close>
    </DialogPrimitive.Content></DialogPrimitive.Portal>;
}
