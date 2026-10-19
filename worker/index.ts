import { readdir, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { decryptText } from '@/lib/crypto';
import { cleanupUploadSession, deleteMediaBlobs } from '@/lib/media';
import { sendSms } from '@/lib/sms';
import { pushConfigured, sendPush, type PushSub } from '@/lib/push';
import { dataDir, snapStore } from '@/lib/storage';
import { adminClient } from '@/lib/supabase/admin';
import { agoIso, capReached, diskUsedRatio, isQuietHours, monthStart } from './helpers';

export { capReached, isQuietHours, monthStart } from './helpers';

const TICK_MS = 20_000;
const DAY = 24 * 3600_000;
const TZ = process.env.TZ || 'Asia/Colombo';

const log = (msg: string) => console.log(`[worker] ${new Date().toISOString()} ${msg}`);
// Only the error message is logged: never request bodies, phone numbers or keys.
const logErr = (what: string, e: unknown) => console.error(`[worker] ${what} failed:`, e instanceof Error ? e.message : 'unknown error');

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    logErr(name, e);
  }
}

// ---------------------------------------------------------------- (a) snaps
async function snapCleanup() {
  const db = adminClient();
  const { data, error } = await db
    .from('media_items')
    .select('id')
    .in('mode', ['once', 'timed'])
    .is('deleted_at', null)
    // Viewed snaps: images are already deleted when streamed; videos keep their link for up to 10 minutes.
    .or(`viewed_at.lt.${agoIso(11 * 60_000)},and(viewed_at.is.null,created_at.lt.${agoIso(DAY)})`)
    .limit(200);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    try {
      await deleteMediaBlobs(row.id as string);
      await db.from('media_items').update({ deleted_at: new Date().toISOString() }).eq('id', row.id);
    } catch (e) {
      logErr('delete snap', e);
    }
  }

  // Orphan files: on disk for over 24 h and no media_keys row.
  const store = snapStore();
  const old: string[] = [];
  for (const f of await store.list()) {
    try {
      const s = await stat(path.join(dataDir(), 'snaps', f));
      if (s.isFile() && Date.now() - s.mtimeMs > DAY) old.push(f);
    } catch {
      /* vanished meanwhile */
    }
  }
  if (!old.length) return;
  const { data: keys, error: kerr } = await db.from('media_keys').select('object_key').in('object_key', old);
  if (kerr) throw new Error(kerr.message);
  const known = new Set((keys ?? []).map((k) => k.object_key as string));
  for (const f of old) if (!known.has(f)) await store.delete(f).catch((e) => logErr('orphan delete', e));
}

// ---------------------------------------------------------------- (b) uploads
async function uploadCleanup() {
  const db = adminClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('upload_sessions')
    .select('id')
    .or(
      `and(expires_at.lt.${now},status.neq.processing),expires_at.lt.${agoIso(2 * 3600_000)},and(status.eq.failed,created_at.lt.${agoIso(10 * 60_000)}),and(status.eq.processing,created_at.lt.${agoIso(30 * 60_000)})`, // a crash mid-processing leaves 'processing' behind
    )
    .limit(100);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    try {
      await cleanupUploadSession(row.id as string);
      await db.from('upload_sessions').delete().eq('id', row.id);
    } catch (e) {
      logErr('cleanup upload', e);
    }
  }

  // Stale per-session temp dirs (tmp/uploads/<id>, tmp/work/<id>); never the parent folders themselves.
  for (const area of ['uploads', 'work']) {
    const base = path.join(dataDir(), 'tmp', area);
    let names: string[] = [];
    try {
      names = await readdir(base);
    } catch {
      continue; // not created yet
    }
    for (const n of names) {
      const p = path.join(base, n);
      try {
        const s = await stat(p);
        if (s.isDirectory() && Date.now() - s.mtimeMs > 2 * 3600_000) await rm(p, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------- (c) location
async function locationCleanup() {
  const db = adminClient();
  const wipe = { last_lat: null, last_lng: null, last_accuracy: null };
  const now = new Date().toISOString();
  const r1 = await db.from('location_shares').update({ status: 'expired', ...wipe }).eq('status', 'active').lt('expires_at', now);
  const r2 = await db.from('location_shares').update({ status: 'expired' }).eq('status', 'requested').lt('created_at', agoIso(10 * 60_000));
  const r3 = await db.from('location_shares').update(wipe).neq('status', 'active').not('last_lat', 'is', null);
  for (const r of [r1, r2, r3]) if (r.error) throw new Error(r.error.message);
}

// ---------------------------------------------------------------- (d) disk
let lastDiskWarn = 0;
async function diskCheck() {
  const s = await statfs(dataDir());
  const used = diskUsedRatio(Number(s.blocks), Number(s.bavail));
  if (used > 0.8 && Date.now() - lastDiskWarn > 3600_000) {
    lastDiskWarn = Date.now();
    console.warn(`[worker] WARNING disk is ${(used * 100).toFixed(0)}% used`);
  }
}

// ---------------------------------------------------------------- (e) SMS alerts
async function smsAlerts() {
  const db = adminClient();
  const { data: st, error } = await db.from('sms_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!st || !st.enabled || !st.api_url) return;
  if (isQuietHours(new Date(), st.quiet_start, st.quiet_end, TZ)) return;

  const { data: cands, error: cerr } = await db.rpc('sms_candidates', { p_offline_seconds: st.offline_after_seconds });
  if (cerr) throw new Error(cerr.message);
  if (!cands?.length) return;

  const { count: monthCount } = await db
    .from('sms_log')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'alert')
    .gte('sent_at', monthStart(new Date(), TZ));
  let sentThisMonth = monthCount ?? 0;

  for (const c of cands as { user_id: string; first_unread: string }[]) {
    const { count: dayCount } = await db
      .from('sms_log')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'alert')
      .eq('user_id', c.user_id)
      .gte('sent_at', agoIso(DAY));
    if (capReached({ sentToday: dayCount ?? 0, sentThisMonth, dailyCap: st.daily_cap, monthlyCap: st.monthly_cap })) continue;

    const { data: prof } = await db.from('profiles').select('phone_enc, sms_template').eq('id', c.user_id).maybeSingle();
    if (!prof?.phone_enc) continue;
    let res: { ok: boolean; status: string };
    try {
      res = await sendSms({
        to: decryptText(prof.phone_enc as string),
        text: (prof.sms_template as string | null) || st.template_text,
        userId: c.user_id,
        kind: 'alert',
        periodStartedAt: c.first_unread,
      });
    } catch (e) {
      logErr('send sms', e);
      res = { ok: false, status: 'error' };
    }
    const nowIso = new Date().toISOString();
    await db
      .from('presence_state')
      .upsert(
        res.ok
          ? { user_id: c.user_id, last_sms_at: nowIso, sms_sent_this_period: true }
          : { user_id: c.user_id, last_sms_at: nowIso },
        { onConflict: 'user_id' },
      );
    if (res.ok) sentThisMonth++;
  }
}

// ---------------------------------------------------------------- (f) push alerts
// One generic push per offline period to every phone the person turned notifications on for.
async function pushAlerts() {
  if (!pushConfigured()) return;
  const db = adminClient();
  const { data: st, error } = await db.from('push_settings').select('enabled,title,body,offline_after_seconds').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!st || !st.enabled) return;
  const { data: cands, error: cerr } = await db.rpc('push_candidates', { p_offline_seconds: st.offline_after_seconds });
  if (cerr) throw new Error(cerr.message);
  for (const c of (cands ?? []) as { user_id: string }[]) {
    const { data: subs } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', c.user_id);
    let anyOk = false;
    for (const s of subs ?? []) {
      const r = await sendPush(s as PushSub, { title: st.title as string, body: st.body as string });
      if (r === 'ok') anyOk = true;
      if (r === 'gone') await db.from('push_subscriptions').delete().eq('id', s.id);
    }
    const nowIso = new Date().toISOString();
    await db
      .from('presence_state')
      .upsert(anyOk ? { user_id: c.user_id, last_push_at: nowIso, push_sent_this_period: true } : { user_id: c.user_id, last_push_at: nowIso }, {
        onConflict: 'user_id',
      });
  }
}

// ---------------------------------------------------------------- loop
let stopping = false;
let timer: NodeJS.Timeout | undefined;
let running: Promise<void> = Promise.resolve();

async function tick() {
  await step('snap cleanup', snapCleanup);
  await step('upload cleanup', uploadCleanup);
  await step('location cleanup', locationCleanup);
  await step('disk check', diskCheck);
  await step('sms alerts', smsAlerts);
  await step('push alerts', pushAlerts);
}

function schedule() {
  if (stopping) return;
  timer = setTimeout(() => {
    running = tick().finally(schedule); // next run is scheduled only after this one ends: never overlaps
  }, TICK_MS);
}

function shutdown(sig: string) {
  log(`${sig} received, shutting down`);
  stopping = true;
  if (timer) clearTimeout(timer);
  const force = setTimeout(() => process.exit(1), 25_000);
  force.unref();
  void running.finally(() => process.exit(0));
}

// Only start when run as the entry point (the helpers above stay importable).
if (!process.env.VITEST) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  log('started');
  running = tick().finally(schedule);
}
