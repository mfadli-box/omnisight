"use client";

const actions = [
  ["can_create", "Buat"],
  ["can_read", "Baca"],
  ["can_update", "Ubah"],
  ["can_delete", "Hapus"],
  ["can_execute", "Jalankan"],
] as const;

export type PermissionAction = typeof actions[number][0];
export type PermissionRow = Record<PermissionAction, boolean> & {
  menu_id: string;
  label: string;
};

type Props = {
  rows: readonly PermissionRow[];
  onChange: (menuId: string, action: PermissionAction, enabled: boolean) => void;
  disabled?: boolean;
};

export function PermissionMatrixGrid({ rows, onChange, disabled }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="master-table">
        <caption className="sr-only">Hak akses per modul</caption>
        <thead>
          <tr>
            <th scope="col">Modul</th>
            {actions.map(([key, label]) => <th key={key} scope="col">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.menu_id}>
              <th scope="row">{row.label}</th>
              {actions.map(([key, label]) => (
                <td key={key}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row[key]}
                    aria-label={`${label} · ${row.label}`}
                    disabled={disabled}
                    onClick={() => onChange(row.menu_id, key, !row[key])}
                    className="flex h-6 w-11 items-center rounded-full bg-slate-400 px-1 aria-checked:bg-teal-800 disabled:opacity-50"
                  >
                    <span className={`h-4 w-4 rounded-full bg-white transition-transform ${row[key] ? "translate-x-5" : ""}`} />
                  </button>
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={actions.length + 1}>Belum ada modul.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
