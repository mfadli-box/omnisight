export function formatBytes(bytes: number, opts?: { decimals?: number }): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = opts?.decimals ?? 1;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
  return `${value} ${sizes[i]}`;
}

export function formatBitsPerSec(bps: number, opts?: { decimals?: number }): string {
  if (bps === 0) return "0 bps";
  const k = 1000;
  const dm = opts?.decimals ?? 1;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  const value = parseFloat((bps / Math.pow(k, i)).toFixed(dm));
  return `${value} ${sizes[i]}`;
}

export function formatDuration(ms: number, opts?: { showSeconds?: boolean }): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const seconds = Math.floor(ms / 1000);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return opts?.showSeconds === false ? "<1m" : `${s}s`;
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "-";
  return formatDuration(seconds * 1000);
}

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  return `${ms.toFixed(1)} ms`;
}

export function formatPercent(value: number, opts?: { decimals?: number }): string {
  if (!Number.isFinite(value)) return "-";
  const dm = opts?.decimals ?? 1;
  return `${value.toFixed(dm)}%`;
}

export function formatNumber(value: number, opts?: { locale?: string; maxFractionDigits?: number }): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(opts?.locale ?? "en-US", {
    maximumFractionDigits: opts?.maxFractionDigits ?? 2,
  }).format(value);
}

export function formatEpoch(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const date = new Date(seconds * 1000);
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

export function formatRelativeTime(value: string | Date | number): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  let label: string;
  if (abs < 60_000) label = `${Math.round(abs / 1000)}s`;
  else if (abs < 3_600_000) label = `${Math.round(abs / 60_000)}m`;
  else if (abs < 86_400_000) label = `${Math.round(abs / 3_600_000)}h`;
  else label = `${Math.round(abs / 86_400_000)}d`;
  return future ? `in ${label}` : `${label} ago`;
}

export function parseBytes(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const match = value.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB|PB|Kbps|Mbps|Gbps|bps)?$/i);
  if (!match) return Number(value) || 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || "B").toUpperCase();
  const table: Record<string, number> = {
    B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, PB: 1024 ** 5,
  };
  const kbps = unit.startsWith("K") ? 1000 : unit.startsWith("M") ? 1000 ** 2 : unit.startsWith("G") ? 1000 ** 3 : 1;
  if (unit.endsWith("BPS")) return num * kbps;
  return num * (table[unit] ?? 1);
}
