import { readdir, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import type { Dnd } from '@/lib/chatprefs';
import { readPhone } from '@/lib/phone';
import { cleanupUploadSession, deleteMediaBlobs } from '@/lib/media';
import { sendSms } from '@/lib/sms';
import { pushConfigured, sendPush, type PushSub } from '@/lib/push';
import { dataDir, snapStore } from '@/lib/storage';
import { adminClient } from '@/lib/supabase/admin';
import { storageStatsStep } from './storage-stats';
import { agoIso, alertAllowed, capReached, dayStart, diskUsedRatio, isQuietHours, monthStart, smsDue, smsTextFor } from './helpers';

export { capReached, dayStart, isQuietHours, monthStart, smsDue, smsTextFor } from './helpers';

const TICK_MS = 5_000; // alerts are checked every 5 s; housekeeping only every 20 s
const HOUSEKEEPING_MS = 20_000;
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
type SmsCand = {
  user_id: string;
  first_unread: string;
  step: number;
  sms_first_at: string | null;
  sms_last_sent_at: string | null;
  last_sms_at: string | null;
};

async function traceFailure(userId: string, status: string, periodStartedAt: string) {
  const { error } = await adminClient()
    .from('sms_log')
    .insert({ user_id: userId, kind: 'alert', provider_status: status, period_started_at: periodStartedAt });
  if (error) logErr('sms_log insert', new Error(error.message));
}

const EPOCH = '1970-01-01T00:00:00.000Z';

/** A presence row must exist before it can be updated. A new row looks long offline (not "seen just now"). Existing rows are untouched. */
async function ensurePresenceRow(userId: string) {
  const { error } = await adminClient()
    .from('presence_state')
    .upsert({ user_id: userId, last_seen_at: EPOCH }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (error) logErr('presence row', new Error(error.message));
}

/**
 * Stops this person being a due candidate for `ms` milliseconds. last_sms_at is also the retry-spacing marker: writing it
 * `ms - 60 s` into the future blocks the next attempt until `ms` from now. A heartbeat clears it again.
 */
async function deferPerson(userId: string, ms: number) {
  await ensurePresenceRow(userId);
  const { error } = await adminClient()
    .from('presence_state')
    .update({ last_sms_at: new Date(Date.now() + Math.max(0, ms - 60_000)).toISOString() })
    .eq('user_id', userId);
  if (error) logErr('defer sms', new Error(error.message));
}

/** Do-not-disturb settings (Colombo time) for the given people. People without a row have DND off. A read error stops the alert run (fail closed). */
async function loadDnd(userIds: string[]): Promise<Map<string, Dnd>> {
  const out = new Map<string, Dnd>();
  if (!userIds.length) return out;
  const { data, error } = await adminClient().from('user_prefs').select('user_id,dnd_on,dnd_from,dnd_to').in('user_id', userIds);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) out.set(r.user_id as string, { on: !!r.dnd_on, from: String(r.dnd_from ?? ''), to: String(r.dnd_to ?? '') });
  return out;
}

const positive = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const capValue = (v: unknown, fallback: number) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? fallback : Number(v));

async function smsAlerts() {
  const db = adminClient();
  const { data: st, error } = await db.from('sms_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!st || !st.enabled || !st.api_url) return;
  let quiet = false;
  try {
    quiet = isQuietHours(new Date(), st.quiet_start, st.quiet_end, TZ);
  } catch (e) {
    logErr('quiet hours (check TZ)', e); // a bad TZ must not stop alerts
  }
  if (quiet) return;

  const step2Minutes = positive(st.step2_after_minutes, 10);
  const repeatMinutes = positive(st.repeat_every_minutes, 19);
  const offlineSeconds = Math.max(30, positive(st.offline_after_seconds, 45));
  const dailyCap = capValue(st.daily_cap, 75);
  const monthlyCap = capValue(st.monthly_cap, 300);

  const { data: cands, error: cerr } = await db.rpc('sms_candidates_v2', { p_offline_seconds: offlineSeconds });
  if (cerr) throw new Error(cerr.message);
  // Muted chats are already excluded by sms_candidates_v2. People inside their Do-not-disturb hours are skipped WITHOUT touching
  // step, last attempt or caps: they stay candidates, and one alert follows when the quiet hours end (if still unread and offline).
  const dnd = await loadDnd(((cands ?? []) as SmsCand[]).map((c) => c.user_id));
  const nowDate = new Date();
  const due = ((cands ?? []) as SmsCand[]).filter((c) =>
    alertAllowed({ dnd: dnd.get(c.user_id), now: nowDate }) &&
    smsDue({
      step: c.step ?? 0,
      firstSentAt: c.sms_first_at,
      lastSentAt: c.sms_last_sent_at,
      lastAttemptAt: c.last_sms_at,
      nowMs: Date.now(),
      step2Minutes,
      repeatMinutes,
    }),
  );
  if (!due.length) return;

  // Only successful sends count toward the caps; failed attempts do not. If a count cannot be read, send nothing (fail closed).
  const { count: monthCount, error: mErr } = await db
    .from('sms_log')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'alert')
    .like('provider_status', 'http 2%')
    .gte('sent_at', monthStart(new Date(), TZ));
  if (mErr) throw new Error(mErr.message);
  let sentThisMonth = monthCount ?? 0;

  // The daily count is ONE shared pool for all members together (an umbrella), counted per calendar day in the local time zone.
  const { count: todayCount, error: tErr } = await db
    .from('sms_log')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'alert')
    .like('provider_status', 'http 2%')
    .gte('sent_at', dayStart(new Date(), TZ));
  if (tErr) throw new Error(tErr.message);
  let sentToday = todayCount ?? 0;

  for (const c of due) {
    const step = c.step ?? 0;

    if (capReached({ sentToday, sentThisMonth, dailyCap, monthlyCap })) {
      await traceFailure(c.user_id, 'cap reached', c.first_unread); // visible in Admin > SMS, written at most every ~10 minutes
      await deferPerson(c.user_id, 10 * 60_000);
      continue;
    }

    // Read the number BEFORE claiming so an unreadable number does not look like a send attempt.
    const { data: prof } = await db.from('profiles').select('phone_enc, sms_template').eq('id', c.user_id).maybeSingle();
    const phone = readPhone(prof?.phone_enc as string | null | undefined);
    if (!phone) {
      const why = prof?.phone_enc ? 'error phone unreadable' : 'error no phone';
      logErr('send sms', new Error(why));
      await traceFailure(c.user_id, why, c.first_unread);
      await deferPerson(c.user_id, 10 * 60_000);
      continue;
    }

    // CLAIM AND ADVANCE in one atomic update. It only matches if nothing changed since the candidate list was read: same step, same
    // last attempt time (so a second worker cannot also claim it) and the person is still offline. Advancing before the send means
    // a crash or a failed follow-up write can never repeat the SMS; a definite send failure rolls the step back below.
    await ensurePresenceRow(c.user_id);
    const claimAt = new Date().toISOString();
    let claim = db
      .from('presence_state')
      .update({
        last_sms_at: claimAt,
        sms_sent_this_period: true,
        sms_step: step + 1,
        sms_last_sent_at: claimAt,
        ...(step === 0 ? { sms_first_at: claimAt } : {}),
      })
      .eq('user_id', c.user_id)
      .eq('sms_step', step)
      .lt('last_seen_at', new Date(Date.now() - offlineSeconds * 1000).toISOString());
    claim = c.last_sms_at ? claim.eq('last_sms_at', c.last_sms_at) : claim.is('last_sms_at', null);
    const { data: claimed, error: claimErr } = await claim.select('user_id');
    if (claimErr) {
      logErr('sms claim', new Error(claimErr.message));
      continue;
    }
    if (!claimed?.length) continue; // someone else took it, or the person came back online

    let res: { ok: boolean; status: string };
    try {
      res = await sendSms({
        to: phone,
        text: smsTextFor(step, { sms_template: prof?.sms_template as string | null }, st),
        userId: c.user_id,
        kind: 'alert',
        periodStartedAt: c.first_unread,
      });
    } catch (e) {
      logErr('send sms', e);
      await traceFailure(c.user_id, 'error send failed', c.first_unread);
      res = { ok: false, status: 'error send failed' };
    }

    if (res.ok) {
      sentThisMonth++;
      sentToday++;
      continue;
    }

    // Definite failure: undo the advance (unless the person came back meanwhile: a heartbeat reset wins) and back off.
    const { error: rbErr } = await db
      .from('presence_state')
      .update({
        sms_step: step,
        sms_last_sent_at: c.sms_last_sent_at,
        sms_first_at: c.sms_first_at,
        sms_sent_this_period: step > 0,
      })
      .eq('user_id', c.user_id)
      .eq('sms_step', step + 1)
      .eq('sms_last_sent_at', claimAt);
    if (rbErr) logErr('sms rollback', new Error(rbErr.message));
    const { count: failCount } = await db
      .from('sms_log')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'alert')
      .eq('user_id', c.user_id)
      .not('provider_status', 'like', 'http 2%')
      .gte('sent_at', agoIso(3600_000));
    await deferPerson(c.user_id, (failCount ?? 0) >= 5 ? 30 * 60_000 : 2 * 60_000);
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
  const pushCands = (cands ?? []) as { user_id: string }[];
  const dnd = await loadDnd(pushCands.map((c) => c.user_id));
  for (const c of pushCands) {
    // Do-not-disturb: skip without touching last_push_at, so one push goes out when quiet hours end (muted chats are filtered in SQL).
    if (!alertAllowed({ dnd: dnd.get(c.user_id) })) continue;
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

let lastHousekeeping = 0;
async function tick() {
  // SMS first: slow housekeeping (blob deletions, file sweeps) must never delay an alert.
  await step('sms alerts', smsAlerts);
  if (Date.now() - lastHousekeeping >= HOUSEKEEPING_MS) {
    lastHousekeeping = Date.now();
    await step('snap cleanup', snapCleanup);
    await step('upload cleanup', uploadCleanup);
    await step('location cleanup', locationCleanup);
    await step('disk check', diskCheck);
    await step('storage stats', storageStatsStep);
  }
  // Push alerts are off (SMS is the alert channel). Set PUSH_ALERTS=1 in the env file to turn them back on.
  if (process.env.PUSH_ALERTS === '1') await step('push alerts', pushAlerts);
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
