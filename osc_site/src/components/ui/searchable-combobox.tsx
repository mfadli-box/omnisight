"use client";

import { useId } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronDown } from "lucide-react";

type Option = { id: string; label: string };
type Props = {
  label: string;
  options: Option[];
  value: Option | null;
  onChange: (option: Option | null) => void;
  disabled: boolean;
};

export function SearchableCombobox({ label, options, value, onChange, disabled }: Props) {
  const id = useId();
  return <Combobox.Root items={options} value={value} onValueChange={onChange}
    itemToStringLabel={item => item.label} disabled={disabled}>
    <label htmlFor={id} className="label">{label}</label>
    <div className="relative">
      <Combobox.Input id={id} aria-label={label} className="field pr-11" placeholder="Cari perusahaan" />
      <Combobox.Trigger aria-label="Buka daftar perusahaan" className="absolute inset-y-0 right-0 px-3">
        <ChevronDown size={18} />
      </Combobox.Trigger>
    </div>
    <Combobox.Portal>
      <Combobox.Positioner sideOffset={4} className="z-10 w-[var(--anchor-width)]">
        <Combobox.Popup className="max-h-56 overflow-auto rounded-md border bg-white shadow-lg">
          <Combobox.Empty className="px-3 py-2 empty:hidden">Tidak ada hasil.</Combobox.Empty>
          <Combobox.List>{(item: Option) => <Combobox.Item key={item.id} value={item}
            className="cursor-pointer px-3 py-2 data-[highlighted]:bg-teal-50">{item.label}</Combobox.Item>}</Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  </Combobox.Root>;
}
