/*
 * TerminalCard({ title: string; label?: string; children; className?: string })
 *   The frosted-glass card with a terminal title bar (three dots plus `title`, e.g. "~/auth/session - zsh") and a light
 *   sweeping around its border. `label` is the accessible name (defaults to "Account"). Add className "lc-wide" for 460px.
 * StepLabel({ children })
 *   The "// step" code-comment label with a blinking cursor, e.g. <StepLabel><b>authenticate</b>(user)</StepLabel>.
 * BrandMark()
 *   The small ring-and-dot mark with the word "Link-C".
 * Place inside <AuthShell> (or any element with class lc-main) so the card sits above SkyBackground.
 */
import type { ReactNode } from 'react';
import './auth.css';

export function TerminalCard({ title, label = 'Account', children, className = '' }: { title: string; label?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`lc-card glass ${className}`.trim()} aria-label={label}>
      <div className="lc-tb" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

export default TerminalCard;

export function StepLabel({ children }: { children: ReactNode }) {
  return (
    <p className="lc-cm" aria-hidden="true">
      {'// '}
      {children}
    </p>
  );
}

export function BrandMark() {
  return (
    <div className="lc-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <defs>
          <linearGradient id="lc-mark-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--a2)" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="12" fill="none" stroke="url(#lc-mark-g)" strokeWidth="2" />
        <circle cx="16" cy="16" r="4" fill="url(#lc-mark-g)" />
        <circle cx="26" cy="12" r="2.4" fill="currentColor" />
      </svg>
      <span>Link-C</span>
    </div>
  );
}
