// Prints a one-time link to set (or reset) a person's password. The link works once, for 24 hours.
// Usage: node --env-file=.env scripts/owner-set-password-link.mjs you@example.com [reset|invite]
//   reset  (default) for someone who already has an account, e.g. the owner who has no password yet
//   invite for a brand-new OWNER account (creates the invite row with role owner)
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const email = (process.argv[2] ?? '').trim().toLowerCase();
const purpose = process.argv[3] === 'invite' ? 'invite' : 'reset';
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: node --env-file=.env scripts/owner-set-password-link.mjs you@example.com [reset|invite]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');
if (!url || !key || !appUrl) {
  console.error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and APP_URL must be set in the env file.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

if (purpose === 'invite') {
  const { data: inv } = await db.from('invites').select('id').ilike('email', email).maybeSingle();
  if (!inv) {
    const r = await db.from('invites').insert({ email, display_name: 'Owner', role: 'owner' });
    if (r.error) { console.error('Could not create the invite row:', r.error.message); process.exit(1); }
  }
} else {
  // a reset link only makes sense when the account exists
  const list = await db.auth.admin.listUsers({ perPage: 1000 });
  if (list.error || !list.data.users.some((u) => u.email?.toLowerCase() === email)) {
    console.error('No account exists for that email. Use "invite" to create a new owner account.');
    process.exit(1);
  }
}

const token = randomBytes(32).toString('base64url');
const expires = new Date(Date.now() + 24 * 3600_000).toISOString();
// only the newest link works
await db.from('invite_tokens').update({ used_at: new Date().toISOString() }).eq('email', email).eq('purpose', purpose).is('used_at', null);
const ins = await db.from('invite_tokens').insert({ email, purpose, token_hash: createHash('sha256').update(token).digest('hex'), expires_at: expires });
if (ins.error) { console.error('Could not create the link:', ins.error.message); process.exit(1); }

console.log(`\nOpen this link in your browser to choose a password (works once, until ${expires.slice(0, 16).replace('T', ' ')} UTC):\n`);
console.log(`${appUrl}/invite/${token}\n`);
