import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { DEFAULT_ABOUT, PREF_COLS, prefsFromRow } from '@/lib/prefs';
import Wizard from './Wizard';

export const metadata = { title: 'Set up your profile - Link-C' };

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name,about,avatar_asset_id,notice_accepted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) redirect('/login');
  if (!profile.notice_accepted_at) redirect('/onboarding');

  const { data: row } = await supabase.from('user_prefs').select(PREF_COLS).eq('user_id', user.id).maybeSingle();
  if (!row) await supabase.from('user_prefs').insert({ user_id: user.id });
  const prefs = prefsFromRow(row);
  if (prefs.wizardDone) redirect('/');

  return (
    <Wizard
      userId={user.id}
      initialName={profile.display_name ?? ''}
      initialAbout={(profile.about as string | null) || DEFAULT_ABOUT}
      initialAvatar={(profile.avatar_asset_id as string | null) ?? null}
      initialPrefs={prefs}
    />
  );
}
