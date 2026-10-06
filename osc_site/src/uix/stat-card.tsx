import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utility"
import { Card, CardContent, CardHeader, CardTitle } from "./card"
import { Skeleton } from "./skeleton"

const statCardVariants = cva("", {
  variants: {
    variant: {
      default: "",
      success: "border-green-200 dark:border-green-800",
      warning: "border-yellow-200 dark:border-yellow-800",
      error: "border-red-200 dark:border-red-800",
      info: "border-blue-200 dark:border-blue-800",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

export interface StatCardProps extends React.ComponentProps<"div">, VariantProps<typeof statCardVariants> {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
  trend?: {
    value: number
    direction: "up" | "down" | "neutral"
  }
  loading?: boolean
}

function StatCard({
  className,
  title,
  value,
  description,
  icon,
  trend,
  loading = false,
  variant,
  ...props
}: StatCardProps) {
  return (
    <Card data-slot="stat-card" className={cn(statCardVariants({ variant }), className)} {...props}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {(description || trend) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {trend && (
                  <span
                    className={cn(
                      "font-medium",
                      trend.direction === "up" && "text-green-600 dark:text-green-400",
                      trend.direction === "down" && "text-red-600 dark:text-red-400",
                      trend.direction === "neutral" && "text-muted-foreground"
                    )}
                  >
                    {trend.direction === "up" && "↑"}
                    {trend.direction === "down" && "↓"}
                    {Math.abs(trend.value)}%
                  </span>
                )}
                {description && <span>{description}</span>}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export { StatCard, statCardVariants }
