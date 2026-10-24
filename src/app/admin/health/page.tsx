import { supabaseServer } from '@/lib/supabase/server';
import { activeToday, classify, needsAttention, toMs } from '@/lib/memberHealth';
import { ownerOrRedirect } from '../guard';
import { EmptyState, PageHeader, StatTile } from '../kit';
import HealthView, { type HealthRow } from './HealthView';

export const metadata = { title: 'Members health - Admin - Link-C' };
export const dynamic = 'force-dynamic';

type Raw = {
  id: string;
  display_name: string | null;
  role: string;
  login_disabled: boolean;
  last_seen_at: string | null;
  last_sign_in_at: string | null;
  active_sessions: number | null;
};

export default async function HealthPage() {
  await ownerOrRedirect();
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('admin_member_health');
  const now = Date.now();

  if (error) {
    return (
      <>
        <PageHeader title="Members health" subtitle="Who is using Link-C, and who has gone quiet." />
        <EmptyState icon="activity" title="Could not load member health" text="Try again in a moment." />
      </>
    );
  }

  const rows: HealthRow[] = ((data ?? []) as Raw[]).map((m) => {
    const h = classify(m.last_seen_at, m.last_sign_in_at, now);
    return {
      id: m.id,
      name: m.display_name ?? 'Unnamed',
      role: m.role,
      disabled: !!m.login_disabled,
      status: h.status,
      days: h.daysSince,
      attention: needsAttention(h.status, !!m.login_disabled),
      seenMs: toMs(m.last_seen_at),
      signInMs: toMs(m.last_sign_in_at),
      lastMs: h.lastActivity,
      sessions: m.active_sessions ?? 0,
    };
  });
  const live = rows.filter((r) => !r.disabled);
  const count = (s: string) => live.filter((r) => r.status === s).length;

  return (
    <>
      <PageHeader title="Members health" subtitle="Quiet after 3 days, inactive after 7 days without opening the app." />
      <section aria-label="Summary" className="ad-statgrid">
        <StatTile index={0} icon="activity" tone="green" label="Active today" value={live.filter((r) => activeToday(r.lastMs, now)).length} />
        <StatTile index={1} icon="clock" tone="amber" label="Quiet 3+ days" value={count('quiet')} />
        <StatTile index={2} icon="ban" tone="red" label="Inactive 7+ days" value={count('inactive')} />
        <StatTile index={3} icon="mail" tone="violet" label="Never signed in" value={count('never')} />
      </section>
      <HealthView rows={rows} />
    </>
  );
}
