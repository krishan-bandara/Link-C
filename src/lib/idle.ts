// Inactivity logout, shared by the browser, the server routes and the Edge middleware (Web Crypto only).
//
// The browser enforces the exact limit (IDLE_MS) with a timer and a warning. The server enforces a backstop:
// every request is checked against a signed "last activity" cookie, so closing the tab, a sleeping laptop or a
// copied session cookie cannot keep a session alive longer than SERVER_MAX_IDLE_MS.
export const IDLE_MS = 60_000; // sign out after 1 minute without any user activity
export const WARN_BEFORE_MS = 15_000; // show "still there?" for the last 15 seconds
export const SERVER_MAX_IDLE_MS = 90_000; // server backstop: IDLE_MS plus slack for throttled pings
export const PING_EVERY_MS = 10_000; // how often the browser tells the server the user is active
export const ACTIVITY_COOKIE = 'lc-act';

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function secret(): string {
  const s = process.env.SIGNING_KEY ?? '';
  if (s.length < 32) throw new Error('SIGNING_KEY is not configured');
  return s;
}

/** "<timestamp>.<signature>" bound to the user, so one person's cookie is useless for another. */
export async function makeActivityCookie(userId: string, now = Date.now()): Promise<string> {
  return `${now}.${await sign(secret(), `act:${userId}:${now}`)}`;
}

/** True only for a genuine cookie of this user that is recent enough. Never throws. */
export async function checkActivityCookie(
  value: string | undefined | null,
  userId: string,
  now = Date.now(),
  maxIdleMs = SERVER_MAX_IDLE_MS,
): Promise<boolean> {
  try {
    if (!value) return false;
    const dot = value.indexOf('.');
    if (dot < 1) return false;
    const ts = Number(value.slice(0, dot));
    if (!Number.isFinite(ts) || ts > now + 5_000 || now - ts > maxIdleMs) return false;
    const expected = await sign(secret(), `act:${userId}:${ts}`);
    const given = value.slice(dot + 1);
    if (given.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}
