"use client"

import * as React from "react"
import { cn } from "@/lib/utility"
import { Input } from "./input"
import { Field, FieldLabel, FieldError } from "./field"
import { Button } from "./button"
import { NativeSelect, NativeSelectOption } from "./native-select"

const PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 02:00", value: "0 2 * * *" },
  { label: "Weekly (Sunday)", value: "0 0 * * 0" },
  { label: "Monthly", value: "0 0 1 * *" },
]

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

export interface CronInputProps extends Omit<React.ComponentProps<"div">, "value" | "onChange"> {
  value?: string
  onChange?: (value: string) => void
  error?: boolean
  disabled?: boolean
  showPresets?: boolean
}

function CronInput({
  value = "",
  onChange,
  error,
  disabled,
  showPresets = true,
  className,
  ...props
}: CronInputProps) {
  const [mode, setMode] = React.useState<"preset" | "custom">(
    value && !PRESETS.some((p) => p.value === value) ? "custom" : "preset"
  )
  const [selectedPreset, setSelectedPreset] = React.useState(
    PRESETS.find((p) => p.value === value)?.value ?? ""
  )

  const parseCron = (cron: string) => {
    const parts = cron.trim().split(/\s+/)
    if (parts.length < 5) return null
    return {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4],
    }
  }

  const buildCron = (parts: Record<string, string>) => {
    return `${parts.minute} ${parts.hour} ${parts.dayOfMonth} ${parts.month} ${parts.dayOfWeek}`
  }

  const parsed = React.useMemo(() => parseCron(value), [value])

  const [custom, setCustom] = React.useState({
    minute: parsed?.minute ?? "0",
    hour: parsed?.hour ?? "*",
    dayOfMonth: parsed?.dayOfMonth ?? "*",
    month: parsed?.month ?? "*",
    dayOfWeek: parsed?.dayOfWeek ?? "*",
  })

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset)
    onChange?.(preset)
  }

  const handleCustomChange = (field: string, val: string) => {
    const next = { ...custom, [field]: val }
    setCustom(next)
    onChange?.(buildCron(next))
  }

  const handleRawChange = (raw: string) => {
    onChange?.(raw)
    const p = parseCron(raw)
    if (p) {
      setCustom(p)
      setMode("custom")
    }
  }

  const getNextRun = (cron: string): string => {
    try {
      const parts = cron.trim().split(/\s+/)
      if (parts.length < 5) return ""
      const [min, hour] = parts
      const now = new Date()
      const next = new Date(now)
      next.setSeconds(0, 0)

      if (min !== "*") {
        if (min.includes("/")) {
          const step = parseInt(min.split("/")[1])
          next.setMinutes(Math.ceil(next.getMinutes() / step) * step)
        } else if (min.includes(",")) {
          const mins = min.split(",").map(parseInt).sort((a, b) => a - b)
          const nextMin = mins.find((m) => m > next.getMinutes()) ?? mins[0]
          next.setMinutes(nextMin)
          if (nextMin <= now.getMinutes()) next.setDate(next.getDate() + 1)
        } else {
          next.setMinutes(parseInt(min))
          if (parseInt(min) <= now.getMinutes()) next.setHours(next.getHours() + 1)
        }
      }

      if (hour !== "*") {
        const h = parseInt(hour)
        next.setHours(h)
      }

      return next.toLocaleString()
    } catch {
      return ""
    }
  }

  return (
    <div data-slot="cron-input" className={cn("flex flex-col gap-3", className)} {...props}>
      {showPresets && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              variant={mode === "preset" && selectedPreset === preset.value ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setMode("preset")
                setSelectedPreset(preset.value)
                handlePresetChange(preset.value)
              }}
              disabled={disabled}
              className="touch-manipulation"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => setMode("preset")}
          disabled={disabled}
          variant={mode === "preset" ? "default" : "outline"}
          size="sm"
          className="touch-manipulation"
        >
          Preset
        </Button>
        <Button
          type="button"
          onClick={() => setMode("custom")}
          disabled={disabled}
          variant={mode === "custom" ? "default" : "outline"}
          size="sm"
          className="touch-manipulation"
        >
          Custom
        </Button>
      </div>

      <Field data-invalid={error}>
        <FieldLabel>Expression</FieldLabel>
        <Input
          value={value}
          onChange={(e) => handleRawChange(e.target.value)}
          placeholder="* * * * *"
          disabled={disabled}
          className="font-mono"
        />
        {error && <FieldError errors={[{ message: "Invalid cron expression" }]} />}
      </Field>

      {mode === "custom" && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-3">
          <div className="grid grid-cols-5 gap-2 text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-medium">Minute</span>
              <NativeSelect
                value={custom.minute}
                onChange={(e) => handleCustomChange("minute", e.target.value)}
                disabled={disabled}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <NativeSelectOption value="*">Every (*)</NativeSelectOption>
                <NativeSelectOption value="*/5">Every 5</NativeSelectOption>
                <NativeSelectOption value="*/10">Every 10</NativeSelectOption>
                <NativeSelectOption value="*/15">Every 15</NativeSelectOption>
                <NativeSelectOption value="*/30">Every 30</NativeSelectOption>
                {MINUTES.map((m) => (
                  <NativeSelectOption key={m} value={String(m)}>At :{String(m).padStart(2, "0")}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-medium">Hour</span>
              <NativeSelect
                value={custom.hour}
                onChange={(e) => handleCustomChange("hour", e.target.value)}
                disabled={disabled}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <NativeSelectOption value="*">Every (*)</NativeSelectOption>
                {HOURS.map((h) => (
                  <NativeSelectOption key={h} value={String(h)}>At {String(h).padStart(2, "0")}:00</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-medium">Day (Month)</span>
              <NativeSelect
                value={custom.dayOfMonth}
                onChange={(e) => handleCustomChange("dayOfMonth", e.target.value)}
                disabled={disabled}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <NativeSelectOption value="*">Every (*)</NativeSelectOption>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <NativeSelectOption key={d} value={String(d)}>Day {d}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-medium">Month</span>
              <NativeSelect
                value={custom.month}
                onChange={(e) => handleCustomChange("month", e.target.value)}
                disabled={disabled}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <NativeSelectOption value="*">Every (*)</NativeSelectOption>
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                  <NativeSelectOption key={m} value={String(i + 1)}>{m}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground font-medium">Day (Week)</span>
              <NativeSelect
                value={custom.dayOfWeek}
                onChange={(e) => handleCustomChange("dayOfWeek", e.target.value)}
                disabled={disabled}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <NativeSelectOption value="*">Every (*)</NativeSelectOption>
                {WEEKDAYS.map((d, i) => (
                  <NativeSelectOption key={d} value={String(i)}>{d}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
        </div>
      )}

      {value && (
        <div className="text-xs text-muted-foreground">
          Next run: <span className="font-medium text-foreground">{getNextRun(value)}</span>
        </div>
      )}
    </div>
  )
}

export { CronInput }
