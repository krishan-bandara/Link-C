'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { reportActivity } from '@/lib/idle-client';
import AuthShell from '@/components/auth/AuthShell';
import { TerminalCard } from '@/components/auth/TerminalCard';

function Confirm() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenHash = params.get('token_hash');
  // Older style link (Supabase's default email): ?code=... Supabase's browser client signs in by itself when
  // this page loads, so we only wait for that to finish. It only works in the browser that asked for the email.
  const code = params.get('code');
  const type = params.get('type') === 'magiclink' ? 'magiclink' : 'email';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasLink = !!tokenHash || !!code;

  useEffect(() => {
    if (tokenHash || !code) return;
    const auth = supabaseBrowser().auth;
    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      await reportActivity(); // starts the inactivity clock for this session
      router.replace('/');
      router.refresh();
    };
    const { data: sub } = auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });
    void auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });
    const timer = setTimeout(() => {
      if (!done) {
        setError(
          'This link could not be used here. Open it in the same browser you asked for the email in, or go back to sign in and type the 6-digit code if your email has one.',
        );
      }
    }, 8000);
    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [code, tokenHash, router]);

  async function go() {
    if (!tokenHash) return;
    setBusy(true);
    setError('');
    // Only verified on click, so email link scanners cannot use up the token.
    const { error: err } = await supabaseBrowser().auth.verifyOtp({ token_hash: tokenHash, type });
    if (err) {
      setError('This link has expired or was already used.');
      setBusy(false);
      return;
    }
    await reportActivity(); // starts the inactivity clock for this session
    router.replace('/');
    router.refresh();
  }

  const invalid = !hasLink || !!error;
  return (
    <TerminalCard title={'~/auth/confirm — zsh'} label="Confirm sign-in" className="space-y-5 text-center">
      <h1 className="text-2xl font-semibold">{invalid ? 'Link problem' : code && !tokenHash ? 'Signing you in…' : 'Almost there'}</h1>
      {!hasLink && <p className="text-sm text-danger">This link is not valid.</p>}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {tokenHash && !error && (
        <button onClick={go} disabled={busy} className="lc-btn">
          {busy ? 'Signing in…' : 'Continue to Link-C'}
        </button>
      )}
      {invalid && (
        <Link href="/login" className="block text-sm text-accent underline">
          Back to sign in to get a new link
        </Link>
      )}
    </TerminalCard>
  );
}

export default function ConfirmPage() {
  return (
    <AuthShell>
      <Suspense>
        <Confirm />
      </Suspense>
    </AuthShell>
  );
}
