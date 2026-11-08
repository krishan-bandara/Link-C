import { decryptText } from '@/lib/crypto';
import { adminClient } from '@/lib/supabase/admin';
import { safeRequest } from '@/lib/ssrf';
import { gatewayRejected } from '@/lib/sms-response';

// No next/* imports here: this file is shared with the worker process.

export type SmsKind = 'alert' | 'test' | 'verify' | 'invite';

const E164 = /^\+[1-9]\d{7,14}$/;

export function validateE164(s: string): boolean {
  return E164.test(s);
}

/** +94771234567 -> +94••••••567 (never log or render a full number). */
export function maskPhone(s: string): string {
  if (s.length < 8) return '••••';
  return `${s.slice(0, 3)}${'•'.repeat(Math.max(s.length - 6, 3))}${s.slice(-3)}`;
}

/**
 * Cooldown between resets of a user's sms_chat_state triggered by a bare "came back online" heartbeat. Without this, a member
 * can call POST /api/presence every ~31-35 s (gap > the route's 25 s "came back" threshold, still inside its 60/min rate limit)
 * and get every chat's SMS round deleted on each call, re-triggering "SMS 1" as soon as they go offline again - burning the
 * shared daily pool. Opening the app for real still resets instantly in the common case: a genuine break is normally much
 * longer than this cooldown, and in the worst case the reset is only delayed, never skipped outright.
 */
export const SMS_CHAT_RESET_COOLDOWN_MS = 5 * 60_000;

const toMs = (v: string | number | Date | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * May a "came back online" heartbeat clear this user's sms_chat_state rows right now? Yes when there are no rows (nothing to
 * reset), or the most recent activity across all of them (first_at / last_sent_at / last_attempt_at - whichever is latest) is
 * further than the cooldown in the past. A future last_attempt_at (an active defer, e.g. cap reached) always counts as "too
 * recent", so a live backoff is never reset out from under it by a bare heartbeat either.
 */
export function heartbeatResetAllowed(
  rows: { first_at?: string | null; last_sent_at?: string | null; last_attempt_at?: string | null }[],
  nowMs: number,
  cooldownMs = SMS_CHAT_RESET_COOLDOWN_MS,
): boolean {
  if (!rows.length) return true;
  let mostRecent = -Infinity;
  for (const r of rows) {
    for (const v of [r.first_at, r.last_sent_at, r.last_attempt_at]) {
      const ms = toMs(v);
      if (ms !== null && ms > mostRecent) mostRecent = ms;
    }
  }
  if (mostRecent === -Infinity) return true; // rows exist but nothing has happened in them yet
  return nowMs - mostRecent >= cooldownMs;
}

// Calendar-day/month boundaries (local time), duplicated from worker/helpers.ts's dayStart/monthStart so this file - shared
// between the Next.js app and the worker process - stays free of any import that crosses into the worker/ directory.
const SMS_TZ = process.env.TZ || 'Asia/Colombo';
function localBoundaryIso(now: Date, tz: string, kind: 'day' | 'month'): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const localAsUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  const offset = localAsUtc - now.getTime();
  const utcBoundary = kind === 'day' ? Date.UTC(g('year'), g('month') - 1, g('day')) : Date.UTC(g('year'), g('month') - 1, 1);
  return new Date(utcBoundary - offset).toISOString();
}

const capValue = (v: unknown, fallback: number) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? fallback : Number(v));

export interface SmsSettingsPublic {
  enabled: boolean;
  provider: string;
  api_url: string | null;
  http_method: 'POST' | 'GET';
  request_format: 'json' | 'form' | 'query';
  body_template: string;
  headers_template: string;
  sender_id: string | null;
  template_text: string;
  offline_after_seconds: number;
  step2_after_minutes: number;
  /** Legacy, unused since the repeat schedule. */
  step3_after_minutes?: number;
  repeat_every_minutes: number;
  template_step2: string | null;
  template_step3: string | null;
  daily_cap: number;
  monthly_cap: number;
  quiet_start: string | null;
  quiet_end: string | null;
  updated_at: string;
  hasCredentials: boolean;
}

export async function getSmsSettingsPublic(): Promise<SmsSettingsPublic> {
  const { data, error } = await adminClient().from('sms_settings').select('*').eq('id', 1).single();
  if (error || !data) throw new Error('sms settings unavailable');
  const { credentials_enc, id: _id, ...rest } = data as Record<string, unknown> & { credentials_enc: string | null };
  void _id;
  const base = rest as Omit<SmsSettingsPublic, 'hasCredentials'>;
  return {
    ...base,
    // Older databases may lack the newer columns until the latest migration is applied.
    repeat_every_minutes: base.repeat_every_minutes ?? 10,
    step2_after_minutes: base.step2_after_minutes ?? 5,
    hasCredentials: !!credentials_enc,
  };
}

const PLACEHOLDER = /\{(to|text|sender|apiKey|apiSecret|basicAuth|toDigits)\}/g;
type Values = Record<'to' | 'text' | 'sender' | 'apiKey' | 'apiSecret' | 'basicAuth' | 'toDigits', string>;

const jsonEscape = (v: string) => JSON.stringify(v).slice(1, -1);

/** Single pass substitution so a value containing "{text}" is never expanded again. */
function fill(tpl: string, values: Values, esc: (v: string) => string): string {
  return tpl.replace(PLACEHOLDER, (_m, k: keyof Values) => esc(values[k]));
}

function shortError(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  const code = (e as { code?: string } | null)?.code;
  if (msg === 'timeout') return 'error timeout';
  if (code === 'EBLOCKED') return 'error blocked address';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'error dns';
  if (code === 'ETIMEDOUT') return 'error timeout';
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'ECONNREFUSED' || code === 'ECONNRESET') return 'error connection';
  if (/certificate|SSL|TLS/i.test(msg) || /CERT|SSL/.test(code ?? '')) return 'error tls';
  return 'error request failed';
}

async function logSms(userId: string | null, kind: SmsKind, status: string, periodStartedAt?: string) {
  const { error } = await adminClient()
    .from('sms_log')
    .insert({ user_id: userId, kind, provider_status: status, period_started_at: periodStartedAt ?? null });
  if (error) console.error('sms_log insert failed');
}

export async function sendSms(opts: {
  to: string;
  text: string;
  userId: string | null;
  kind: SmsKind;
  periodStartedAt?: string;
}): Promise<{ ok: boolean; status: string }> {
  const db = adminClient();
  const { data: s, error: settingsErr } = await db.from('sms_settings').select('*').eq('id', 1).single();
  if (settingsErr || !s) {
    await logSms(opts.userId, opts.kind, 'error settings unavailable', opts.periodStartedAt);
    return { ok: false, status: 'error settings unavailable' };
  }
  if (!s.enabled || !s.api_url) return { ok: false, status: 'sms disabled' };

  const fail = async (status: string) => {
    await logSms(opts.userId, opts.kind, status, opts.periodStartedAt);
    return { ok: false, status };
  };

  // The daily/monthly caps are ONE shared pool for every kind of SMS sent through this function (alerts, invites, test
  // messages, phone-verification codes) - not just alerts - so no path can bypass the owner's budget. Only successful sends
  // and ambiguous timeouts (which may have been delivered) count, same rule the worker uses for the alert loop.
  const now = new Date();
  const dailyCap = capValue(s.daily_cap, 75);
  const monthlyCap = capValue(s.monthly_cap, 300);
  const dayIso = localBoundaryIso(now, SMS_TZ, 'day');
  const monthIso = localBoundaryIso(now, SMS_TZ, 'month');
  const countSince = async (sinceIso: string, kindFilter?: 'non-alert') => {
    let okQ = db.from('sms_log').select('id', { count: 'exact', head: true }).like('provider_status', 'http 2%').gte('sent_at', sinceIso);
    let toQ = db.from('sms_log').select('id', { count: 'exact', head: true }).eq('provider_status', 'error timeout').gte('sent_at', sinceIso);
    if (kindFilter === 'non-alert') {
      okQ = okQ.neq('kind', 'alert');
      toQ = toQ.neq('kind', 'alert');
    }
    const { count: ok, error: okErr } = await okQ;
    if (okErr) throw new Error(okErr.message);
    const { count: to, error: toErr } = await toQ;
    if (toErr) throw new Error(toErr.message);
    return (ok ?? 0) + (to ?? 0);
  };
  let sentToday: number;
  let sentThisMonth: number;
  try {
    [sentToday, sentThisMonth] = await Promise.all([countSince(dayIso), countSince(monthIso)]);
  } catch {
    return fail('cap reached'); // a count that cannot be read fails closed, same as "cap reached"
  }
  if (sentToday >= dailyCap || sentThisMonth >= monthlyCap) return fail('cap reached');

  // Reserve most of the shared pool for real offline alerts: a member spamming self-service sends (phone verification,
  // or an owner's test send) must not be able to exhaust the whole daily budget and starve everyone else's alerts.
  // Non-alert kinds (verify/test/invite) together may use at most this smaller slice of today's cap.
  if (opts.kind !== 'alert') {
    const nonAlertCap = Math.max(5, Math.floor(dailyCap * 0.2));
    let sentNonAlertToday: number;
    try {
      sentNonAlertToday = await countSince(dayIso, 'non-alert');
    } catch {
      return fail('cap reached');
    }
    if (sentNonAlertToday >= nonAlertCap) return fail('cap reached');
  }

  if (!validateE164(opts.to)) return fail('error bad number');

  let creds: { apiKey?: string; apiSecret?: string } = {};
  try {
    if (s.credentials_enc) creds = JSON.parse(decryptText(s.credentials_enc));
  } catch {
    return fail('error credentials');
  }

  if (!creds.apiKey) return fail('error credentials');

  const values: Values = {
    to: opts.to,
    toDigits: opts.to.replace(/^\+/, ''), // 94771234567, for gateways that want no plus sign
    text: opts.text,
    sender: s.sender_id ?? '',
    apiKey: creds.apiKey ?? '',
    apiSecret: creds.apiSecret ?? '',
    // base64(apiKey:apiSecret) for HTTP Basic auth, e.g. Twilio: {"Authorization":"Basic {basicAuth}"}
    basicAuth: Buffer.from(`${creds.apiKey ?? ''}:${creds.apiSecret ?? ''}`).toString('base64'),
  };
  const format = s.request_format as 'json' | 'form' | 'query';

  let headers: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(fill(s.headers_template || '{}', values, jsonEscape));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('headers');
    headers = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== 'string' || /[\r\n]/.test(k + v)) throw new Error('headers');
      headers[k] = v;
    }
  } catch {
    return fail('error bad headers template');
  }

  let url = s.api_url as string;
  let body: string | undefined;
  const method = s.http_method as 'GET' | 'POST';
  if (format === 'json') {
    body = fill(s.body_template, values, jsonEscape);
    try {
      JSON.parse(body);
    } catch {
      return fail('error bad body template');
    }
    headers['Content-Type'] ??= 'application/json';
  } else {
    const qs = fill(s.body_template, values, encodeURIComponent);
    if (format === 'form' && method === 'POST') {
      body = qs;
      headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
    } else {
      url += (url.includes('?') ? '&' : '?') + qs.replace(/^[?&]/, '');
    }
  }
  if (method === 'GET') body = undefined;

  try {
    const res = await safeRequest(url, { method, headers, body, timeoutMs: 10_000 });
    if (res.status >= 200 && res.status < 300 && gatewayRejected(res.bodyText)) return fail('error gateway rejected');
    const status = `http ${res.status}`;
    await logSms(opts.userId, opts.kind, status, opts.periodStartedAt);
    return { ok: res.status >= 200 && res.status < 300, status };
  } catch (e) {
    return fail(shortError(e));
  }
}
