import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { DEFAULT_ABOUT, PREF_COLS, prefsFromRow } from '@/lib/prefs';
import SettingsClient from './SettingsClient';

export const metadata = { title: 'Settings - Link-C' };

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: row }] = await Promise.all([
    supabase.from('profiles').select('display_name,about,avatar_asset_id,sms_alerts_enabled').eq('id', user.id).maybeSingle(),
    supabase.from('user_prefs').select(PREF_COLS).eq('user_id', user.id).maybeSingle(),
  ]);
  if (!profile) redirect('/login');

  return (
    <SettingsClient
      userId={user.id}
      email={user.email ?? ''}
      initial={{
        name: profile.display_name ?? '',
        about: (profile.about as string | null) || DEFAULT_ABOUT,
        avatar: (profile.avatar_asset_id as string | null) ?? null,
        sms: profile.sms_alerts_enabled !== false,
      }}
      prefs={prefsFromRow(row)}
    />
  );
}
