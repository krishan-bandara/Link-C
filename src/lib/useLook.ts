'use client';

import { useContext, useEffect, useState } from 'react';
import { LookContext } from '@/lib/LookProvider';
import { safeDecode } from '@/lib/theme';
import { DEFAULT_LOOK, LOOK_COOKIE, LOOK_EVENT, parseLook, type Look } from '@/lib/look';

function fromCookie(): Look {
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOOK_COOKIE}=([^;]*)`));
  return parseLook(m ? safeDecode(m[1]) : null);
}

/** The member's look switches (search, pills, ticks, tabs). Starts with the default so server and first client render agree. */
export function useLook(): Look {
  const ctx = useContext(LookContext);
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  useEffect(() => {
    if (ctx) return; // the provider already supplies the server look and live updates
    setLook(fromCookie());
    const on = (e: Event) => setLook(parseLook((e as CustomEvent).detail));
    window.addEventListener(LOOK_EVENT, on);
    return () => window.removeEventListener(LOOK_EVENT, on);
  }, [ctx]);
  return ctx ?? look;
}
