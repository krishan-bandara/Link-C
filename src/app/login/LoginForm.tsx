'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import AuthShell from '@/components/auth/AuthShell';
import PasswordField from '@/components/auth/PasswordField';
import BootLines from '@/components/auth/BootLines';
import TerminalLog, { type LogLine } from '@/components/auth/TerminalLog';
import { BrandMark, StepLabel, TerminalCard } from '@/components/auth/TerminalCard';

type Step = 'email' | 'password' | 'done';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const mask = (e: string) => `${e.charAt(0)}***${e.slice(e.indexOf('@'))}`;
const emit = (name: string) => window.dispatchEvent(new CustomEvent(name));

export default function LoginForm({ notice }: { notice: string }) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lockLeft, setLockLeft] = useState(0);
  const [shake, setShake] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const idRef = useRef(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwWrap = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const log = useCallback((text: string, kind: LogLine['kind'] = 'm') => {
    setLines((l) => [...l.slice(-5), { id: ++idRef.current, text, kind }]);
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const list = timers.current;
    later(() => log('$ tunnel up --outbound-only', 'c'), 500);
    later(() => log('✓ connected · 0 inbound ports', 'o'), 1300);
    later(() => log('$ awaiting credentials', 'm'), 2100);
    return () => list.forEach(clearTimeout);
  }, [later, log]);

  // focus the right field when the step changes
  useEffect(() => {
    if (step === 'email') emailRef.current?.focus({ preventScroll: true });
    if (step === 'password') pwWrap.current?.querySelector('input')?.focus({ preventScroll: true });
  }, [step]);

  // live countdown after a 429
  useEffect(() => {
    if (lockLeft <= 0) return;
    const t = setTimeout(() => setLockLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [lockLeft]);
  useEffect(() => {
    if (lockLeft === 0 && error && lockedRef.current) {
      lockedRef.current = false;
      setError('');
    }
  }, [lockLeft, error]);
  const lockedRef = useRef(false);

  function fail(msg: string) {
    setError(msg);
    setShake(false);
    requestAnimationFrame(() => setShake(true));
    log(`✗ ${msg}`, 'e');
    try {
      navigator.vibrate?.([30, 40, 30]);
    } catch {
      /* not supported */
    }
  }

  function onEmail(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!EMAIL_RE.test(v)) {
      fail('Enter a valid email address.');
      emailRef.current?.focus();
      return;
    }
    setEmail(v);
    setError('');
    log(`$ identify --user ${mask(v)}`, 'c');
    setStep('password');
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy || lockLeft > 0) return;
    if (!password) {
      fail('Enter your password.');
      return;
    }
    setBusy(true);
    setError('');
    emit('lc:submit');
    log('$ auth login --password ****', 'c');
    log('resolving identity...', 'm');
    later(() => log('verifying credentials...', 'm'), 450);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; retryAfterSeconds?: number };
      if (res.ok && data.ok) {
        log('✓ verified · session opened', 'o');
        emit('lc:success');
        setStep('done');
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Where to go after login: parse it like the browser would and accept only a path on THIS site (tabs, backslashes and
        // "//host" tricks all resolve to another origin and are refused).
        let dest = '/';
        try {
          const raw = new URLSearchParams(window.location.search).get('next') ?? '';
          const u = new URL(raw, window.location.origin);
          if (u.origin === window.location.origin && !u.pathname.startsWith('/login') && !u.pathname.startsWith('//')) dest = u.pathname + u.search + u.hash;
        } catch {
          dest = '/';
        }
        later(() => window.location.assign(dest), reduce ? 300 : 1300);
        return;
      }
      setPassword('');
      if (res.status === 429) {
        const secs = Math.max(1, Math.ceil(Number(data.retryAfterSeconds) || 60));
        lockedRef.current = true;
        setLockLeft(secs);
        fail(data.error || 'Too many attempts.');
      } else {
        fail(data.error || (res.status === 401 ? 'Email or password is incorrect.' : 'Something went wrong. Please try again.'));
      }
      pwWrap.current?.querySelector('input')?.focus();
    } catch {
      fail('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const locked = lockLeft > 0;
  return (
    <AuthShell smallSubtle>
      <TerminalCard title={'~/auth/session — zsh'} label="Sign in" className={shake ? 'lc-shake' : ''}>
        <BrandMark />
        <BootLines />
        {notice && (
          <p className="lc-notice" role="status">
            {notice}
          </p>
        )}

        {step === 'email' && (
          <form key="email" className="lc-step" onSubmit={onEmail} noValidate>
            <StepLabel>
              <b>authenticate</b>(user)
            </StepLabel>
            <h1 className="lc-h1">Welcome back</h1>
            <p className="lc-sub">Sign in with your email and password.</p>
            <div className="lc-field">
              <label className="lc-label" htmlFor="email">
                Email address
              </label>
              <input
                ref={emailRef}
                id="email"
                name="email"
                className="lc-input"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby="login-err"
              />
            </div>
            <p id="login-err" className="lc-err" role="alert">
              {error}
            </p>
            <button className="lc-btn" type="submit">
              <span>Continue</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <div className="lc-foot">
              <span className="lc-lock">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 018 0v4" />
                </svg>
                Invite-only access
              </span>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form key="password" className="lc-step" onSubmit={onPassword} noValidate>
            <StepLabel>
              <b>authenticate</b>(password)
            </StepLabel>
            <h1 className="lc-h1">Enter your password</h1>
            <p className="lc-sub">
              Signing in as <b>{email}</b>
            </p>
            <input type="email" name="email" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
            <div ref={pwWrap}>
              <PasswordField
                id="password"
                label="Password"
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  if (!locked) setError('');
                }}
                autoComplete="current-password"
                describedBy="login-err"
                invalid={!!error}
              />
            </div>
            <p id="login-err" className="lc-err" role="alert">
              {locked ? `Too many attempts. Try again in ${fmt(lockLeft)}.` : error}
            </p>
            <button className={`lc-btn${busy ? ' busy' : ''}`} type="submit" disabled={busy || locked} aria-busy={busy}>
              <span>{busy ? 'Authenticating...' : locked ? `Wait ${fmt(lockLeft)}` : 'Sign in'}</span>
            </button>
            <div className="lc-foot">
              <button
                type="button"
                className="lc-link"
                onClick={() => {
                  setPassword('');
                  setError('');
                  log('$ cancel --reset', 'm');
                  setStep('email');
                }}
              >
                Use a different email
              </button>
            </div>
            <p className="lc-hint">Forgot your password? Ask the administrator for a new link.</p>
          </form>
        )}

        {step === 'done' && (
          <div key="done" className="lc-step lc-done" role="status">
            <StepLabel>
              <b>session</b>.open()
            </StepLabel>
            <svg className="lc-check" viewBox="0 0 92 92" aria-hidden="true">
              <circle cx="46" cy="46" r="42" />
              <path d="M28 47l12 12 24-27" />
            </svg>
            <h1 className="lc-h1">You are in</h1>
            <p className="lc-sub">Opening your space&hellip;</p>
          </div>
        )}

        <TerminalLog lines={lines} />
      </TerminalCard>
    </AuthShell>
  );
}
