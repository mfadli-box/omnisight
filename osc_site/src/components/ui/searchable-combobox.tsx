"use client";

import { useId } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronDown } from "lucide-react";

export type TenantOption = { id: string; label: string; sublabel?: string };
type Option = TenantOption;

function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function matchesName(option: Option, query: string) {
  const name = normalize([option.label, option.sublabel].filter(Boolean).join(" "));
  let offset = 0;
  for (const character of normalize(query.trim())) {
    const index = name.indexOf(character, offset);
    if (index === -1) return false;
    offset = index + character.length;
  }
  return true;
}

type Props = {
  label: string;
  options: Option[];
  value: Option | null;
  onChange: (option: Option | null) => void;
  disabled?: boolean;
};

export function SearchableCombobox({ label, options, value, onChange, disabled }: Props) {
  const id = useId();
  return <Combobox.Root items={options} value={value} onValueChange={onChange}
    filter={matchesName} isItemEqualToValue={(item, selected) => item.id === selected.id}
    itemToStringLabel={item => item.label} disabled={disabled}>
    <label htmlFor={id} className="label">{label}</label>
    <div className="relative">
      <Combobox.Input id={id} aria-label={label} className="field pr-11" placeholder={`Cari ${label.toLowerCase()}`} />
      <Combobox.Trigger aria-label={`Buka daftar ${label.toLowerCase()}`} className="absolute inset-y-0 right-0 px-3">
        <ChevronDown size={18} />
      </Combobox.Trigger>
    </div>
    <Combobox.Portal>
      <Combobox.Positioner sideOffset={4} className="z-10 w-[var(--anchor-width)]">
        <Combobox.Popup className="max-h-56 overflow-auto rounded-md border bg-white shadow-lg">
          <Combobox.Empty className="px-3 py-2 empty:hidden">Tidak ada hasil.</Combobox.Empty>
          <Combobox.List>{(item: Option) => <Combobox.Item key={item.id} value={item}
            className="cursor-pointer px-3 py-2 data-[highlighted]:bg-teal-50">
            {item.label}
            {item.sublabel && <span className="block text-xs text-slate-600">{item.sublabel}</span>}
          </Combobox.Item>}</Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  </Combobox.Root>;
}
