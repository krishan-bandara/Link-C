import { pushConfigured } from '@/lib/push';
import { adminClient } from '@/lib/supabase/admin';
import { ownerOrRedirect } from '../guard';
import { Icon, PageHeader } from '../kit';
import { PushForm, TestPushForm } from './PushForm';

export const metadata = { title: 'Push - Admin - Link-C' };

export default async function PushPage() {
  const { user } = await ownerOrRedirect();
  const db = adminClient();
  const { data: st } = await db.from('push_settings').select('enabled,title,body,offline_after_seconds').eq('id', 1).single();
  const { count: devices } = await db.from('push_subscriptions').select('id', { count: 'exact', head: true });
  const { data: mine } = await db.from('push_subscriptions').select('id').eq('user_id', user.id).limit(1);
  if (!st) return <p className="text-danger">Settings row missing.</p>;
  return (
    <>
      <PageHeader title="Push notifications" subtitle="The alert people get on their phone when a message arrives while they are away." />
      {!pushConfigured() && (
        <p role="alert" className="ad-card rise flex items-center gap-3 border-danger text-sm text-danger">
          <Icon name="alert" size={18} />
          Push keys are not set on the server, so nothing can be sent. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env and restart.
        </p>
      )}
      <PushForm v={{ enabled: st.enabled, title: st.title, body: st.body, offline_after_seconds: st.offline_after_seconds }} />
      <section className="ad-card rise space-y-3">
        <h2 className="ad-card-title">
          <Icon name="bell" size={18} /> Devices
        </h2>
        <p className="text-sm text-muted">
          {devices ?? 0} phone{devices === 1 ? '' : 's'} or browser{devices === 1 ? '' : 's'} have notifications turned on. Everyone turns them on once in Settings,
          on their own phone. On iPhone they must first use Share, then Add to Home Screen.
        </p>
        <TestPushForm hasDevice={!!mine?.length} />
      </section>
    </>
  );
}
