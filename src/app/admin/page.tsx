import Link from 'next/link';
import type { CSSProperties } from 'react';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { adminClient } from '@/lib/supabase/admin';
import { dataDir, mediaStore } from '@/lib/storage';
import { supabaseServer } from '@/lib/supabase/server';
import { classify, needsAttention } from '@/lib/memberHealth';
import { ownerOrRedirect } from './guard';
import { StorageBanner } from './storage/StorageBanner';
import { Icon, PageHeader, StatTile, btnCls, btnGhostCls, type IconName, type StatTone } from './kit';

export const metadata = { title: 'Dashboard - Admin - Link-C' };

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

const mb = (b: number) => b / (1024 * 1024);
const isOk = (s: string | null) => !!s && /^http 2\d\d$/.test(s);

function Usage({ label, usedMb, capMb }: { label: string; usedMb: number; capMb: number }) {
  const pct = capMb > 0 ? Math.min(100, (usedMb / capMb) * 100) : 0;
  const warn = pct >= 80;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className={warn ? 'font-semibold' : 'text-muted'}>
          {usedMb.toFixed(1)} / {capMb} MB ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="ad-meter" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <i data-warn={warn} style={{ width: `${pct}%` }} />
      </div>
      {warn && <p className="text-xs">Above 80% of the cap. Free space or raise the cap.</p>}
    </div>
  );
}

type Attn = { icon: IconName; tone: StatTone; text: string; href?: string; cta?: string };

export default async function AdminDashboard() {
  await ownerOrRedirect();
  const db = adminClient();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
  const onlineSince = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const [active, disabled, pendingInv, today, snaps, sms, settings, smsCfg, snapBytes, tempBytes, online, recentSms] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('login_disabled', false),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('login_disabled', true),
    db.from('invites').select('email', { count: 'exact', head: true }).is('accepted_at', null),
    db.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', dayStart.toISOString()),
    db.from('media_items').select('id', { count: 'exact', head: true }).in('mode', ['once', 'timed']).is('deleted_at', null),
    db.from('sms_log').select('id', { count: 'exact', head: true }).eq('kind', 'alert').gte('sent_at', monthStart.toISOString()),
    db.from('app_settings').select('*').eq('id', 1).single(),
    db.from('sms_settings').select('monthly_cap').eq('id', 1).single(),
    dirSize(path.join(dataDir(), 'snaps')),
    dirSize(path.join(dataDir(), 'tmp')),
    db.from('presence_state').select('user_id', { count: 'exact', head: true }).gte('last_seen_at', onlineSince),
    db.from('sms_log').select('provider_status').order('sent_at', { ascending: false }).limit(10),
  ]);

  let driver = 'unknown';
  try {
    driver = mediaStore().name;
  } catch {
    driver = 'misconfigured';
  }
  const s = settings.data as { temp_cap_mb: number; snaps_cap_mb: number } | null;
  const cap = smsCfg.data?.monthly_cap ?? 0;
  const smsFailures = (recentSms.data ?? []).filter((l) => !isOk(l.provider_status as string | null)).length;
  const usedMb = mb(snapBytes + tempBytes);
  const snapPct = s && s.snaps_cap_mb > 0 ? (mb(snapBytes) / s.snaps_cap_mb) * 100 : 0;
  const tempPct = s && s.temp_cap_mb > 0 ? (mb(tempBytes) / s.temp_cap_mb) * 100 : 0;
  const onlineCount = online.error ? null : (online.count ?? 0);

  // Members quiet for 3+ days (owner session runs the health RPC; failures are ignored).
  let inactiveCount = 0;
  try {
    const { data: health } = await (await supabaseServer()).rpc('admin_member_health');
    const nowMs = Date.now();
    inactiveCount = ((health ?? []) as { login_disabled: boolean; last_seen_at: string | null; last_sign_in_at: string | null }[]).filter((m) =>
      needsAttention(classify(m.last_seen_at, m.last_sign_in_at, nowMs).status, !!m.login_disabled),
    ).length;
  } catch {
    /* health tile is optional */
  }

  const attn: Attn[] = [];
  if (inactiveCount > 0) attn.push({ icon: 'clock', tone: 'amber', text: `${inactiveCount} member${inactiveCount === 1 ? '' : 's'} inactive.`, href: '/admin/health', cta: 'Members health' });
  if (driver !== 'b2') attn.push({ icon: 'server', tone: 'amber', text: `Media storage driver is "${driver}" (this server's disk, not Backblaze B2).`, href: '#storage', cta: 'See storage' });
  if (snapPct >= 80) attn.push({ icon: 'disk', tone: 'amber', text: `Snap storage is at ${snapPct.toFixed(0)}% of its cap.`, href: '/admin/settings', cta: 'Raise the cap' });
  if (tempPct >= 80) attn.push({ icon: 'disk', tone: 'amber', text: `Temporary uploads are at ${tempPct.toFixed(0)}% of their cap.`, href: '/admin/settings', cta: 'Raise the cap' });
  if (smsFailures >= 3) attn.push({ icon: 'message', tone: 'red', text: `${smsFailures} of the last 10 SMS attempts failed.`, href: '/admin/sms', cta: 'Check SMS' });
  if ((disabled.count ?? 0) > 0) attn.push({ icon: 'ban', tone: 'violet', text: `${disabled.count} login${disabled.count === 1 ? ' is' : 's are'} disabled.`, href: '/admin/members', cta: 'Review members' });

  return (
    <>
      <PageHeader title="Dashboard" subtitle="A quick look at people, activity and storage." />
      <StorageBanner />

      <section aria-label="Key numbers" className="ad-statgrid">
        <StatTile index={0} icon="users" tone="cyan" label="Active people" value={active.count ?? 0} href="/admin/members" />
        {onlineCount !== null && <StatTile index={1} icon="activity" tone="green" label="Online now" value={onlineCount} sub="seen in the last 2 minutes" />}
        <StatTile index={2} icon="mail" tone="amber" label="Pending invites" value={pendingInv.count ?? 0} href="/admin/members" />
        <StatTile index={3} icon="ban" tone="red" label="Disabled logins" value={disabled.count ?? 0} href="/admin/members" />
        <StatTile index={4} icon="message" tone="violet" label="Messages today" value={today.count ?? 0} />
        <StatTile index={5} icon="disk" tone="pink" label="Storage in use" text={usedMb.toFixed(1)} suffix="MB" sub="snaps and temporary uploads" />
        <StatTile index={6} icon="camera" tone="cyan" label="Active snaps" value={snaps.count ?? 0} />
        <StatTile index={7} icon="send" tone="violet" label="SMS this month" text={`${sms.count ?? 0} / ${cap}`} sub="alerts vs monthly cap" />
      </section>

      <section aria-labelledby="attn-h" className="space-y-3">
        <h2 id="attn-h" className="ad-h2">
          Needs attention <small>({attn.length})</small>
        </h2>
        {attn.length === 0 ? (
          <div className="ad-attn-item rise" style={{ '--tone': 'var(--ad-green)' } as CSSProperties}>
            <span className="ad-stat-icon">
              <Icon name="check" size={18} />
            </span>
            <p>All clear. Nothing needs your attention right now.</p>
          </div>
        ) : (
          <div className="ad-attn">
            {attn.map((a, i) => (
              <div key={i} className="ad-attn-item rise" style={{ '--tone': `var(--ad-${a.tone})`, animationDelay: `${i * 60}ms` } as CSSProperties}>
                <span className="ad-stat-icon">
                  <Icon name={a.icon} size={18} />
                </span>
                <div>
                  <p>{a.text}</p>
                  {a.href && <Link href={a.href}>{a.cta} &rarr;</Link>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="qa-h" className="space-y-3">
        <h2 id="qa-h" className="ad-h2">
          Quick actions
        </h2>
        <div className="ad-actions">
          <Link href="/admin/members?invite=1" className={btnCls}>
            <Icon name="userPlus" size={16} /> Invite someone
          </Link>
          <Link href="/admin/members" className={btnGhostCls}>
            <Icon name="key" size={16} /> Reset a password
          </Link>
          <Link href="/admin/stickers" className={btnGhostCls}>
            <Icon name="smile" size={16} /> Open stickers
          </Link>
        </div>
      </section>

      <div className="ad-cols">
        <section className="ad-card rise space-y-4">
          <h2 className="ad-card-title">
            <Icon name="disk" size={18} /> Disk usage
          </h2>
          {s && (
            <>
              <Usage label="Snaps" usedMb={mb(snapBytes)} capMb={s.snaps_cap_mb} />
              <Usage label="Temporary uploads" usedMb={mb(tempBytes)} capMb={s.temp_cap_mb} />
            </>
          )}
        </section>

        <section id="storage" className="ad-card rise">
          <h2 className="ad-card-title">
            <Icon name="server" size={18} /> Media storage
          </h2>
          <p className="mt-2 text-sm">
            Driver in use: <span className="font-mono text-accent">{driver}</span>
          </p>
          {driver !== 'b2' && (
            <p className="mt-3 rounded-xl border border-amber-500/60 bg-amber-500/15 p-3 text-sm" role="alert">
              Normal media is stored on this server&apos;s disk, not in Backblaze B2. Fine for development; set STORAGE_DRIVER=b2 and the
              B2_* variables for production.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
