// Pure helpers for the worker (no I/O, so they can be unit tested).

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

/** Usage ratio 0..1 from statfs numbers. */
export function diskUsedRatio(blocks: number, bavail: number): number {
  return blocks > 0 ? 1 - bavail / blocks : 0;
}

export const agoIso = (ms: number, now = Date.now()) => new Date(now - ms).toISOString();
