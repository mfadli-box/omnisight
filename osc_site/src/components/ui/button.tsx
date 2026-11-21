"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const variants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        secondary: "bg-surface text-foreground hover:bg-border",
        outline: "border border-border bg-card text-foreground hover:bg-surface",
        ghost: "text-muted hover:bg-surface hover:text-foreground",
        danger: "bg-red-700 text-white hover:bg-red-800",
      },
      size: { default: "h-10 px-4", sm: "h-8 px-3 text-xs", icon: "size-9 shrink-0" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & VariantProps<typeof variants> & {
  className?: string;
};
export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <BaseButton {...props} className={cn(variants({ variant, size }), className)} />;
}
