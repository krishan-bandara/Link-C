'use client';
/*
 * PasswordField({ id, label, value, onChange(value: string), autoComplete, describedBy?, invalid?, autoFocus?, name? })
 *   Labelled password input with a Show/Hide button and a "Caps Lock is on" hint. 16px text (no iOS zoom).
 *   autoComplete: 'current-password' for sign-in, 'new-password' for create/confirm.
 */
import { useState } from 'react';
import './auth.css';

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  describedBy,
  invalid,
  autoFocus,
  name,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  describedBy?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  name?: string;
}) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const capsId = `${id}-caps`;
  return (
    <div className="lc-field">
      <label className="lc-label" htmlFor={id}>
        {label}
      </label>
      <div className="lc-pw">
        <input
          id={id}
          name={name ?? id}
          className="lc-input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
          onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
          onBlur={() => setCaps(false)}
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={[describedBy, capsId].filter(Boolean).join(' ')}
        />
        <button type="button" className="lc-eye" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <p id={capsId} className="lc-hint warn" aria-live="polite">
        {caps ? 'Caps Lock is on' : ''}
      </p>
    </div>
  );
}
