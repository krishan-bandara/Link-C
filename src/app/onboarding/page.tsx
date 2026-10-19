import { redirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { decryptText } from '@/lib/crypto';
import OnboardingForm from './OnboardingForm';

export const dynamic = 'force-dynamic';

function mask(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 6) return '••• ••• •••';
  return `+${d.slice(0, 2)} ••• ••• ${d.slice(-3)}`;
}

export default async function OnboardingPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await adminClient()
    .from('profiles')
    .select('display_name,phone_enc,phone_verified_at,notice_accepted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.notice_accepted_at) redirect('/');

  let maskedPhone: string | null = null;
  if (profile?.phone_enc) {
    try {
      maskedPhone = mask(decryptText(profile.phone_enc));
    } catch {
      maskedPhone = null;
    }
  }

  return (
    <OnboardingForm
      initialName={profile?.display_name ?? ''}
      maskedPhone={maskedPhone}
      alreadyVerified={!!profile?.phone_verified_at}
    />
  );
}
