// Shared QA helpers. Run scripts from the repo root with:  node --env-file=.env scripts/qa/<script>.mjs
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomInt } from 'node:crypto';

export const BASE = 'http://localhost:3005';
export const OWNER_EMAIL = 'linkchatsecure@gmail.com';
export const MEMBER_EMAIL = 'qa-member@test.invalid';

export const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/** One-time login URL for the app's /auth/confirm page (the page needs a button click, like a real user). */
export async function loginUrl(email) {
  const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  return `${BASE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`;
}

/** A real session (access + refresh token) for API-level tests, created with the public client. */
export async function session(email) {
  const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const pub = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const r = await pub.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (r.error) throw r.error;
  return r.data.session;
}

/** Cookie header for the Next.js app (same format @supabase/ssr writes: base64url JSON, chunked at 3180 chars). */
export function cookieHeader(sess) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const name = `sb-${ref}-auth-token`;
  const value = 'base64-' + Buffer.from(JSON.stringify(sess)).toString('base64url');
  const parts = value.match(/.{1,3180}/g);
  const auth = parts.length === 1 ? `${name}=${parts[0]}` : parts.map((p, i) => `${name}.${i}=${p}`).join('; ');
  // inactivity cookie (the app signs users out after 1 minute without activity; API tests need a fresh one)
  const ts = Date.now();
  const sig = createHmac('sha256', process.env.SIGNING_KEY).update(`act:${sess.user.id}:${ts}`).digest('base64url');
  return `${auth}; lc-act=${ts}.${sig}`;
}

/** Random 20-char password with lower, upper, digit and symbol characters. */
export function strongPassword() {
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_=+?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < 20) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Create (or update) a confirmed email+password user. Idempotent. Returns the user id. */
export async function createPasswordUser({ email, name, role = 'member', password }) {
  const db = admin();
  const { data: inv } = await db.from('invites').select('id').ilike('email', email).maybeSingle();
  if (!inv) {
    const r = await db.from('invites').insert({ email, display_name: name, role });
    if (r.error) throw r.error;
  }
  const list = await db.auth.admin.listUsers({ perPage: 1000 });
  if (list.error) throw list.error;
  const existing = list.data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const r = await db.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (r.error) throw r.error;
    return existing.id;
  }
  // after the sign-up lock-down the database wants the one-time claim secret on the invite (same as the real invite flow)
  const claim = randomBytes(16).toString('hex');
  const arm = await db.from('invites').update({ claim_secret: claim, claim_expires: new Date(Date.now() + 120000).toISOString() }).ilike('email', email);
  if (arm.error) throw arm.error;
  const r = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { claim } });
  if (r.error) throw r.error;
  return r.data.user.id;
}

/** POST the app's login endpoint. Returns { status, body, setCookie } (setCookie is an array of Set-Cookie strings). */
export async function passwordLogin(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, setCookie: res.headers.getSetCookie() };
}

// Round 2 throwaway accounts (never the real owner or the real test member)
export const QA_OWNER = 'qa-owner@test.invalid';
export const QA_MEMBER = 'qa-member@test.invalid';

/**
 * Playwright cookies for a signed-in browser context WITHOUT using the login endpoint (so many testers can run at once
 * without hitting the per-IP login limit). Usage:
 *   const ctx = await browser.newContext({ viewport });  await ctx.addCookies(await playwrightCookies('qa-b1@test.invalid'));
 * The inactivity cookie inside is valid ~90 s and is refreshed by the app while you move the mouse / type.
 */
export async function playwrightCookies(email) {
  const header = cookieHeader(await session(email));
  return header.split('; ').map((pair) => {
    const i = pair.indexOf('=');
    return { name: pair.slice(0, i), value: pair.slice(i + 1), url: BASE };
  });
}
