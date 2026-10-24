// Pure helpers for the Admin > Storage page and the worker's storage check (no I/O here, so they are unit tested).

export type AlertLevel = 'ok' | 'warn' | 'critical';

export type StorageInputs = {
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
  /** Bytes kept in Backblaze (normal media + avatars/wallpapers/stickers). */
  b2UsedBytes: number;
  diskFreeAlertPct: number;
  b2BudgetGb: number;
  b2AlertPct: number;
};

const GB = 1024 ** 3;
const RANK: Record<AlertLevel, number> = { ok: 0, warn: 1, critical: 2 };

/** value / total as a percentage, clamped to 0..100; 0 when total is missing or not positive. */
export function pct(value: number | null | undefined, total: number | null | undefined): number {
  if (!value || !total || total <= 0 || value < 0) return 0;
  return Math.min(100, (value / total) * 100);
}

/** Percentage of the disk that is still free (100 when unknown, so a missing reading never alarms). */
export function freePct(total: number | null | undefined, free: number | null | undefined): number {
  if (!total || total <= 0 || free == null) return 100;
  return Math.max(0, Math.min(100, (free / total) * 100));
}

export function b2UsedPct(usedBytes: number, budgetGb: number): number {
  return budgetGb > 0 ? Math.max(0, (usedBytes / (budgetGb * GB)) * 100) : 0;
}

export function alertLevel(i: StorageInputs): AlertLevel {
  const free = freePct(i.diskTotalBytes, i.diskFreeBytes);
  const b2 = b2UsedPct(i.b2UsedBytes, i.b2BudgetGb);
  if (free < i.diskFreeAlertPct / 2 || b2 >= 95) return 'critical';
  if (free < i.diskFreeAlertPct || b2 >= i.b2AlertPct) return 'warn';
  return 'ok';
}

/** Should the owner be pushed now? When the level worsens, or at most once per 24 h while it stays bad. */
export function shouldNotify(prev: AlertLevel, next: AlertLevel, alertSentAt: string | null, now = Date.now()): boolean {
  if (next === 'ok') return false;
  if (RANK[next] > RANK[prev]) return true;
  const sent = alertSentAt ? Date.parse(alertSentAt) : NaN;
  return Number.isNaN(sent) || now - sent >= 24 * 3600_000;
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${u === 0 || v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

export const formatPct = (p: number) => `${p < 10 && p > 0 ? p.toFixed(1) : Math.round(p)}%`;

export const isAlertLevel = (v: unknown): v is AlertLevel => v === 'ok' || v === 'warn' || v === 'critical';
