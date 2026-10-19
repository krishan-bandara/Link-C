import { adminClient } from '@/lib/supabase/admin';
import { ownerOrRedirect } from '../guard';
import { PageHeader } from '../kit';
import { LimitsForm } from './LimitsForm';

export const metadata = { title: 'Limits - Admin - Link-C' };

export default async function SettingsPage() {
  await ownerOrRedirect();
  const { data } = await adminClient()
    .from('app_settings')
    .select('photo_max_mb,video_max_mb,max_inflight_uploads,temp_cap_mb,snaps_cap_mb,upload_ttl_minutes')
    .eq('id', 1)
    .single();
  if (!data) return <p className="text-danger">Settings row missing.</p>;
  return (
    <>
      <PageHeader title="Limits" subtitle="Upload sizes and storage caps." />
      <LimitsForm v={data} />
    </>
  );
}
