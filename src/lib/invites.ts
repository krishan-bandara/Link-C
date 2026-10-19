// One-time invitation / password-reset links. Only sha256(token) is stored; a link works once, for INVITE_TTL_HOURS.
import { randomBytes } from 'node:crypto';
import { adminClient } from '@/lib/supabase/admin';
import { sha256 } from '@/lib/crypto';
import { INVITE_TTL_HOURS } from '@/lib/auth-policy';

export type InvitePurpose = 'invite' | 'reset';
export type ClaimedToken = { id: string; email: string; purpose: InvitePurpose };

export const hashToken = (token: string): string => sha256(token);

export function buildInviteLink(token: string, appUrl = process.env.APP_URL): string {
  const base = (appUrl ?? '').replace(/\/+$/, '');
  return `${base}/invite/${token}`;
}

/** Tokens are 32 random bytes in base64url (43 chars). Reject anything else before touching the database. */
export const isTokenShape = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);

export async function createInviteToken(opts: {
  email: string;
  purpose: InvitePurpose;
  createdBy: string | null;
}): Promise<{ token: string; link: string; expiresAt: string }> {
  if (!process.env.APP_URL) throw new Error('APP_URL is not configured');
  const db = adminClient();
  const email = opts.email.trim().toLowerCase();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();

  // Only the newest link may work: retire older unused ones for this email + purpose.
  const retire = await db
    .from('invite_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('email', email)
    .eq('purpose', opts.purpose)
    .is('used_at', null);
  if (retire.error) throw new Error('Could not prepare the link');

  const { error } = await db.from('invite_tokens').insert({
    email,
    purpose: opts.purpose,
    token_hash: hashToken(token),
    created_by: opts.createdBy,
    expires_at: expiresAt,
  });
  if (error) throw new Error('Could not create the link');
  return { token, link: buildInviteLink(token), expiresAt };
}

/** Read-only check for the invite page. Null for unknown, used and expired tokens alike. */
export async function lookupInviteToken(
  token: string,
): Promise<{ email: string; purpose: InvitePurpose; name?: string } | null> {
  if (!isTokenShape(token)) return null;
  const db = adminClient();
  const { data } = await db
    .from('invite_tokens')
    .select('email,purpose')
    .eq('token_hash', hashToken(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  const purpose = data.purpose as InvitePurpose;
  let name: string | undefined;
  if (purpose === 'invite') {
    const inv = await findInvite(data.email);
    if (!inv) return null; // the invitation was withdrawn
    name = inv.display_name;
  }
  return { email: data.email, purpose, name };
}

/** Atomic single use: exactly one caller can flip used_at from null. */
export async function claimInviteToken(token: string): Promise<ClaimedToken | null> {
  if (!isTokenShape(token)) return null;
  const now = new Date().toISOString();
  const { data } = await adminClient()
    .from('invite_tokens')
    .update({ used_at: now })
    .eq('token_hash', hashToken(token))
    .is('used_at', null)
    .gt('expires_at', now)
    .select('id,email,purpose')
    .maybeSingle();
  return data ? { id: data.id, email: data.email, purpose: data.purpose as InvitePurpose } : null;
}

/** Undo a claim when a later step failed, so the person can retry with the same link (only while still unexpired). */
export async function releaseInviteToken(id: string): Promise<void> {
  await adminClient().from('invite_tokens').update({ used_at: null }).eq('id', id);
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

export async function findInvite(email: string): Promise<{ id: string; email: string; display_name: string } | null> {
  const { data } = await adminClient()
    .from('invites')
    .select('id,email,display_name')
    .ilike('email', likeEscape(email.trim().toLowerCase()))
    .maybeSingle();
  return data ?? null;
}
