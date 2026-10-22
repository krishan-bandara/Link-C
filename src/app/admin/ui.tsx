'use client';

import { useActionState, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon, btnCls, btnDangerCls, btnGhostCls, inputCls } from './kit';
import { useNotices } from './notices';

// Stable shared helpers (also importable from './kit', which is safe in server components: prefer that for the class strings).
export { Badge, PageHeader, btnCls, btnDangerCls, btnGhostCls, cardCls, inputCls } from './kit';
export type { Tone } from './kit';

export type ActionState = { ok?: boolean; message?: string; link?: string; expiresAt?: string } | null;
export type AdminAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Submit button. While the action runs it keeps its size (no layout jump) and shows a shimmer. */
export function Submit({
  children,
  className = btnCls,
  ...rest
}: { children: ReactNode; className?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className' | 'children'>) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} type="submit" disabled={pending || rest.disabled} aria-busy={pending} data-pending={pending || undefined} className={className}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="ad-field">
      <span className="ad-label">{label}</span>
      {children}
      {hint && <span className="ad-hint">{hint}</span>}
    </label>
  );
}

/** Sticky bar at the bottom of a form with helper text and the save button. */
export function SaveBar({ hint, children }: { hint?: string; children: ReactNode }) {
  return (
    <div className="ad-savebar">
      <p className="ad-savebar-hint">{hint ?? 'Changes apply when you save.'}</p>
      {children}
    </div>
  );
}

/** A native modal dialog styled as frosted glass. Controlled by `open`. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="ad-dialog ad-dialog-wide"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ad-dialog-body">
        <div className="ad-dialog-head">
          <h2 id={titleId} className="ad-dialog-title">
            {title}
          </h2>
          <button type="button" className="ad-btn ad-btn-ghost ad-btn-icon" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** The three-dots menu: a glass popover that stays mounted (so open forms keep their state) and closes on Escape or an outside click. */
export function Popover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // Keep the panel inside the visible area (not cut off on the left, not under the sidebar).
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.translate = '';
    if (!open) return;
    const side = document.querySelector('.ad-side');
    const minLeft = (side && getComputedStyle(side).display !== 'none' ? side.getBoundingClientRect().right : 0) + 8;
    const r = el.getBoundingClientRect();
    if (r.left < minLeft) el.style.translate = `${Math.ceil(minLeft - r.left)}px 0`;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="ad-popwrap">
      <button
        type="button"
        className="ad-btn ad-btn-ghost ad-btn-icon"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" size={18} />
      </button>
      <div ref={panelRef} id={panelId} className="ad-pop" role="dialog" aria-label={label} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/**
 * A form bound to a server action with success/error feedback.
 * Feedback goes to the toast area (and one-time links to the link banner) so cards never jump; without the provider it is shown inline.
 * `confirm` opens an accessible modal dialog before the action runs.
 * `inline` lets the form sit inside a flex row of buttons.
 * `onSuccess` runs after a successful result.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  confirmLabel = 'Yes, continue',
  danger,
  reset,
  inline,
  onSuccess,
}: {
  action: AdminAction;
  children: ReactNode;
  className?: string;
  confirm?: string;
  confirmLabel?: string;
  danger?: boolean;
  reset?: boolean;
  inline?: boolean;
  onSuccess?: () => void;
}) {
  const notices = useNotices();
  const noticesRef = useRef(notices);
  useEffect(() => {
    noticesRef.current = notices;
  });
  const [state, formAction] = useActionState<Awaited<ReturnType<AdminAction>> | null, FormData>(async (prev, fd) => {
    const r = await action(prev, fd);
    const n = noticesRef.current; // raised here, not in an effect: the card may be gone after the page refreshes
    if (n && r) {
      if (r.message) n.notify(!!r.ok, r.message);
      if (r.link) n.showLink({ link: r.link, expiresAt: r.expiresAt });
    }
    return r;
  }, null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmed = useRef(false);
  const [resetCount, setResetCount] = useState(0);
  const titleId = useId();
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      onSuccessRef.current?.();
      setResetCount((n) => n + 1);
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        if (!confirm) return;
        if (confirmed.current) {
          confirmed.current = false;
          return;
        }
        e.preventDefault();
        dialogRef.current?.showModal();
      }}
      key={reset ? resetCount : 'form'}
      className={inline ? `contents ${className ?? ''}` : className}
    >
      {children}
      {confirm && (
        <dialog ref={dialogRef} aria-labelledby={titleId} className="ad-dialog">
          <div className="ad-dialog-body">
            <p id={titleId} className="text-sm leading-relaxed">
              {confirm}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnGhostCls} onClick={() => dialogRef.current?.close()} autoFocus>
                Cancel
              </button>
              <button
                type="button"
                className={danger ? btnDangerCls : btnCls}
                onClick={() => {
                  confirmed.current = true;
                  dialogRef.current?.close();
                  formRef.current?.requestSubmit();
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </dialog>
      )}
      {!notices && (
        <div aria-live="polite" className={`empty:hidden ${inline ? 'w-full basis-full' : ''}`}>
          {state?.message && (
            <p className={`mt-2 text-sm ${state.ok ? 'text-accent' : 'text-danger'}`} role={state.ok ? 'status' : 'alert'}>
              {state.message}
            </p>
          )}
        </div>
      )}
    </form>
  );
}

export function SmsTemplateField({ initial, name = 'template_text', label = 'SMS text' }: { initial: string; name?: string; label?: string }) {
  const [v, setV] = useState(initial);
  return (
    <div className="space-y-1">
      <textarea
        name={name}
        value={v}
        onChange={(e) => setV(e.target.value)}
        maxLength={160}
        rows={3}
        className={inputCls}
        aria-label={label}
      />
      <div className="flex justify-between gap-3 text-xs text-muted">
        <span className="min-w-0 truncate">Preview: {v || '(empty)'}</span>
        <span className={v.length >= 150 ? 'font-semibold text-danger' : ''}>{v.length}/160</span>
      </div>
    </div>
  );
}
