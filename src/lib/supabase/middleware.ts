import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { serverCookieOptions } from './cookie-options';

/**
 * Refreshes the auth cookie and returns the user (validated with the auth server, not just the cookie)
 * together with the client, so the caller can end the session (inactivity logout).
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: serverCookieOptions(),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const c of list) {
            request.cookies.set(c.name, c.value);
            response.cookies.set(c.name, c.value, c.options);
          }
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  return { user: data.user, supabase };
}
