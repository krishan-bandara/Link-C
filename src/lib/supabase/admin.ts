import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

/** Service-role client. Server only. Bypasses RLS, so every caller must authorise first. */
export function adminClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured');
  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return client;
}
