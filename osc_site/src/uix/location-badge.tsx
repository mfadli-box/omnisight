import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utility"
import {
  MapPinIcon,
  Building2Icon,
  GlobeIcon,
  ServerIcon,
  HashIcon,
} from "lucide-react"

const locationTypeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap font-medium",
  {
    variants: {
      type: {
        country: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        province: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
        city: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
        district: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
        building: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
        floor: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
        room: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        rack: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        default: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
      },
      size: {
        sm: "text-xs px-1.5 py-0.5",
        default: "text-xs px-2 py-0.5",
        lg: "text-sm px-2.5 py-1",
      },
    },
    defaultVariants: {
      type: "default",
      size: "default",
    },
  }
)

export interface LocationBadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof locationTypeVariants> {
  showIcon?: boolean
}

const typeIcons = {
  country: GlobeIcon,
  province: MapPinIcon,
  city: MapPinIcon,
  district: MapPinIcon,
  building: Building2Icon,
  floor: HashIcon,
  room: HashIcon,
  rack: ServerIcon,
  default: MapPinIcon,
}

function LocationBadge({
  className,
  type,
  size,
  showIcon = true,
  children,
  ...props
}: LocationBadgeProps) {
  const Icon = typeIcons[type ?? "default"]

  return (
    <span
      data-slot="location-badge"
      className={cn(locationTypeVariants({ type, size }), className)}
      {...props}
    >
      {showIcon && <Icon className="size-3" />}
      {children}
    </span>
  )
}

export { LocationBadge, locationTypeVariants }
