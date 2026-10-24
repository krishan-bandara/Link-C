// Pure helpers for the worker (no I/O, so they can be unit tested).
import { inQuietHours, isMuted, type Dnd } from '@/lib/chatprefs';

/** Minutes since local midnight in the given IANA time zone. */
export function localMinutes(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/** "HH:MM" or "HH:MM:SS" (Postgres time) -> minutes since midnight, or null. */
export function parseTime(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/** True when `now` falls in [start, end). Handles ranges that cross midnight (22:00 -> 07:00). */
export function isQuietHours(now: Date, start: string | null, end: string | null, tz = 'Asia/Colombo'): boolean {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null || s === e) return false;
  const cur = localMinutes(now, tz);
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

/** Which SMS cap (if any) blocks sending. */
export function capReached(o: {
  sentToday: number;
  sentThisMonth: number;
  dailyCap: number;
  monthlyCap: number;
}): 'daily' | 'monthly' | null {
  if (o.sentToday >= o.dailyCap) return 'daily';
  if (o.sentThisMonth >= o.monthlyCap) return 'monthly';
  return null;
}

/** ISO timestamp of the start of the current calendar month in the given time zone. */
export function monthStart(now: Date, tz = 'Asia/Colombo'): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const localAsUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(g('year'), g('month') - 1, 1) - offset).toISOString();
}

/** ISO timestamp of the start (local midnight) of the current calendar day in the given time zone. */
export function dayStart(now: Date, tz = 'Asia/Colombo'): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const localAsUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(g('year'), g('month') - 1, g('day')) - offset).toISOString();
}

/** Usage ratio 0..1 from statfs numbers. */
export function diskUsedRatio(blocks: number, bavail: number): number {
  return blocks > 0 ? 1 - bavail / blocks : 0;
}

export const agoIso = (ms: number, now = Date.now()) => new Date(now - ms).toISOString();

const toMs = (v: string | number | Date | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Is the next SMS due? step 0: now. step 1: step2Minutes after the first SMS.
 * step >= 2: repeatMinutes after the previous successful SMS.
 * Never within retrySpacingMs of the last attempt (a future lastAttemptAt = deferred). Missing/invalid dates fail closed.
 */
export function smsDue(o: {
  step: number | null | undefined;
  firstSentAt: string | number | Date | null | undefined;
  lastSentAt: string | number | Date | null | undefined;
  lastAttemptAt: string | number | Date | null | undefined;
  nowMs: number;
  step2Minutes: number;
  repeatMinutes: number;
  retrySpacingMs?: number;
}): boolean {
  const { nowMs } = o;
  if (!Number.isFinite(nowMs)) return false;
  const step = o.step ?? 0;
  if (!Number.isInteger(step) || step < 0) return false;
  const spacing = o.retrySpacingMs ?? 60_000;
  if (o.lastAttemptAt !== null && o.lastAttemptAt !== undefined && o.lastAttemptAt !== '') {
    const att = toMs(o.lastAttemptAt);
    if (att === null) return false;
    if (nowMs - att < spacing) return false;
  }
  if (step === 0) return true;
  if (step === 1) {
    const first = toMs(o.firstSentAt);
    if (first === null || !(o.step2Minutes > 0)) return false;
    return nowMs >= first + o.step2Minutes * 60_000;
  }
  const last = toMs(o.lastSentAt);
  if (last === null || !(o.repeatMinutes > 0)) return false;
  return nowMs >= last + o.repeatMinutes * 60_000;
}

/** Text for this SMS: member override > step text > default text. */
export function smsTextFor(
  step: number,
  member: { sms_template?: string | null } | null | undefined,
  settings: { template_text: string; template_step2?: string | null; template_step3?: string | null },
): string {
  const stepText = step <= 0 ? null : step === 1 ? settings.template_step2 : settings.template_step3;
  return member?.sms_template || stepText || settings.template_text;
}

/**
 * May this person get a push or SMS alert right now? Only if at least one UNREAD incoming message sits in a chat that is not
 * muted for them (`unreadMutedUntil` = chat_prefs.muted_until per unread message's chat, null when no pref; omit to skip the
 * mute check, e.g. when the database already filtered) AND they are outside their Do-not-disturb hours (Colombo time).
 */
export function alertAllowed(o: {
  unreadMutedUntil?: (string | null)[];
  dnd: Dnd | null | undefined;
  now?: Date;
}): boolean {
  const now = o.now ?? new Date();
  if (inQuietHours(o.dnd, now)) return false;
  if (o.unreadMutedUntil && !o.unreadMutedUntil.some((m) => !isMuted(m, now.getTime()))) return false;
  return true;
}
