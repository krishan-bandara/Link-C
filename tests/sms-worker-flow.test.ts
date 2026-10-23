// End-to-end behaviour of the worker's SMS alert loop (worker/index.ts smsAlerts, driven by the real tick loop).
// smsAlerts/tick are not exported, so the module is imported with VITEST unset (it then starts its own 5 s loop),
// under fake timers, against an in-memory Supabase fake (tests/helpers/fake-supabase.ts) and a fake SMS gateway.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb, resetFakeDb, rows } from './helpers/fake-supabase';

type Gw = { mode: 'ok' | 'fail' | 'throw' | 'hang'; sent: { at: number; to: string; text: string }[]; attempts: number[]; onSend?: () => void };
const G = globalThis as unknown as { __gw?: Gw };
const gw = (): Gw => (G.__gw ??= { mode: 'ok', sent: [], attempts: [] });

vi.mock('@/lib/supabase/admin', async () => {
  const h = await import('./helpers/fake-supabase');
  const c = h.makeFakeClient();
  return { adminClient: () => c };
});
vi.mock('@/lib/sms', async () => {
  const h = await import('./helpers/fake-supabase');
  return {
    // Mirrors the real sendSms bookkeeping: one sms_log row per attempt with "http <status>".
    sendSms: async (o: { to: string; text: string; userId: string; kind: string; periodStartedAt?: string }) => {
      const g = (globalThis as unknown as { __gw: Gw }).__gw;
      g.attempts.push(Date.now());
      g.onSend?.();
      if (g.mode === 'hang') await new Promise(() => {}); // simulates the process dying mid-send
      if (g.mode === 'throw') throw new Error('boom');
      const status = g.mode === 'ok' ? 'http 200' : 'http 500';
      h.rows('sms_log').push({
        id: ++h.fakeDb().seq, user_id: o.userId, kind: o.kind, provider_status: status,
        period_started_at: o.periodStartedAt ?? null, sent_at: new Date().toISOString(),
      });
      if (g.mode === 'ok') g.sent.push({ at: Date.now(), to: o.to, text: o.text });
      return { ok: g.mode === 'ok', status };
    },
  };
});
// Real file I/O would not advance with fake timers, so housekeeping's fs calls are stubbed.
vi.mock('node:fs/promises', () => ({
  readdir: async () => [], rm: async () => {}, stat: async () => ({ isFile: () => false, isDirectory: () => false, mtimeMs: 0 }),
  statfs: async () => ({ blocks: 100, bavail: 90 }),
}));
vi.mock('@/lib/media', () => ({ cleanupUploadSession: async () => {}, deleteMediaBlobs: async () => {} }));
vi.mock('@/lib/push', () => ({ pushConfigured: () => false, sendPush: async () => 'ok' }));
vi.mock('@/lib/storage', async () => {
  const os = await import('node:os');
  return { dataDir: () => os.tmpdir(), snapStore: () => ({ list: async () => [], delete: async () => {} }) };
});

const MIN = 60_000;
const T0 = Date.parse('2026-10-15T06:00:00Z'); // 11:30 in Asia/Colombo, mid-month
const A = 'user-a';
const B = 'user-b';
const PHONE = '+94771234567';

function seed(opts: { settings?: Record<string, unknown>; phone?: string | null; offlineSince?: boolean } = {}) {
  resetFakeDb();
  const g = gw();
  g.mode = 'ok'; g.sent = []; g.attempts = []; g.onSend = undefined;
  rows('sms_settings').push({
    id: 1, enabled: true, api_url: 'https://gw.example/send', offline_after_seconds: 45, step2_after_minutes: 10,
    repeat_every_minutes: 19, daily_cap: 10, monthly_cap: 300, quiet_start: null, quiet_end: null,
    template_text: 'T1', template_step2: 'T2', template_step3: 'T3', ...opts.settings,
  });
  addMember(A, B, opts.phone === undefined ? PHONE : opts.phone, opts.offlineSince !== false);
}
// Member `id` has one unread message from `from`; presence row says they were last seen 60 s ago (offline).
function addMember(id: string, from: string, phone: string | null, withPresence = true) {
  rows('profiles').push({ id, login_disabled: false, sms_alerts_enabled: true, phone_enc: phone, sms_template: null });
  rows('conversations').push({ id: `c-${id}`, user_a: id, user_b: from });
  rows('messages').push({ id: `m-${id}`, conversation_id: `c-${id}`, sender_id: from, read_at: null, type: 'text', created_at: new Date(Date.now() - 2 * MIN).toISOString() });
  if (withPresence) rows('presence_state').push({ user_id: id, last_seen_at: new Date(Date.now() - 60_000).toISOString(), sms_step: 0, sms_sent_this_period: false, last_sms_at: null, sms_first_at: null, sms_last_sent_at: null });
}
// Same write as src/app/api/presence/route.ts
function heartbeat(id: string) {
  const p = rows('presence_state').find((r) => r.user_id === id)!;
  Object.assign(p, { last_seen_at: new Date().toISOString(), sms_sent_this_period: false, push_sent_this_period: false, sms_step: 0, sms_first_at: null, sms_last_sent_at: null, last_sms_at: null });
}
const pres = (id: string) => rows('presence_state').find((r) => r.user_id === id)!;
const logs = (status?: string) => rows('sms_log').filter((r) => !status || r.provider_status === status);

async function advance(totalMs: number) {
  for (let t = 0; t < totalMs; t += 5000) await vi.advanceTimersByTimeAsync(5000);
}
async function startWorker() {
  vi.resetModules();
  const prev = process.env.VITEST;
  delete process.env.VITEST; // the module only starts its loop when not under vitest
  try { await import('../worker/index'); } finally { process.env.VITEST = prev; }
  await vi.advanceTimersByTimeAsync(0); // first tick runs immediately at import time
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SMS escalation schedule', () => {
  it('sends SMS 1 at once, SMS 2 after 10 min, then every 19 min, never twice for one step', async () => {
    seed();
    await startWorker();
    await advance(50 * MIN);
    const at = gw().sent.map((s) => Math.round((s.at - T0) / 1000));
    expect(at).toEqual([0, 10 * 60, 29 * 60, 48 * 60]);
    expect(gw().sent.map((s) => s.text)).toEqual(['T1', 'T2', 'T3', 'T3']);
    expect(gw().sent.every((s) => s.to === PHONE)).toBe(true);
    expect(gw().attempts.length).toBe(4); // exactly one gateway call per step
    expect(pres(A).sms_step).toBe(4);
  });

  it('a heartbeat resets the sequence; going offline again restarts at SMS 1', async () => {
    seed();
    await startWorker();
    await advance(12 * MIN); // SMS 1 and SMS 2 sent
    expect(gw().sent.length).toBe(2);
    heartbeat(A);
    expect(pres(A).sms_step).toBe(0);
    await advance(40_000); // still "online" (under 45 s)
    expect(gw().sent.length).toBe(2);
    await advance(10_000); // offline again, same unread message: new period starts with SMS 1
    expect(gw().sent.length).toBe(3);
    expect(gw().sent[2].text).toBe('T1');
    await advance(10 * MIN);
    expect(gw().sent.length).toBe(4);
    expect(gw().sent[3].text).toBe('T2');
  });

  it('a heartbeat during the gateway call wins: the step is not advanced', async () => {
    seed();
    gw().onSend = () => heartbeat(A);
    await startWorker();
    await advance(10_000);
    expect(pres(A).sms_step).toBe(0);
    expect(pres(A).sms_first_at).toBeNull();
    expect(pres(A).sms_last_sent_at).toBeNull();
  });

  it('users are independent: one heartbeat does not reset another person', async () => {
    seed();
    addMember(B, A, '+94779999999');
    await startWorker();
    await advance(2 * MIN);
    expect(gw().sent.length).toBe(2);
    heartbeat(B);
    await advance(10 * MIN);
    expect(gw().sent.filter((s) => s.to === PHONE).map((s) => s.text)).toEqual(['T1', 'T2']);
    expect(gw().sent.filter((s) => s.to === '+94779999999').map((s) => s.text)).toEqual(['T1', 'T1']); // reset, offline again
  });

  it('a member with no presence row gets exactly one SMS 1 (after the 45 s offline window)', async () => {
    seed({ offlineSince: false });
    await startWorker();
    await advance(2 * MIN);
    expect(gw().sent.length).toBe(1);
    expect(gw().sent[0].at - T0).toBeLessThanOrEqual(60_000);
  });

  it('does nothing when SMS is disabled or has no gateway URL', async () => {
    seed({ settings: { enabled: false } });
    await startWorker();
    await advance(5 * MIN);
    expect(gw().attempts.length).toBe(0);
    rows('sms_settings')[0].enabled = true;
    rows('sms_settings')[0].api_url = null;
    await advance(5 * MIN);
    expect(gw().attempts.length).toBe(0);
  });
});

describe('caps (only http 2% rows count)', () => {
  const logRow = (user: string, status: string, ago: number) =>
    rows('sms_log').push({ id: ++fakeDb().seq, user_id: user, kind: 'alert', provider_status: status, sent_at: new Date(Date.now() - ago).toISOString() });

  it('daily cap 10 is ONE shared pool: 10 successes today (any members) block everyone; a "cap reached" row is written and the person deferred', async () => {
    seed();
    for (let i = 0; i < 6; i++) logRow(A, 'http 200', (i + 1) * MIN);
    for (let i = 0; i < 4; i++) logRow(B, 'http 200', (i + 1) * MIN); // other members count toward the same pool
    await startWorker();
    await advance(5 * MIN);
    expect(gw().attempts.length).toBe(0);
    expect(logs('cap reached').length).toBe(1); // not written every tick
    expect(Date.parse(pres(A).last_sms_at) - Date.now()).toBeGreaterThan(0); // deferred into the future
    expect(pres(A).sms_step).toBe(0);
    await advance(6 * MIN);
    expect(logs('cap reached').length).toBe(2); // looked again after about 10 minutes
    expect(gw().attempts.length).toBe(0);
  });

  it('daily pool ignores failures and yesterday: 8 + 1 ok today allow one more SMS, then the pool is used up', async () => {
    seed();
    for (let i = 0; i < 8; i++) logRow(A, 'http 200', (i + 1) * MIN);
    logRow(B, 'http 200', MIN); // someone else uses the same pool: 9 today
    for (let i = 0; i < 20; i++) logRow(A, 'http 500', MIN); // failures never count
    for (let i = 0; i < 20; i++) logRow(A, 'http 200', 25 * 3600_000); // yesterday (before local midnight) does not count
    await startWorker();
    await advance(10_000);
    expect(gw().sent.length).toBe(1); // the 10th SMS today
    await advance(11 * MIN); // SMS 2 would be the 11th: the shared pool is used up
    expect(gw().sent.length).toBe(1);
  });

  it('monthly cap 300: blocked at 300 successes this month, allowed at 299, failures and last month ignored', async () => {
    seed();
    const other = (n: number, status: string, ago: number) => { for (let i = 0; i < n; i++) logRow('someone', status, ago); };
    other(299, 'http 200', 3 * 24 * 3600_000); // 12 Oct: this month, outside the 24 h window
    other(50, 'http 500', 3 * 24 * 3600_000);
    other(100, 'http 200', 20 * 24 * 3600_000); // 25 Sep: last month
    await startWorker();
    await advance(10_000);
    expect(gw().sent.length).toBe(1); // 299 -> allowed (now 300)
    await advance(11 * MIN);
    expect(gw().sent.length).toBe(1); // SMS 2 blocked by the monthly cap
  });
});

describe('unreadable or missing phone', () => {
  it.each([
    ['v1:not-decryptable', 'error phone unreadable'],
    ['not a number', 'error phone unreadable'],
    ['', 'error no phone'],
  ])('phone %j: no SMS, an sms_log row, deferred about 10 minutes', async (phone, status) => {
    seed({ phone });
    await startWorker();
    await advance(5 * MIN);
    expect(gw().attempts.length).toBe(0);
    expect(logs(status).length).toBe(1); // not spammed every tick
    expect(logs().every((l) => l.kind === 'alert' && l.user_id === A)).toBe(true);
    await advance(6 * MIN);
    expect(logs(status).length).toBe(2); // tried again after about 10 min
    expect(gw().attempts.length).toBe(0);
  });

  it('recovers once the owner fixes the number', async () => {
    seed({ phone: 'garbage' });
    await startWorker();
    await advance(MIN);
    rows('profiles')[0].phone_enc = PHONE;
    await advance(10 * MIN);
    expect(gw().sent.length).toBe(1);
    expect(gw().sent[0].text).toBe('T1');
  });
});

describe('gateway failures', () => {
  it('rolls the step back on failure and retries after 2 minutes until it works', async () => {
    seed();
    gw().mode = 'fail';
    await startWorker();
    await advance(4 * MIN + 30_000);
    expect(gw().attempts.map((t) => Math.round((t - T0) / 1000))).toEqual([0, 120, 240]);
    expect(pres(A).sms_step).toBe(0);
    expect(pres(A).sms_first_at).toBeNull();
    expect(pres(A).sms_last_sent_at).toBeNull();
    expect(pres(A).sms_sent_this_period).toBe(false);
    expect(logs('http 500').length).toBe(3);
    gw().mode = 'ok';
    await advance(2 * MIN);
    expect(gw().sent.length).toBe(1);
    expect(Math.round((gw().sent[0].at - T0) / 1000)).toBe(360);
    expect(pres(A).sms_step).toBe(1);
    // SMS 2 is 10 min after the SUCCESSFUL first SMS
    await advance(9 * MIN);
    expect(gw().sent.length).toBe(1);
    await advance(MIN);
    expect(gw().sent.length).toBe(2);
    expect(gw().sent[1].text).toBe('T2');
  });

  it('a thrown gateway error is logged ("error send failed"), rolled back and retried after 2 minutes', async () => {
    seed();
    gw().mode = 'throw';
    await startWorker();
    await advance(2 * MIN + 10_000);
    expect(gw().attempts.length).toBe(2);
    expect(logs('error send failed').length).toBe(2);
    expect(pres(A).sms_step).toBe(0);
    gw().mode = 'ok';
    await advance(2 * MIN);
    expect(gw().sent.length).toBe(1);
  });

  it('5 failures within an hour: backs off 30 minutes instead of 2', async () => {
    seed();
    gw().mode = 'fail';
    await startWorker();
    await advance(20 * MIN);
    expect(gw().attempts.map((t) => Math.round((t - T0) / 1000))).toEqual([0, 120, 240, 360, 480]);
    expect(pres(A).sms_step).toBe(0);
    await advance(17 * MIN);
    expect(gw().attempts.length).toBe(5); // still waiting (480 s + 30 min = 2280 s)
    gw().mode = 'ok';
    await advance(2 * MIN);
    expect(gw().sent.length).toBe(1);
    expect(Math.round((gw().sent[0].at - T0) / 1000)).toBe(2280);
  });

  it('failed attempts never count toward the daily cap', async () => {
    seed();
    for (let i = 0; i < 20; i++) rows('sms_log').push({ id: ++fakeDb().seq, user_id: A, kind: 'alert', provider_status: 'http 500', sent_at: new Date(Date.now() - 5 * MIN).toISOString() });
    gw().mode = 'fail';
    await startWorker();
    await advance(10_000);
    expect(gw().attempts.length).toBe(1); // sent anyway (cap not reached), failed
    expect(logs('cap reached').length).toBe(0);
    gw().mode = 'ok';
    await advance(31 * MIN); // 21+ failures in the hour: 30 minute backoff
    expect(gw().sent.length).toBe(1);
  });

  it('a heartbeat between the claim and the rollback wins: the reset is not undone', async () => {
    seed();
    gw().mode = 'fail';
    gw().onSend = () => heartbeat(A);
    await startWorker();
    await advance(10_000);
    expect(gw().attempts.length).toBe(1);
    expect(pres(A).sms_step).toBe(0);
    expect(pres(A).sms_first_at).toBeNull();
    expect(pres(A).sms_last_sent_at).toBeNull();
  });
});

describe('claim and crash safety', () => {
  it('two workers racing for the same candidate: only one SMS is sent', async () => {
    seed();
    await startWorker();
    await startWorker(); // a second, independent worker process
    await advance(9 * MIN + 30_000);
    expect(gw().sent.length).toBe(1);
    expect(gw().attempts.length).toBe(1);
    expect(pres(A).sms_step).toBe(1);
    await advance(MIN);
    expect(gw().sent.map((x) => x.text)).toEqual(['T1', 'T2']); // and only one for step 2 as well
  });

  it('the advance is persisted before the send: a crash mid-send never repeats SMS 1', async () => {
    seed();
    gw().mode = 'hang';
    let stepDuringSend = -1;
    gw().onSend = () => { stepDuringSend = pres(A).sms_step; };
    await startWorker();
    await advance(5_000);
    expect(gw().attempts.length).toBe(1);
    expect(stepDuringSend).toBe(1); // already claimed and advanced while the gateway call is in flight
    // the process dies here: its tick is stuck in the gateway call and never schedules again
    gw().mode = 'ok';
    gw().onSend = undefined;
    await startWorker(); // restart
    await advance(9 * MIN);
    expect(gw().sent.map((x) => [x.text, x.at - T0])).toEqual([]); // no repeat of SMS 1
    await advance(2 * MIN);
    expect(gw().sent.map((x) => x.text)).toEqual(['T2']);
  });

  it('a person who is not due causes no sms_log count queries', async () => {
    seed();
    await startWorker();
    await advance(5_000);
    expect(gw().sent.length).toBe(1);
    const mark = fakeDb().log.length;
    await advance(5 * MIN); // SMS 2 not due yet
    expect(fakeDb().log.slice(mark).filter((q) => q === 'select:sms_log')).toEqual([]);
    expect(gw().sent.length).toBe(1);
  });

  it('a person who came back online cannot be claimed (no SMS)', async () => {
    seed();
    rows('presence_state')[0].last_seen_at = new Date(Date.now() - 10_000).toISOString(); // seen 10 s ago
    await startWorker();
    await advance(30_000);
    expect(gw().attempts.length).toBe(0);
  });
});

describe('quiet hours', () => {
  it('sends nothing during quiet hours, then sends when they end', async () => {
    // 11:30 local now; quiet 11:30 -> 11:40 local
    seed({ settings: { quiet_start: '11:30:00', quiet_end: '11:40:00' } });
    await startWorker();
    await advance(9 * MIN + 30_000);
    expect(gw().attempts.length).toBe(0);
    await advance(MIN);
    expect(gw().sent.length).toBe(1);
    expect(gw().sent[0].text).toBe('T1');
  });

  it('quiet hours crossing midnight (22:00 -> 07:00) block a 23:00 local start', async () => {
    vi.setSystemTime(Date.parse('2026-10-15T17:30:00Z')); // 23:00 local
    seed({ settings: { quiet_start: '22:00:00', quiet_end: '07:00:00' } });
    await startWorker();
    await advance(30 * MIN);
    expect(gw().attempts.length).toBe(0);
  });
});
