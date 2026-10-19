import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { ACTIVITY_COOKIE, checkActivityCookie } from '@/lib/idle';

function buildCsp(nonce: string) {
  const dev = process.env.NODE_ENV !== 'production';
  let supa = '';
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    supa = `${u.origin} wss://${u.host}`;
  } catch {
    /* not configured */
  }
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `media-src 'self' blob:`,
    `font-src 'self'`,
    `connect-src 'self' ${supa} wss://*.livekit.cloud https://*.livekit.cloud`.replace(/\s+/g, ' '),
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ');
}

const PUBLIC_PAGES = ['/login', '/auth/confirm', '/invite'];

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);

  const { user: sessionUser, supabase } = await updateSession(request, response);
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');
  let user = sessionUser;
  let idleLogout = false;

  // Inactivity logout, server side. A session is only honoured while the signed activity cookie is recent.
  // /api/activity is exempt: it is the call that creates or refreshes the cookie (and checks for a fresh sign-in).
  if (user && pathname !== '/api/activity') {
    const fresh = await checkActivityCookie(request.cookies.get(ACTIVITY_COOKIE)?.value, user.id);
    const signingIn = pathname === '/auth/confirm' || pathname.startsWith('/auth/confirm/');
    if (!fresh && !signingIn) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {}); // revoke this session; the cookies are cleared on the response
      response.cookies.set(ACTIVITY_COOKIE, '', { path: '/', maxAge: 0 });
      user = null;
      idleLogout = true;
    }
  }

  if (!isApi) {
    const isPublic = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));
    let target: string | null = null;
    if (!user && !isPublic) {
      // remember where they were going (relative paths only) so login can send them back
      const back = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
      target = idleLogout ? '/login?reason=idle' : `/login${back}`;
    }
    else if (user && pathname === '/login') target = '/';
    if (target) {
      const redirect = NextResponse.redirect(new URL(target, request.url));
      redirect.headers.set('Content-Security-Policy', csp);
      for (const c of response.cookies.getAll()) redirect.cookies.set(c);
      return redirect;
    }
  }
  if (isApi && idleLogout) {
    const out = NextResponse.json({ error: 'Signed out after inactivity' }, { status: 401, headers: { 'Content-Security-Policy': csp } });
    for (const c of response.cookies.getAll()) out.cookies.set(c);
    return out;
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon-.*\\.png|apple-touch-icon\\.png|manifest\\.webmanifest|sw\\.js).*)',
  ],
};
