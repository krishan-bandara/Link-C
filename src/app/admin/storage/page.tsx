import { adminClient } from '@/lib/supabase/admin';
import { b2UsedPct, formatBytes, formatPct, freePct, pct } from '@/lib/storageStats';
import { ownerOrRedirect } from '../guard';
import { Icon, PageHeader, absUtc } from '../kit';
import { StorageBanner } from './StorageBanner';
import { StorageForm } from './StorageForm';
import { loadStorage } from './data';

export const metadata = { title: 'Storage - Admin - Link-C' };
export const dynamic = 'force-dynamic';

function Gauge({ label, value, sub, pctValue, warn }: { label: string; value: string; sub: string; pctValue: number; warn: boolean }) {
  const p = Math.min(100, pctValue);
  return (
    <section className="ad-card rise space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="ad-card-title">{label}</h2>
        <span className="text-2xl font-semibold">{formatPct(pctValue)}</span>
      </div>
      <div className="ad-meter" style={{ height: 16 }} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <i data-warn={warn} style={{ width: `${p}%` }} />
      </div>
      <p className="text-sm">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </section>
  );
}

export default async function StoragePage() {
  await ownerOrRedirect();
  const s = await loadStorage();
  if (!s) return <p className="text-danger">Storage numbers are not available yet.</p>;
  const db = adminClient();
  const [mediaCount, assetCount] = await Promise.all([
    db.from('media_items').select('id', { count: 'exact', head: true }).eq('mode', 'normal').is('deleted_at', null),
    db.from('user_assets').select('id', { count: 'exact', head: true }),
  ]);

  const diskUsed = s.diskTotal != null && s.diskFree != null ? s.diskTotal - s.diskFree : null;
  const diskUsedPct = 100 - freePct(s.diskTotal, s.diskFree);
  const b2Used = (s.media ?? 0) + (s.assets ?? 0);
  const b2Pct = b2UsedPct(b2Used, s.b2BudgetGb);
  const other = diskUsed != null ? Math.max(0, diskUsed - (s.snaps ?? 0)) : null;

  const rows: { label: string; where: string; bytes: number | null; color: string }[] = [
    { label: 'Chat photos and videos', where: 'Backblaze', bytes: s.media, color: 'var(--ad-cyan)' },
    { label: 'Avatars, wallpapers, stickers', where: 'Backblaze', bytes: s.assets, color: 'var(--ad-violet)' },
    { label: 'Temporary snaps', where: 'Server disk', bytes: s.snaps, color: 'var(--ad-pink)' },
    { label: 'Everything else (system, app, other)', where: 'Server disk', bytes: other, color: 'var(--ad-amber)' },
  ];
  const total = rows.reduce((a, r) => a + (r.bytes ?? 0), 0);

  return (
    <>
      <PageHeader title="Storage" subtitle="How full the server disk and Backblaze are." />
      <StorageBanner onStoragePage />

      {!s.checkedAt && <p className="text-sm">The server has not measured storage yet. The first check runs a few minutes after the worker starts.</p>}

      <div className="ad-cols">
        <Gauge
          label="Server disk"
          pctValue={diskUsedPct}
          warn={freePct(s.diskTotal, s.diskFree) < s.diskFreeAlertPct}
          value={`${formatBytes(diskUsed)} used, ${formatBytes(s.diskFree)} free of ${formatBytes(s.diskTotal)}`}
          sub={`You are warned when less than ${s.diskFreeAlertPct}% is free.`}
        />
        <Gauge
          label="Backblaze"
          pctValue={b2Pct}
          warn={b2Pct >= s.b2AlertPct}
          value={`${formatBytes(b2Used)} used of a ${s.b2BudgetGb} GB budget`}
          sub={`You are warned at ${s.b2AlertPct}% of the budget. This is an estimate from file sizes.`}
        />
      </div>

      <section className="ad-card rise space-y-4">
        <h2 className="ad-card-title">
          <Icon name="disk" size={18} /> What uses the space
        </h2>
        <div className="ad-meter" style={{ height: 14, display: 'flex' }} aria-hidden="true">
          {rows.map((r) => (
            <i key={r.label} style={{ width: `${pct(r.bytes ?? 0, total)}%`, background: r.color, borderRadius: 0, backgroundImage: 'none' }} />
          ))}
        </div>
        <ul className="space-y-2 text-sm" style={{ listStyle: 'none', padding: 0 }}>
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, borderRadius: 99, background: r.color, flex: 'none' }} />
                <span>
                  {r.label} <span className="text-muted">({r.where})</span>
                </span>
              </span>
              <span className="font-semibold">{formatBytes(r.bytes)}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          {mediaCount.count ?? 0} chat media file{mediaCount.count === 1 ? '' : 's'} and {assetCount.count ?? 0} avatar, wallpaper or sticker file
          {assetCount.count === 1 ? '' : 's'} kept.
        </p>
        <p className="text-xs text-muted" suppressHydrationWarning>
          Last checked: {s.checkedAt ? absUtc(s.checkedAt) : 'never'}. Checked every 10 minutes.
        </p>
      </section>

      <section className="ad-card rise space-y-2 text-sm">
        <h2 className="ad-card-title">
          <Icon name="server" size={18} /> What these numbers mean
        </h2>
        <p>
          The Backblaze free tier is 10 GB. The budget is the number you set below: Link-C warns you before you reach it so you never get a surprise
          bill. Backblaze use is estimated from the sizes of the files members sent, so Backblaze&apos;s own page may differ slightly.
        </p>
        <p>
          Snaps live only on this server&apos;s disk and are deleted after they are viewed or after 24 hours. If the disk is nearly full, uploads and
          snaps can fail, so you get a red banner and a push notification.
        </p>
      </section>

      <StorageForm v={{ disk_free_alert_pct: s.diskFreeAlertPct, b2_budget_gb: s.b2BudgetGb, b2_alert_pct: s.b2AlertPct }} />
    </>
  );
}
