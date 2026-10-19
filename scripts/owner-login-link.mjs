// Prints a one-time login link for the owner (works without SMTP).
// Usage: SUPABASE_SECRET_KEY=... NEXT_PUBLIC_SUPABASE_URL=... APP_URL=... node scripts/owner-login-link.mjs you@example.com
// (or load your .env first: node --env-file=.env scripts/owner-login-link.mjs you@example.com)
import { createClient } from '@supabase/supabase-js';

const email = (process.argv[2] ?? '').trim().toLowerCase();
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: key, APP_URL } = process.env;
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Usage: node scripts/owner-login-link.mjs you@example.com');
if (!url || !key || !APP_URL) fail('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and APP_URL (e.g. node --env-file=.env ...).');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// The database only lets an auth user be created if an invite row exists.
const { data: invite, error: ie } = await db.from('invites').select('id,role').ilike('email', email).maybeSingle();
if (ie) fail(`Could not read invites: ${ie.message}`);
if (!invite) {
  const { error } = await db.from('invites').insert({ email, role: 'owner', display_name: 'Owner' });
  if (error) fail(`Could not create the owner invite: ${error.message}`);
  console.error('Created the owner invite row.');
} else if (invite.role !== 'owner') {
  fail('That email has an invite that is not an owner invite. Refusing to continue.');
}

// generateLink creates the auth user when it does not exist yet.
const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
if (error || !data?.properties?.hashed_token) fail(`Could not create the link: ${error?.message ?? 'no token returned'}`);

const base = APP_URL.replace(/\/+$/, '');
console.log(`${base}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink`);
console.error('Open this link in your browser once. It expires in about 10 minutes and works only once.');
