"use client";

import { Dialog as Primitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

export const Sheet = Primitive.Root;
export const SheetTrigger = Primitive.Trigger;

export function SheetContent({ children }: { children: ReactNode }) {
  return <Primitive.Portal>
    <Primitive.Backdrop className="fixed inset-0 z-50 bg-black/50" />
    <Primitive.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col border-r border-border bg-card shadow-2xl outline-none">
      <Primitive.Title className="sr-only">Navigasi OmniSight</Primitive.Title>
      {children}
      <Primitive.Close render={<Button variant="ghost" size="icon" className="absolute right-3 top-4" aria-label="Tutup menu" />}><X /></Primitive.Close>
    </Primitive.Popup>
  </Primitive.Portal>;
}
