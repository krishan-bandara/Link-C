'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * For modal dialogs built from divs: moves focus into the dialog when it opens, keeps Tab inside it, and gives focus back to
 * whatever opened it when it closes. Put the returned ref on the element that has role="dialog".
 */
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // Remembered while rendering, BEFORE the dialog's own autoFocus runs, so this is really the button that opened it.
  const openerRef = useRef<HTMLElement | null>(null);
  if (openerRef.current === null && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    openerRef.current = document.activeElement;
  }
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = openerRef.current;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!root.contains(document.activeElement)) {
      const first = items()[0];
      if (first) first.focus();
      else {
        root.tabIndex = -1;
        root.focus();
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);
  return ref;
}
