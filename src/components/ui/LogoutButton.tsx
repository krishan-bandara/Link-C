'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import ConfirmDialog from '@/components/chat/ConfirmDialog';

/** Logs out after an "Are you sure?" confirmation. Use the hook to attach it to any trigger. */
export function useLogout() {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doLogout() {
    setBusy(true);
    window.dispatchEvent(new Event('lc-logout')); // lets the offline cache wipe saved messages
    try {
      await supabaseBrowser().auth.signOut();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  const dialog: ReactNode = asking ? (
    <ConfirmDialog
      title="Log out of Link-C on this device?"
      body="You will need a new sign-in link or your password to get back in."
      confirmLabel={busy ? 'Logging out…' : 'Log out'}
      busy={busy}
      onConfirm={doLogout}
      onCancel={() => !busy && setAsking(false)}
    />
  ) : null;

  return { ask: () => setAsking(true), dialog };
}

/** Full-width red Log out button with confirmation. */
export default function LogoutButton() {
  const { ask, dialog } = useLogout();
  return (
    <>
      <button
        type="button"
        onClick={ask}
        aria-label="Log out of Link-C"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-danger px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-danger)]"
      >
        <LogOut className="h-4 w-4" aria-hidden /> Log out
      </button>
      {dialog}
    </>
  );
}
