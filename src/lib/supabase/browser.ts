import { createBrowserClient } from '@supabase/ssr';
import { sessionCookieOptions } from './cookie-options';

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: sessionCookieOptions(typeof location !== 'undefined' && location.protocol === 'https:') },
  );
}
