'use client';

import { useEffect } from 'react';
import { LOOK_COOKIE, applyLook, serializeLook, type Look } from '@/lib/look';
import { ACCENT_COOKIE, PACK_COOKIE, THEME_COOKIE, applyTheme, safeDecode, type PackId, type Theme } from '@/lib/theme';

function cookie(name: string) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? safeDecode(m[1]) : null;
}

/** On a new device the cookies are missing or stale: adopt the saved choice (mode, accent and pack) so it follows the person around. */
export default function PrefsSync({ theme, accent, pack, look }: { theme: Theme; accent: string; pack: PackId | null; look: Look }) {
  useEffect(() => {
    if (cookie(THEME_COOKIE) !== theme || cookie(ACCENT_COOKIE) !== accent || (cookie(PACK_COOKIE) ?? '') !== (pack ?? '')) {
      applyTheme(theme, accent, pack);
    }
    if (cookie(LOOK_COOKIE) !== serializeLook(look)) applyLook(look);
  }, [theme, accent, pack, look]);
  return null;
}
