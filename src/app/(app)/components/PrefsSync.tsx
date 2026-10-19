'use client';

import { useEffect } from 'react';
import { ACCENT_COOKIE, THEME_COOKIE, applyTheme, type Theme } from '@/lib/theme';

function cookie(name: string) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** On a new device the cookies are missing or stale: adopt the saved choice so it follows the person around. */
export default function PrefsSync({ theme, accent }: { theme: Theme; accent: string }) {
  useEffect(() => {
    if (cookie(THEME_COOKIE) !== theme || cookie(ACCENT_COOKIE) !== accent) applyTheme(theme, accent);
  }, [theme, accent]);
  return null;
}
