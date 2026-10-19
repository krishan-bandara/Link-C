'use client';

import { useEffect } from 'react';
import { FOCUS } from './ui';
import './chat.css';
import { useDialogFocus } from './useDialogFocus';

// WhatsApp-style delete choices. My own message: delete for everyone or for me. Someone else's: for me only.
export default function DeleteDialog({
  mine,
  scope,
  name,
  busy,
  onDelete,
  onCancel,
}: {
  mine: boolean;
  scope: 'me' | 'all'; // the menu item that opened the dialog
  name: string;
  busy?: boolean;
  onDelete: (scope: 'me' | 'all') => void;
  onCancel: () => void;
}) {
  const dlg = useDialogFocus<HTMLDivElement>();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);

  const title = mine ? 'Delete message?' : 'Delete for me?';
  const forMe = `It is removed from this chat on your devices only. ${name} still has it.`;
  const forAll = 'It is removed for both of you and cannot be undone.';
  const btn = `w-full rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${FOCUS}`;
  const meBtn = `${btn} text-main hover:bg-panel-2`;
  const allBtn = `${btn} bg-danger text-white shadow-lg shadow-black/20 hover:brightness-110 active:scale-95`;

  return (
    <div ref={dlg} className="cv-backdrop fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="cv-surface cv-pop w-full max-w-sm rounded-2xl p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {mine ? (
          <ul className="mt-1 space-y-1 text-sm text-muted">
            <li>
              <span className="font-medium text-main">Delete for everyone:</span> {forAll}
            </li>
            <li>
              <span className="font-medium text-main">Delete for me:</span> {forMe}
            </li>
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">{forMe}</p>
        )}
        <div className="mt-5 flex flex-col gap-1.5">
          {mine && (
            <button type="button" onClick={() => onDelete('all')} disabled={busy} className={allBtn} autoFocus={scope === 'all'}>
              Delete for everyone
            </button>
          )}
          <button type="button" onClick={() => onDelete('me')} disabled={busy} className={mine ? meBtn : allBtn} autoFocus={scope === 'me'}>
            Delete for me
          </button>
          <button type="button" onClick={onCancel} className={`${btn} text-muted hover:bg-panel-2`}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
