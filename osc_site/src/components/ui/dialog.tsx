"use client";

import { Dialog as Primitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;

export function DialogContent({ className, children, ...props }: Omit<ComponentProps<typeof Primitive.Popup>, "className"> & { className?: string }) {
  return <Primitive.Portal>
    <Primitive.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
    <Primitive.Popup className={cn("fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl outline-none", className)} {...props}>
      {children}
      <Primitive.Close render={<Button variant="ghost" size="icon" className="absolute right-3 top-3" aria-label="Tutup dialog" />}><X /></Primitive.Close>
    </Primitive.Popup>
  </Primitive.Portal>;
}
