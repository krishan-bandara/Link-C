import { isUnreadablePhone, readPhone } from '@/lib/phone';
import { maskPhone } from '@/lib/sms';
import { adminClient } from '@/lib/supabase/admin';
import { ensureConversationsForOwner } from '../conversations';
import { ownerOrRedirect } from '../guard';
import { PageHeader, expiresIn, relTime } from '../kit';
import { MembersView, type MemberView, type PendingView } from './MemberForms';

export const metadata = { title: 'Members - Admin - Link-C' };

const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC' : '';

function masked(enc: string | null) {
  if (!enc) return 'none';
  if (isUnreadablePhone(enc)) return 'unreadable (re-enter it)';
  const plain = readPhone(enc);
  return plain ? maskPhone(plain) : 'none';
}

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { user } = await ownerOrRedirect();
  const sp = await searchParams;
  // People who accepted an invite get their chat with the owner here (idempotent, two small reads).
  await ensureConversationsForOwner(user.id);

  const db = adminClient();
  const [{ data: profiles }, { data: presence }, { data: invites }, usersRes] = await Promise.all([
    db
      .from('profiles')
      .select('id,display_name,role,avatar_asset_id,phone_enc,sms_alerts_enabled,sms_template,phone_verified_at,login_disabled,created_at')
      .order('created_at'),
    db.from('presence_state').select('user_id,last_seen_at'),
    db.from('invites').select('email,display_name,phone_enc,created_at,accepted_at').is('accepted_at', null).order('created_at', { ascending: false }),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const seen = new Map((presence ?? []).map((p) => [p.user_id as string, p.last_seen_at as string]));
  const emailOf = new Map(usersRes.data.users.map((u) => [u.id, u.email ?? '']));
  const accountEmails = new Set([...emailOf.values()].map((e) => e.toLowerCase()));

  const pendingRows = (invites ?? []).filter((i) => !accountEmails.has((i.email as string).toLowerCase()));
  const emails = pendingRows.map((i) => i.email as string);
  const { data: tokens } = emails.length
    ? await db.from('invite_tokens').select('email,expires_at,used_at').eq('purpose', 'invite').in('email', emails).is('used_at', null)
    : { data: [] };
  const expiry = new Map<string, string>();
  for (const t of tokens ?? []) {
    const cur = expiry.get(t.email as string);
    if (!cur || t.expires_at > cur) expiry.set(t.email as string, t.expires_at as string);
  }

  const now = Date.now();
  const members: MemberView[] = (profiles ?? []).map((p) => {
    const last = seen.get(p.id);
    return {
      id: p.id,
      name: (p.display_name as string | null) ?? 'this person',
      email: emailOf.get(p.id) ?? '',
      isOwner: p.role === 'owner',
      isSelf: p.id === user.id,
      avatarAssetId: (p.avatar_asset_id as string | null) ?? null,
      online: !!last && now - new Date(last).getTime() < 2 * 60 * 1000,
      lastSeen: relTime(last, now),
      disabled: !!p.login_disabled,
      phone: masked(p.phone_enc as string | null),
      phoneVerified: !!p.phone_verified_at,
      smsOn: !!p.sms_alerts_enabled,
      template: (p.sms_template as string | null) ?? '',
    };
  });
  const pending: PendingView[] = pendingRows.map((i) => {
    const exp = expiry.get(i.email as string);
    const expired = !exp || new Date(exp).getTime() < now;
    return {
      email: i.email as string,
      name: i.display_name as string,
      phone: masked(i.phone_enc as string | null),
      expired,
      until: fmtDay(exp),
      expiresIn: expiresIn(exp, now),
    };
  });

  return (
    <>
      <PageHeader title="Members" subtitle="Invite people, reset passwords, and switch a login off or on." />
      <MembersView members={members} pending={pending} openInvite={sp.invite === '1'} />
    </>
  );
}
