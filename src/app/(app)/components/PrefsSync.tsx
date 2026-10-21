'use client';

import { useEffect } from 'react';
import { ACCENT_COOKIE, PACK_COOKIE, THEME_COOKIE, applyTheme, type PackId, type Theme } from '@/lib/theme';

function cookie(name: string) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** On a new device the cookies are missing or stale: adopt the saved choice (mode, accent and pack) so it follows the person around. */
export default function PrefsSync({ theme, accent, pack }: { theme: Theme; accent: string; pack: PackId | null }) {
  useEffect(() => {
    if (cookie(THEME_COOKIE) !== theme || cookie(ACCENT_COOKIE) !== accent || (cookie(PACK_COOKIE) ?? '') !== (pack ?? '')) {
      applyTheme(theme, accent, pack);
    }
  }, [theme, accent, pack]);
  return null;
}
