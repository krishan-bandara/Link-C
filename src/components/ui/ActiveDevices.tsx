'use client';

import { useCallback, useEffect, useState } from 'react';
import { Laptop, Smartphone } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { describeDevice, relativeTime } from '@/lib/userAgent';
import ConfirmDialog from '@/components/chat/ConfirmDialog';
import '@/components/ui/ui.css';

type Row = { id: string; user_agent: string | null; ip: string | null; created_at: string; last_active: string | null; is_current: boolean };
type Ask = { kind: 'one'; row: Row } | { kind: 'all' } | null;

/** Signed-in devices: see where you are logged in and sign other devices out. */
export default function ActiveDevices({ toast }: { toast: (text: string, bad?: boolean) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc('list_my_sessions');
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const others = (rows ?? []).filter((r) => !r.is_current).length;

  async function confirm() {
    if (!ask) return;
    setBusy(true);
    const sb = supabaseBrowser();
    if (ask.kind === 'one') {
      const { error } = await sb.rpc('revoke_my_session', { sid: ask.row.id });
      toast(error ? 'Could not sign that device out.' : 'Device signed out', !!error);
    } else {
      const { data, error } = await sb.rpc('revoke_other_sessions');
      const n = typeof data === 'number' ? data : 0;
      toast(error ? 'Could not sign the other devices out.' : n === 1 ? '1 device signed out' : `${n} devices signed out`, !!error);
    }
    setBusy(false);
    setAsk(null);
    await load();
  }

  return (
    <div className="space-y-3">
      {rows === null && !failed && <p className="text-sm text-muted">Loading…</p>}
      {failed && (
        <p className="text-sm text-danger" role="alert">
          Could not load your devices.{' '}
          <button type="button" onClick={() => void load()} className="underline">
            Try again
          </button>
        </p>
      )}
      {rows && rows.length === 0 && <p className="text-sm text-muted">No signed-in devices found.</p>}
      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => {
            const name = describeDevice(r.user_agent);
            const Icon = /iPhone|iPad|Android/i.test(r.user_agent ?? '') ? Smartphone : Laptop;
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: 'var(--c-panel-2, transparent)' }}>
                <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="truncate">{name}</span>
                    {r.is_current && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">This device</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {relativeTime(r.last_active ?? r.created_at)}
                    {r.ip ? ` · near ${r.ip}` : ''}
                  </p>
                </div>
                {!r.is_current && (
                  <button
                    type="button"
                    onClick={() => setAsk({ kind: 'one', row: r })}
                    aria-label={`Sign out ${name}`}
                    className="ui-btn-outline min-h-11 shrink-0 !px-3 !py-2 text-sm !text-danger"
                  >
                    Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {others > 0 && (
        <button type="button" onClick={() => setAsk({ kind: 'all' })} className="ui-btn-outline min-h-11 w-full !text-danger">
          Sign out all other devices ({others})
        </button>
      )}
      <p className="text-xs text-muted">A device you sign out may stay signed in for a few minutes, until its short-lived access pass expires.</p>
      {ask && (
        <ConfirmDialog
          title={ask.kind === 'one' ? `Sign out ${describeDevice(ask.row.user_agent)}?` : `Sign out all other devices (${others})?`}
          body="That device will need to sign in again."
          confirmLabel="Sign out"
          busy={busy}
          onConfirm={confirm}
          onCancel={() => !busy && setAsk(null)}
        />
      )}
    </div>
  );
}
