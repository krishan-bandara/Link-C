'use client';

import { useEffect } from 'react';
import { FOCUS } from './ui';
import './chat.css';
import { useDialogFocus } from './useDialogFocus';

export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dlg = useDialogFocus<HTMLDivElement>();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);
  return (
    <div ref={dlg} className="cv-backdrop fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="cv-surface cv-pop w-full max-w-sm rounded-2xl p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {body && <p className="mt-1 text-sm text-muted">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={`rounded-xl px-4 py-2 text-sm text-muted transition-colors hover:bg-panel-2 ${FOCUS}`} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white shadow-lg shadow-black/20 transition hover:brightness-110 active:scale-95 disabled:opacity-50 ${FOCUS}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
