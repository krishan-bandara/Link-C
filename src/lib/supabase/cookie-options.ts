// Session cookie settings shared by the browser, server and middleware Supabase clients.
// The library default is a 400-day cookie that is not Secure. The browser client has to read this cookie, so it cannot be
// HttpOnly; we shorten its life (the app signs people out after 1 minute idle anyway) and mark it Secure on https.
export function sessionCookieOptions(secure: boolean) {
  return { maxAge: 60 * 60 * 24, sameSite: 'lax' as const, path: '/', secure };
}

/** Server side: Secure whenever the public address is https. */
export const serverCookieOptions = () => sessionCookieOptions((process.env.APP_URL ?? '').startsWith('https://'));
