"use client";

import { Select as Primitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import type { Ref } from "react";

type Option = { value: string; label: string; disabled?: boolean };
type SelectProps = {
  label: string;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
};

export function Select({ label, options, value, onChange, onBlur, disabled, invalid, triggerRef }: SelectProps) {
  const placeholder = options.find((option) => option.value === "")?.label ?? label;
  return <Primitive.Root value={value} items={options} disabled={disabled}
    onValueChange={(next) => { if (next !== null) onChange(next); }}>
    <Primitive.Trigger ref={triggerRef} aria-label={label} aria-invalid={invalid || undefined}
      onBlur={onBlur} className="field-control flex items-center justify-between gap-2 px-3 text-left">
      <Primitive.Value placeholder={placeholder} className="truncate" />
      <Primitive.Icon><ChevronDown className="size-4 shrink-0 text-muted" /></Primitive.Icon>
    </Primitive.Trigger>
    <Primitive.Portal>
      <Primitive.Positioner sideOffset={5} alignItemWithTrigger={false} className="z-[60] outline-none">
        <Primitive.Popup className="max-h-[min(16rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-auto rounded-lg border border-border bg-card p-1 text-sm shadow-lg outline-none">
          {options.map((option) => <Primitive.Item key={option.value} value={option.value} disabled={option.disabled}
            className="grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-md px-2 py-2 outline-none data-highlighted:bg-surface data-disabled:opacity-50">
            <Primitive.ItemIndicator><Check className="size-4 text-primary" /></Primitive.ItemIndicator>
            <Primitive.ItemText className="col-start-2">{option.label}</Primitive.ItemText>
          </Primitive.Item>)}
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  </Primitive.Root>;
}
