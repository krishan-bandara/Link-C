import { adminClient } from '@/lib/supabase/admin';

/**
 * Makes sure every member has a conversation with the owner (the profile only exists after the invite is accepted).
 * Idempotent and cheap: two small reads, inserts only for the missing ones. Called from the Members page render.
 * Lives outside actions.ts on purpose: every export of a 'use server' file is callable from the browser.
 */
export async function ensureConversationsForOwner(ownerId: string): Promise<void> {
  const db = adminClient();
  const [{ data: members }, { data: convs }] = await Promise.all([
    db.from('profiles').select('id').eq('role', 'member'),
    db.from('conversations').select('user_a,user_b').or(`user_a.eq.${ownerId},user_b.eq.${ownerId}`),
  ]);
  const have = new Set((convs ?? []).map((c) => (c.user_a === ownerId ? c.user_b : c.user_a) as string));
  const missing = (members ?? []).map((m) => m.id as string).filter((id) => id !== ownerId && !have.has(id));
  if (!missing.length) return;
  // One insert per person: a parallel page render that got there first only fails its own row (23505), not the whole batch.
  const results = await Promise.all(missing.map((id) => db.from('conversations').insert({ user_a: ownerId, user_b: id })));
  const bad = results.find((r) => r.error && r.error.code !== '23505');
  if (bad?.error) console.error('ensureConversationsForOwner failed:', bad.error.code, bad.error.message);
}
