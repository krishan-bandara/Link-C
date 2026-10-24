import { adminClient } from '@/lib/supabase/admin';
import { isAlertLevel, type AlertLevel } from '@/lib/storageStats';

export type StorageSnapshot = {
  diskTotal: number | null;
  diskFree: number | null;
  media: number | null;
  assets: number | null;
  snaps: number | null;
  checkedAt: string | null;
  level: AlertLevel;
  diskFreeAlertPct: number;
  b2BudgetGb: number;
  b2AlertPct: number;
};

const n = (v: unknown) => (v == null ? null : Number(v));

/** Service-role read (storage_stats has no client access). Returns null if the tables are not readable. */
export async function loadStorage(): Promise<StorageSnapshot | null> {
  const db = adminClient();
  const [st, cfg] = await Promise.all([
    db.from('storage_stats').select('*').eq('id', 1).maybeSingle(),
    db.from('app_settings').select('disk_free_alert_pct,b2_budget_gb,b2_alert_pct').eq('id', 1).single(),
  ]);
  if (st.error || cfg.error || !cfg.data) return null;
  const r = st.data as Record<string, unknown> | null;
  const lvl = r?.alert_level;
  return {
    diskTotal: n(r?.disk_total_bytes),
    diskFree: n(r?.disk_free_bytes),
    media: n(r?.media_bytes),
    assets: n(r?.assets_bytes),
    snaps: n(r?.snap_bytes),
    checkedAt: (r?.checked_at as string | null) ?? null,
    level: isAlertLevel(lvl) ? lvl : 'ok',
    diskFreeAlertPct: cfg.data.disk_free_alert_pct as number,
    b2BudgetGb: cfg.data.b2_budget_gb as number,
    b2AlertPct: cfg.data.b2_alert_pct as number,
  };
}
