function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: Record<string, unknown>[], opts?: { columns?: string[] }): string {
  if (rows.length === 0) return "";
  const columns = opts?.columns ?? Object.keys(rows[0]);
  const header = columns.map((c) => escapeCsvCell(c)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(row[c])).join(","));
  return [header, ...body].join("\r\n");
}

export function downloadTextFile(
  content: string,
  filename: string,
  mime = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string, opts?: { columns?: string[] }): void {
  downloadTextFile(toCsv(rows, opts), filename.endsWith(".csv") ? filename : `${filename}.csv`, "text/csv;charset=utf-8");
}

export function downloadJson(data: unknown, filename: string): void {
  downloadTextFile(JSON.stringify(data, null, 2), filename.endsWith(".json") ? filename : `${filename}.json`, "application/json;charset=utf-8");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
