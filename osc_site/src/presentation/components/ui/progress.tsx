'use client'

import * as React from 'react'

import { cn } from '@/presentation/lib/utils'

/** Progress bar ringan tanpa dependensi eksternal (0..100). */
const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: number; indicatorClassName?: string }
>(({ className, value, indicatorClassName, ...props }, ref) => {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
      {...props}
    >
      <div
        className={cn('h-full bg-primary transition-all duration-300', indicatorClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
})
Progress.displayName = 'Progress'

export { Progress }
