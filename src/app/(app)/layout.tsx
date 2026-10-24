import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { loadConversations } from '@/lib/chat/conversations';
import { prefsFromRow, PREF_COLS } from '@/lib/prefs';
import AppShell from './components/AppShell';
import Heartbeat from './components/Heartbeat';
import RefreshGuard from '@/components/RefreshGuard';
import LookProvider from '@/lib/LookProvider';
import DndProvider from '@/lib/DndProvider';
import PrefsSync from './components/PrefsSync';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,display_name,role,notice_accepted_at,avatar_asset_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) redirect('/login');
  if (!profile.notice_accepted_at) redirect('/onboarding');

  const { data: row } = await supabase.from('user_prefs').select(PREF_COLS).eq('user_id', user.id).maybeSingle();
  if (!row) await supabase.from('user_prefs').insert({ user_id: user.id });
  const prefs = prefsFromRow(row);
  if (!prefs.wizardDone) redirect('/welcome');

  const conversations = await loadConversations(supabase, user.id).catch(() => []); // client list refreshes on its own

  return (
    <>
      <Heartbeat />
      <RefreshGuard />
      <PrefsSync theme={prefs.theme} accent={prefs.accent} pack={prefs.pack} look={prefs.look} />
      <LookProvider initial={prefs.look}>
      <DndProvider initial={prefs.dnd}>
      <AppShell
        me={{
          id: profile.id,
          name: profile.display_name,
          isOwner: profile.role === 'owner',
          avatar: (profile.avatar_asset_id as string | null) ?? null,
        }}
        initialConversations={conversations}
      >
        {children}
      </AppShell>
      </DndProvider>
      </LookProvider>
    </>
  );
}
