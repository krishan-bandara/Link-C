import { readdir, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { pushConfigured, sendPush, type PushSub } from '@/lib/push';
import { dataDir } from '@/lib/storage';
import { adminClient } from '@/lib/supabase/admin';
import { alertLevel, isAlertLevel, shouldNotify, type AlertLevel } from '@/lib/storageStats';

const EVERY_MS = 10 * 60_000;
const PAGE = 1000;
let last = 0;

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    try {
      total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
    } catch {
      /* file vanished */
    }
  }
  return total;
}

type Row = { plaintext_size?: number | null; media_keys?: { plaintext_size: number } | { plaintext_size: number }[] | null };

/** Sums a size column page by page (cheap: no B2 listing, only database rows). */
async function sumRows(fetchPage: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) {
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const k = Array.isArray(r.media_keys) ? r.media_keys[0] : r.media_keys;
      total += Number(r.plaintext_size ?? k?.plaintext_size ?? 0);
    }
    if (!data || data.length < PAGE) break;
  }
  return total;
}

async function notifyOwner(level: AlertLevel): Promise<boolean> {
  if (!pushConfigured()) return false;
  const db = adminClient();
  const { data: owners } = await db.from('profiles').select('id').eq('role', 'owner');
  const ids = (owners ?? []).map((o) => o.id as string);
  if (!ids.length) return false;
  const { data: subs } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('user_id', ids);
  let anyOk = false;
  for (const s of subs ?? []) {
    const r = await sendPush(s as PushSub, {
      title: level === 'critical' ? 'Link-C storage is full' : 'Link-C storage',
      body: 'Link-C storage is almost full: open Admin > Storage',
    });
    if (r === 'ok') anyOk = true;
    if (r === 'gone') await db.from('push_subscriptions').delete().eq('id', s.id);
  }
  return anyOk;
}

export async function storageStatsStep(): Promise<void> {
  if (Date.now() - last < EVERY_MS) return;
  last = Date.now();
  const db = adminClient();

  const s = await statfs(dataDir());
  const bsize = Number(s.bsize);
  const diskTotal = Number(s.blocks) * bsize;
  const diskFree = Number(s.bavail) * bsize;

  const [mediaBytes, assetsBytes, snapBytes, settings, prev] = await Promise.all([
    sumRows((a, b) =>
      db.from('media_items').select('media_keys(plaintext_size)').eq('mode', 'normal').is('deleted_at', null).order('id').range(a, b) as never,
    ),
    sumRows((a, b) => db.from('user_assets').select('plaintext_size').order('id').range(a, b) as never),
    dirSize(path.join(dataDir(), 'snaps')),
    db.from('app_settings').select('disk_free_alert_pct,b2_budget_gb,b2_alert_pct').eq('id', 1).single(),
    db.from('storage_stats').select('alert_level,alert_sent_at').eq('id', 1).maybeSingle(),
  ]);
  if (settings.error || !settings.data) throw new Error('app_settings unavailable');

  const level = alertLevel({
    diskTotalBytes: diskTotal,
    diskFreeBytes: diskFree,
    b2UsedBytes: mediaBytes + assetsBytes,
    diskFreeAlertPct: settings.data.disk_free_alert_pct as number,
    b2BudgetGb: settings.data.b2_budget_gb as number,
    b2AlertPct: settings.data.b2_alert_pct as number,
  });
  const prevLevel: AlertLevel = isAlertLevel(prev.data?.alert_level) ? prev.data.alert_level : 'ok';
  const prevSent = (prev.data?.alert_sent_at as string | null | undefined) ?? null;

  let sentAt = prevSent;
  if (shouldNotify(prevLevel, level, prevSent)) {
    try {
      if (await notifyOwner(level)) sentAt = new Date().toISOString();
    } catch (e) {
      console.error('[worker] storage alert push failed:', e instanceof Error ? e.message : 'unknown error');
    }
  }
  if (level === 'ok') sentAt = null; // recovered: the next problem alerts straight away

  const { error } = await db.from('storage_stats').upsert({
    id: 1,
    disk_total_bytes: diskTotal,
    disk_free_bytes: diskFree,
    media_bytes: mediaBytes,
    assets_bytes: assetsBytes,
    snap_bytes: snapBytes,
    checked_at: new Date().toISOString(),
    alert_level: level,
    alert_sent_at: sentAt,
  });
  if (error) throw new Error(error.message);
}
