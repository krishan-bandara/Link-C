'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import PasswordField from '@/components/auth/PasswordField';
import StrengthMeter from '@/components/auth/StrengthMeter';
import { BrandMark, StepLabel, TerminalCard } from '@/components/auth/TerminalCard';

type Info = { purpose: 'invite' | 'reset'; email: string; name?: string };
type State = { kind: 'loading' } | { kind: 'invalid' } | { kind: 'ready'; info: Info } | { kind: 'done'; info: Info; signedIn: boolean };

const emit = (name: string) => window.dispatchEvent(new CustomEvent(name));
const DX = [-70, -40, -10, 25, 60, 85, -85, 45];
const DY = [-60, -90, -110, -95, -65, -30, -25, -40];

export default function InviteForm({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [rulesOk, setRulesOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/invite/check?token=${encodeURIComponent(token)}`, { signal: ctl.signal, cache: 'no-store' });
        const d = (await res.json()) as { valid?: boolean; purpose?: 'invite' | 'reset'; email?: string; name?: string };
        if (d.valid && d.email && (d.purpose === 'invite' || d.purpose === 'reset')) {
          setName(d.name ?? '');
          setState({ kind: 'ready', info: { purpose: d.purpose, email: d.email, name: d.name } });
        } else setState({ kind: 'invalid' });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ kind: 'invalid' });
      }
    })();
    return () => ctl.abort();
  }, [token]);

  const info = state.kind === 'ready' || state.kind === 'done' ? state.info : null;
  const isInvite = info?.purpose === 'invite';
  const trimmed = name.trim();
  const nameOk = !isInvite || (trimmed.length >= 1 && trimmed.length <= 40);
  const canSubmit = state.kind === 'ready' && nameOk && rulesOk && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== 'ready' || !canSubmit) return;
    setBusy(true);
    setError('');
    setProblems([]);
    emit('lc:submit');
    try {
      const body: { token: string; name?: string; password: string } = { token, password };
      const n = isInvite ? trimmed : state.info.name;
      if (n) body.name = n;
      const res = await fetch('/api/invite/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string; error?: string; problems?: string[] };
      if (!res.ok || !d.ok) {
        setProblems(Array.isArray(d.problems) ? d.problems : []);
        setError(d.error || 'We could not save that. Please check the details and try again.');
        setBusy(false);
        return;
      }
      emit('lc:success');
      const email = d.email || state.info.email;
      let signedIn = false;
      try {
        const lr = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        signedIn = lr.ok;
      } catch {
        signedIn = false;
      }
      setPassword('');
      setConfirm('');
      setState({ kind: 'done', info: state.info, signedIn });
      if (signedIn) {
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(() => window.location.assign('/'), reduce ? 400 : 2200);
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <AuthShell smallSubtle>
      <TerminalCard title={'~/auth/invite — zsh'} label={isInvite ? 'Create your account' : 'Set a new password'} className="lc-wide">
        <BrandMark />

        {state.kind === 'loading' && (
          <div aria-busy="true" aria-label="Checking your link">
            <div className="lc-skel skeleton" style={{ width: '60%', height: 28 }} />
            <div className="lc-skel skeleton" style={{ width: '90%' }} />
            <div className="lc-skel skeleton" style={{ height: 52, borderRadius: 14 }} />
            <div className="lc-skel skeleton" style={{ height: 52, borderRadius: 14 }} />
            <div className="lc-skel skeleton" style={{ height: 54, borderRadius: 14 }} />
          </div>
        )}

        {state.kind === 'invalid' && (
          <div className="lc-step" role="status">
            <StepLabel>
              <b>token</b>.verify()
            </StepLabel>
            <h1 className="lc-h1">Link not available</h1>
            <p className="lc-sub">This link has expired or was already used. Ask the administrator for a new one.</p>
            <Link href="/login" className="lc-btn">
              Go to sign in
            </Link>
          </div>
        )}

        {state.kind === 'ready' && (
          <form className="lc-step" onSubmit={onSubmit} noValidate>
            <StepLabel>{isInvite ? <><b>account</b>.create()</> : <><b>password</b>.reset()</>}</StepLabel>
            <h1 className="lc-h1">{isInvite ? 'Welcome! Create your account' : 'Set a new password'}</h1>
            <p className="lc-sub">{isInvite ? 'Choose how you appear and set a password.' : 'Choose a new password for your account.'}</p>

            <div className="lc-field">
              <label className="lc-label" htmlFor="inv-email">
                Email
              </label>
              <input id="inv-email" name="email" className="lc-input" type="email" value={state.info.email} readOnly autoComplete="username" />
            </div>

            {isInvite && (
              <div className="lc-field">
                <label className="lc-label" htmlFor="inv-name">
                  Display name
                </label>
                <input
                  ref={nameRef}
                  id="inv-name"
                  name="name"
                  className="lc-input"
                  type="text"
                  value={name}
                  maxLength={40}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  aria-describedby="inv-name-hint"
                />
                <p id="inv-name-hint" className="lc-hint">
                  1 to 40 characters
                </p>
              </div>
            )}

            <PasswordField id="inv-pw" label={isInvite ? 'Password' : 'New password'} value={password} onChange={setPassword} autoComplete="new-password" describedBy="inv-rules" />
            <PasswordField id="inv-pw2" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

            <div id="inv-rules">
              <StrengthMeter password={password} email={state.info.email} name={isInvite ? trimmed : state.info.name} confirm={confirm} onValidChange={setRulesOk} />
            </div>

            <div role="alert" className="lc-err">
              {error}
              {problems.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>

            <button className={`lc-btn${busy ? ' busy' : ''}`} type="submit" disabled={!canSubmit} aria-busy={busy}>
              <span>{busy ? 'Saving' : isInvite ? 'Create account' : 'Save password'}</span>
            </button>
          </form>
        )}

        {state.kind === 'done' && (
          <div className="lc-step lc-done" role="status">
            <StepLabel>
              <b>session</b>.open()
            </StepLabel>
            <div className="lc-confetti" aria-hidden="true">
              {DX.map((dx, i) => (
                <i key={i} style={{ '--dx': `${dx}px`, '--dy': `${DY[i]}px` } as React.CSSProperties} />
              ))}
            </div>
            <svg className="lc-check" viewBox="0 0 92 92" aria-hidden="true">
              <circle cx="46" cy="46" r="42" />
              <path d="M28 47l12 12 24-27" />
            </svg>
            {state.signedIn ? (
              <>
                <h1 className="lc-h1">{isInvite ? 'Account created' : 'Password updated'}</h1>
                <p className="lc-sub">Signing you in&hellip;</p>
              </>
            ) : (
              <>
                <h1 className="lc-h1">{isInvite ? 'Account created' : 'Password updated'}</h1>
                <p className="lc-sub">Your password is saved. Please sign in to continue.</p>
                <Link href="/login" className="lc-btn">
                  Go to sign in
                </Link>
              </>
            )}
          </div>
        )}
      </TerminalCard>
    </AuthShell>
  );
}
