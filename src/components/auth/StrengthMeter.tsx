'use client';
/*
 * StrengthMeter({ password, email?, name?, confirm?, onValidChange?(ok: boolean) })
 *   Live strength bar (Weak / Okay / Good / Strong), a checklist of the rules and a tip. Lazy-loads checkPassword
 *   (the ~400 KB dictionaries) the first time it mounts. If `confirm` is given, a "passwords match" rule is shown too.
 *   onValidChange fires whenever "every rule passes" changes (false until the checker has loaded).
 */
import { useEffect, useMemo, useState } from 'react';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/auth-policy';
import type { PasswordCheck } from '@/lib/password';
import './auth.css';

type Check = (password: string, ctx?: { email?: string; name?: string }) => PasswordCheck;
let loader: Promise<Check> | null = null;
const loadChecker = () => (loader ??= import('@/lib/password').then((m) => m.checkPassword));

const LABELS = ['Weak', 'Weak', 'Okay', 'Good', 'Strong'];

export default function StrengthMeter({
  password,
  email,
  name,
  confirm,
  onValidChange,
}: {
  password: string;
  email?: string;
  name?: string;
  confirm?: string;
  onValidChange?: (ok: boolean) => void;
}) {
  const [check, setCheck] = useState<Check | null>(null);
  useEffect(() => {
    let live = true;
    void loadChecker().then((c) => live && setCheck(() => c));
    return () => {
      live = false;
    };
  }, []);

  const result = useMemo(() => (check && password ? check(password, { email, name }) : null), [check, password, email, name]);
  const has = (s: string) => !!result?.problems.some((p) => p.includes(s));
  const rules: { text: string; ok: boolean }[] = [
    { text: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH },
    { text: 'Not easy to guess', ok: !!result && !has('easy to guess') },
    { text: 'No name or email inside', ok: !!password && !!result && !has('name or email') },
  ];
  if (confirm !== undefined) rules.push({ text: 'Passwords match', ok: password.length > 0 && confirm === password });
  const allOk = rules.every((r) => r.ok) && !!result;

  useEffect(() => {
    onValidChange?.(allOk);
  }, [allOk, onValidChange]);

  const score = result ? result.score : 0;
  const label = !password ? '' : result ? LABELS[password.length < PASSWORD_MIN_LENGTH ? Math.min(score, 1) : score] : 'Checking...';
  return (
    <div className="lc-meter">
      <div className="lc-bar" role="progressbar" aria-label="Password strength" aria-valuemin={0} aria-valuemax={100} aria-valuenow={result?.percent ?? 0} aria-valuetext={label || 'Empty'}>
        <i data-s={score} style={{ width: `${result?.percent ?? 0}%` }} />
      </div>
      <div className="lc-meter-row" aria-live="polite">
        <span>Strength</span>
        <span>{label}</span>
      </div>
      <ul className="lc-rules">
        {rules.map((r) => (
          <li key={r.text} data-ok={r.ok}>
            <span>
              {r.text}
              <span className="sr-only">{r.ok ? ': done' : ': not yet'}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="lc-tip">{result && !allOk ? (result.tip ?? '') : password ? '' : 'Tip: a few random words make a strong password.'}</p>
    </div>
  );
}
