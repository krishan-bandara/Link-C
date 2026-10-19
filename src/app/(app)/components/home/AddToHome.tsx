'use client';

import { useEffect, useState } from 'react';
import { Share, Smartphone, X } from 'lucide-react';
import '../../home.css';

const KEY = 'linkc-a2hs-dismissed';

/** Phone-only hint to install the app. Hidden when already installed (standalone) or after being dismissed. */
export default function AddToHome() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === '1';
    } catch {
      /* storage blocked: just show it */
    }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setShow(!standalone && !dismissed);
  }, []);

  if (!show) return null;
  return (
    <aside className="hm-a2hs glass rise md:!hidden" aria-label="Add to Home Screen">
      <span className="ui-icon-chip" style={{ height: '2.5rem', width: '2.5rem', borderRadius: '0.9rem' }}>
        <Smartphone className="h-5 w-5" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">Add Link-C to your Home Screen</span>
        <span className="block text-muted">
          {ios ? (
            <>
              Tap <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Share" />, then &ldquo;Add to Home Screen&rdquo;.
            </>
          ) : (
            <>Open your browser menu, then choose &ldquo;Add to Home screen&rdquo;.</>
          )}
        </span>
      </p>
      <button
        type="button"
        className="ui-icon-btn ui-icon-btn-sm shrink-0 !h-11 !w-11"
        aria-label="Dismiss"
        onClick={() => {
          setShow(false);
          try {
            localStorage.setItem(KEY, '1');
          } catch {
            /* ignore */
          }
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
