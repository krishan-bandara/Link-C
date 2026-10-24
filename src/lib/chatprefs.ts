// Mute and Do-not-disturb rules shared by the browser, the server and the worker (no next/* imports).
// A chat can be muted for a while or until unmuted; a member can also have daily quiet hours (Colombo time).
// Muted chats and quiet hours silence push, sounds and the offline SMS. Messages still arrive and still show unread badges.
export const COLOMBO_TZ = 'Asia/Colombo';

export type ChatPref = { mutedUntil: string | null; starred: boolean };
export type Dnd = { on: boolean; from: string; to: string };

export const MUTE_OPTIONS = [
  { id: '8h', label: '8 hours', ms: 8 * 3600_000 },
  { id: '1w', label: '1 week', ms: 7 * 86_400_000 },
  { id: 'always', label: 'Until I unmute', ms: Infinity },
] as const;
export type MuteOptionId = (typeof MUTE_OPTIONS)[number]['id'];

/** Value for set_chat_mute: an ISO time, the text 'infinity' (until unmuted), or null (unmute). */
export function muteUntilValue(id: MuteOptionId | 'off', now = Date.now()): string | null {
  if (id === 'off') return null;
  const o = MUTE_OPTIONS.find((m) => m.id === id);
  if (!o) return null;
  return o.ms === Infinity ? 'infinity' : new Date(now + o.ms).toISOString();
}

/** True while a chat is muted. Accepts what the database returns: null, 'infinity' or a timestamp. */
export function isMuted(mutedUntil: string | null | undefined, now = Date.now()): boolean {
  if (!mutedUntil) return false;
  if (mutedUntil === 'infinity') return true;
  const t = Date.parse(mutedUntil);
  return Number.isFinite(t) && t > now;
}

/** Short text such as "Muted until 18:30", "Muted for a while" or "Muted". Empty when not muted. */
export function muteLabel(mutedUntil: string | null | undefined, now = Date.now(), tz = COLOMBO_TZ): string {
  if (!isMuted(mutedUntil, now)) return '';
  if (mutedUntil === 'infinity') return 'Muted';
  const d = new Date(mutedUntil as string);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' });
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = day.format(d) === day.format(new Date(now));
  return `Muted until ${sameDay ? '' : day.format(d) + ' '}${hm.format(d)}`;
}

/** 'HH:MM' to minutes after midnight, or null when malformed. */
export function parseHm(s: string | null | undefined): number | null {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(s ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutes after midnight in the given time zone. */
export function minutesOfDay(date: Date, tz = COLOMBO_TZ): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/** Are we inside the member's quiet hours right now? Wraps past midnight (22:00 to 07:00). Equal times mean never. */
export function inQuietHours(dnd: Dnd | null | undefined, now = new Date(), tz = COLOMBO_TZ): boolean {
  if (!dnd?.on) return false;
  const from = parseHm(dnd.from);
  const to = parseHm(dnd.to);
  if (from === null || to === null || from === to) return false;
  const t = minutesOfDay(now, tz);
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/** One question for every sender of noise: should this chat make a sound or send an alert right now? */
export function isQuiet(pref: { mutedUntil: string | null } | null | undefined, dnd: Dnd | null | undefined, now = new Date()): boolean {
  return isMuted(pref?.mutedUntil, now.getTime()) || inQuietHours(dnd, now);
}
